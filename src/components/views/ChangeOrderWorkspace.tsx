import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Briefcase, Check, ChevronLeft, Copy, Plus, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { GoToProjectLink } from "@/components/common/GoToProjectLink";
import { LineItemSectionCard } from "@/components/common/LineItemSectionCard";
import { LinkedDocumentBar } from "@/components/common/LinkedDocumentBar";
import { useSectionReorder } from "@/hooks/use-section-reorder";
import { useSectionCollapse } from "@/hooks/use-section-collapse";
import { revokeLocalImageUrls, type DraftLineItem, type DraftLineSection } from "@/lib/draftLineItem";
import { changeOrderStatusMeta } from "@/lib/statusMeta";
import { computeProjectImpact, scheduleImpactLabel } from "@/lib/changeOrderImpact";
import {
  getProject,
  listQuotes,
  listChangeOrders,
  listInvoices,
  listMaterials,
  listMaterialsSheets,
  linkMaterialSheetToChangeOrder,
  listCategories,
  getQuoteDefaults,
  QUOTE_DEFAULTS_FALLBACK,
  updateChangeOrder,
  addChangeOrderSection,
  updateChangeOrderSection,
  deleteChangeOrderSection,
  addChangeOrderItem,
  updateChangeOrderItem,
  deleteChangeOrderItem,
  uploadChangeOrderItemImage,
  deleteChangeOrderItemImage,
  createInvoice,
  generateShareLink,
  logProjectEvent,
  CHANGE_ORDER_REASONS,
  type ChangeOrder,
  type ChangeOrderReason,
} from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

const NONE = "__none__";
const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

// ---------------------------------------------------------------------------
// Draft model — same "edit locally, diff and write on Save" pattern as the
// Quote builder (QuoteWorkspace.tsx). A change order's line items need
// nothing beyond the shared DraftLineItem/DraftLineSection shape — no
// is_optional/client_selected concept exists here.
// ---------------------------------------------------------------------------

interface ChangeOrderDraft {
  sections: DraftLineSection[];
  title: string;
  description: string;
  reason: ChangeOrderReason | null;
  /** null/"" = no schedule change. Kept as a string while editing, same
   * "half-typed number" reasoning as every other numeric field in this app. */
  scheduleImpactDays: string;
}

const seed = (co: ChangeOrder): ChangeOrderDraft => ({
  sections: (co.change_order_sections ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    items: (s.change_order_items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? "",
      price: Number(i.price),
      quantity: i.quantity == null ? 1 : Number(i.quantity),
      unit: i.unit ?? "",
      category_id: i.category_id ?? null,
      images: (i.change_order_item_images ?? []).map((img) => ({
        id: img.id,
        storage_path: img.storage_path,
        file: null,
        previewUrl: null,
        sort_order: img.sort_order,
      })),
    })),
  })),
  title: co.title,
  description: co.description ?? "",
  reason: co.reason,
  scheduleImpactDays: co.schedule_impact_days != null ? String(co.schedule_impact_days) : "",
});

const lineTotal = (i: DraftLineItem) => i.price * i.quantity;
const sectionSubtotal = (s: DraftLineSection) => s.items.reduce((sum, i) => sum + lineTotal(i), 0);

interface ChangeOrderWorkspaceProps {
  changeOrder: ChangeOrder;
  backHref: string;
  backLabel: string;
}

/**
 * The full Change Order builder — same section/line-item editing UI as the
 * Quote builder (LineItemSectionCard/LineItemRow, imported not copied), a
 * dark Client/Project header (read-only here — a change order always
 * belongs to exactly one project, unlike a quote), Reason/Notes/Schedule
 * impact fields, a CO Totals card, and the "Project impact" before/after
 * panel. Project financials come from computeProjectImpact()
 * (changeOrderImpact.ts), which itself is built entirely from the same
 * primitives (projectContractValue's own pieces) the project page and
 * Dashboard already use — one calculation path, not a second one.
 */
export function ChangeOrderWorkspace({ changeOrder, backHref, backLabel }: ChangeOrderWorkspaceProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const projectId = changeOrder.project_id;
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineComment, setDeclineComment] = useState("");

  const { data: project } = useQuery({ queryKey: ["projects", projectId], queryFn: () => getProject(projectId) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: quoteDefaults = QUOTE_DEFAULTS_FALLBACK } = useQuery({
    queryKey: ["quote-defaults"],
    queryFn: getQuoteDefaults,
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: projectId }], queryFn: () => listQuotes(projectId) });
  const { data: projectChangeOrders = [] } = useQuery({
    queryKey: ["change-orders", { project: projectId }],
    queryFn: () => listChangeOrders(projectId),
  });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", { project: projectId }], queryFn: () => listInvoices(projectId) });
  const { data: materials = [] } = useQuery({ queryKey: ["materials", { project: projectId }], queryFn: () => listMaterials(projectId) });
  const { data: sheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: projectId }],
    queryFn: () => listMaterialsSheets(projectId),
  });
  const linkedSheet = sheets.find((s) => s.id === changeOrder.material_sheet_id);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const linkSheetMut = useMutation({
    mutationFn: (sheetId: string) => linkMaterialSheetToChangeOrder(changeOrder.id, sheetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-order", changeOrder.id] });
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      setLinkSheetOpen(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });
  const unlinkSheetMut = useMutation({
    mutationFn: () => linkMaterialSheetToChangeOrder(changeOrder.id, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change-order", changeOrder.id] });
      qc.invalidateQueries({ queryKey: ["change-orders"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // --- draft state --------------------------------------------------------
  const [draft, setDraft] = useState<ChangeOrderDraft>(() => seed(changeOrder));
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(changeOrder));
  }, [changeOrder]);

  const markDirty = () => {
    dirty.current = true;
  };
  const edit = (fn: (d: ChangeOrderDraft) => ChangeOrderDraft) => {
    markDirty();
    setDraft(fn);
  };
  const setSections = (fn: (s: DraftLineSection[]) => DraftLineSection[]) =>
    edit((d) => ({ ...d, sections: fn(d.sections) }));
  const { moveSection, moveItem, onDragEnd } = useSectionReorder<DraftLineItem, DraftLineSection>(setSections);
  const { isCollapsed, toggle: toggleCollapse, expand: expandSection, collapseAll, expandAll } = useSectionCollapse();
  const [isDraggingItem, setIsDraggingItem] = useState(false);

  const discard = () => {
    for (const s of draft.sections) for (const i of s.items) revokeLocalImageUrls(i);
    dirty.current = false;
    setDraft(seed(changeOrder));
  };

  // --- local mutators ------------------------------------------------------
  const addSection = () => setSections((s) => [...s, { id: tmpId(), name: "", items: [] }]);
  const renameSection = (sid: string, name: string) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, name } : x)));
  const removeSection = (sid: string) =>
    setSections((s) => {
      const target = s.find((x) => x.id === sid);
      if (target) for (const i of target.items) revokeLocalImageUrls(i);
      return s.filter((x) => x.id !== sid);
    });
  const addItem = (sid: string) =>
    setSections((s) =>
      s.map((x) =>
        x.id === sid
          ? {
              ...x,
              items: [
                ...x.items,
                { id: tmpId(), name: "", description: "", price: 0, quantity: 1, unit: "ea", category_id: null, images: [] },
              ],
            }
          : x,
      ),
    );
  const editItem = (sid: string, iid: string, patch: Partial<DraftLineItem>) =>
    setSections((s) =>
      s.map((x) => (x.id === sid ? { ...x, items: x.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) } : x)),
    );
  const removeItem = (sid: string, iid: string) =>
    setSections((s) =>
      s.map((x) => {
        if (x.id !== sid) return x;
        const removed = x.items.find((i) => i.id === iid);
        if (removed) revokeLocalImageUrls(removed);
        return { ...x, items: x.items.filter((i) => i.id !== iid) };
      }),
    );

  // --- derived amounts (from the draft) ------------------------------------
  const subtotal = draft.sections.reduce((sum, s) => sum + sectionSubtotal(s), 0);
  const taxAmount = (subtotal * quoteDefaults.sales_tax_pct) / 100;
  const total = subtotal + taxAmount;
  const itemCount = draft.sections.reduce((n, s) => n + s.items.length, 0);
  const scheduleImpactDays = draft.scheduleImpactDays.trim() ? parseInt(draft.scheduleImpactDays, 10) || 0 : 0;

  const impact = project
    ? computeProjectImpact({
        project,
        quotes,
        otherChangeOrders: projectChangeOrders.filter((co) => co.id !== changeOrder.id),
        invoices,
        materialsSections: materials,
        thisChangeOrderTotal: changeOrder.status === "approved" ? Number(changeOrder.amount) : total,
        thisChangeOrderItemCount: itemCount,
        draftScheduleImpactDays: changeOrder.status === "approved" ? changeOrder.schedule_impact_days : scheduleImpactDays,
      })
    : null;

  const isDirty = dirty.current;
  const locked = changeOrder.status === "approved" || changeOrder.status === "declined";
  const meta = changeOrderStatusMeta(changeOrder.status);
  const clientName = changeOrder.project?.client?.name ?? "No client";
  const projectName = changeOrder.project?.name ?? "Project";

  // --- server sync ----------------------------------------------------------
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["change-order", changeOrder.id] });
    qc.invalidateQueries({ queryKey: ["change-orders"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["projects", projectId] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const saveMut = useMutation({
    mutationFn: async () => {
      const serverSections = new Map((changeOrder.change_order_sections ?? []).map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.sections.map((s) => s.id));

      for (const s of changeOrder.change_order_sections ?? []) {
        if (!draftSectionIds.has(s.id)) await deleteChangeOrderSection(s.id);
      }

      for (let si = 0; si < draft.sections.length; si++) {
        const ds = draft.sections[si];
        const name = ds.name.trim() || "New section";
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await addChangeOrderSection(changeOrder.id, { name, sort_order: si });
          sectionId = created.id;
        } else if (server.name !== name || server.sort_order !== si) {
          await updateChangeOrderSection(server.id, { name, sort_order: si });
        }

        const serverItems = new Map((server?.change_order_items ?? []).map((i) => [i.id, i]));
        const draftItemIds = new Set(ds.items.filter((i) => !isTmp(i.id)).map((i) => i.id));

        if (server) {
          for (const i of server.change_order_items) {
            if (!draftItemIds.has(i.id)) await deleteChangeOrderItem(i.id);
          }
        }

        for (let ii = 0; ii < ds.items.length; ii++) {
          const di = ds.items[ii];
          const desc = di.description.trim() || null;
          const unit = di.unit.trim() || null;
          const srv = serverItems.get(di.id);
          let itemId: string;

          if (!srv) {
            const created = await addChangeOrderItem(sectionId, {
              name: di.name,
              description: desc,
              price: di.price,
              quantity: di.quantity,
              unit,
              sort_order: ii,
              category_id: di.category_id,
            });
            itemId = created.id;
          } else {
            itemId = srv.id;
            if (
              srv.name !== di.name ||
              (srv.description ?? null) !== desc ||
              Number(srv.price) !== di.price ||
              (srv.quantity == null ? 1 : Number(srv.quantity)) !== di.quantity ||
              (srv.unit ?? null) !== unit ||
              srv.sort_order !== ii ||
              (srv.category_id ?? null) !== di.category_id
            ) {
              await updateChangeOrderItem(srv.id, {
                name: di.name,
                description: desc,
                price: di.price,
                quantity: di.quantity,
                unit,
                sort_order: ii,
                category_id: di.category_id,
              });
            }
          }

          const serverImages = srv?.change_order_item_images ?? [];
          const draftImageIds = new Set(di.images.filter((img) => img.storage_path).map((img) => img.id));
          for (const img of serverImages) {
            if (!draftImageIds.has(img.id)) await deleteChangeOrderItemImage(img);
          }
          for (let ki = 0; ki < di.images.length; ki++) {
            const dimg = di.images[ki];
            if (dimg.file) {
              await uploadChangeOrderItemImage(itemId, dimg.file, ki);
              if (dimg.previewUrl) URL.revokeObjectURL(dimg.previewUrl);
            }
          }
        }
      }

      await updateChangeOrder(changeOrder.id, {
        title: draft.title.trim() || "Untitled change order",
        description: draft.description.trim() || null,
        reason: draft.reason,
        schedule_impact_days: draft.scheduleImpactDays.trim() ? scheduleImpactDays : null,
        amount: subtotal,
      });
    },
    onSuccess: () => {
      dirty.current = false;
      invalidate();
      toast({ title: "Change order saved" });
    },
    onError,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const token = changeOrder.share_token ?? (await generateShareLink("change_orders", changeOrder.id));
      await updateChangeOrder(changeOrder.id, { status: "sent" });
      return token;
    },
    onSuccess: (token) => {
      invalidate();
      void logProjectEvent(projectId, "change_order_sent", `Change order sent · ${formatCurrency(subtotal)}`);
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      setShareUrl(`${window.location.origin}/change-order/${token}`);
    },
    onError,
  });

  const previewMut = useMutation({
    mutationFn: async () => changeOrder.share_token ?? generateShareLink("change_orders", changeOrder.id),
    onSuccess: (token) => {
      invalidate();
      window.open(`${window.location.origin}/change-order/${token}`, "_blank", "noopener,noreferrer");
    },
    onError,
  });

  const ensureLinkMut = useMutation({
    mutationFn: async (intent: "share" | "copy") => ({
      token: changeOrder.share_token ?? (await generateShareLink("change_orders", changeOrder.id)),
      intent,
    }),
    onSuccess: ({ token, intent }) => {
      invalidate();
      const url = `${window.location.origin}/change-order/${token}`;
      if (intent === "share") {
        setShareUrl(url);
      } else {
        navigator.clipboard.writeText(url).then(
          () => toast({ title: "Link copied" }),
          () => toast({ title: "Couldn't copy link", variant: "destructive" }),
        );
      }
    },
    onError,
  });

  // Contractor's own one-click approve/decline — for a verbal/in-person OK,
  // same capability the old flat-form change orders page had, now living on
  // a "sent" change order in the builder instead of a list-row button.
  const approveMut = useMutation({
    mutationFn: () => updateChangeOrder(changeOrder.id, { status: "approved", approved_at: new Date().toISOString() }),
    onSuccess: () => {
      invalidate();
      void logProjectEvent(projectId, "change_order_approved", `Change order approved: ${changeOrder.title} · ${formatCurrency(Number(changeOrder.amount))}`);
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      toast({ title: "Change order approved" });
    },
    onError,
  });

  const declineMut = useMutation({
    mutationFn: () =>
      updateChangeOrder(changeOrder.id, {
        status: "declined",
        // approved_at intentionally left as-is; decline fields live in
        // the DB row directly via a raw client-side update elsewhere if
        // ever needed — the common case (contractor-side decline) needs
        // no signature/comment capture beyond the log entry below.
      }),
    onSuccess: () => {
      invalidate();
      void logProjectEvent(projectId, "change_order_rejected", `Change order declined: ${changeOrder.title}`);
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      setDeclineOpen(false);
      toast({ title: "Change order declined" });
    },
    onError,
  });

  const createInvoiceMut = useMutation({
    mutationFn: () =>
      createInvoice({
        project_id: projectId,
        change_order_id: changeOrder.id,
        amount: Number(changeOrder.amount),
        notes: `Change order: ${changeOrder.title}`,
      }),
    onSuccess: (invoice) => navigate(`/invoices/${invoice.id}`),
    onError,
  });

  const canSave = draft.title.trim().length > 0 || itemCount > 0;

  return (
    <div className={cn("animate-fade-in max-w-6xl space-y-5", isDirty && "pb-40 md:pb-28")}>
      <MobilePageHeader
        className="mobile-header-ink"
        title={draft.title || "Change order"}
        subtitle={`${meta.label} · ${clientName}`}
        back={{ to: backHref, label: backLabel }}
        pills={
          <>
            <span className="badge-status !bg-white/20 !text-sidebar-foreground">{pluralize(itemCount, "item")}</span>
            <span className="badge-status !bg-white/15 !text-sidebar-foreground/90">{meta.label}</span>
          </>
        }
      />

      {/* Desktop header */}
      <div className="hidden md:block">
        <BackLink to={backHref} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">{backLabel}</BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-muted-subtle">Change order{changeOrder.status === "draft" ? " · Draft" : ""}</div>
            <div className="mt-1 flex items-center gap-2.5">
              <Input
                value={draft.title}
                onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Add retaining wall extension"
                disabled={locked}
                className="h-auto max-w-md border-none bg-transparent px-0 text-[28px] font-bold tracking-tight text-foreground shadow-none focus-visible:ring-0 disabled:opacity-100"
              />
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && <span className="text-xs text-muted-foreground">Save your changes first</span>}
            {!locked && changeOrder.status === "draft" && (
              <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || isDirty || !canSave} className="font-bold">
                {sendMut.isPending ? "Preparing…" : "Send for signature"}
              </Button>
            )}
            {!locked && changeOrder.status === "sent" && (
              <>
                <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={approveMut.isPending}>
                  <X className="mr-1.5 h-4 w-4" />
                  Decline
                </Button>
                <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending} className="font-bold">
                  <Check className="mr-1.5 h-4 w-4" />
                  {approveMut.isPending ? "Approving…" : "Approve"}
                </Button>
              </>
            )}
            {changeOrder.status === "approved" && (
              <Button onClick={() => createInvoiceMut.mutate()} disabled={createInvoiceMut.isPending} className="font-bold">
                {createInvoiceMut.isPending ? "Creating…" : "Create invoice"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Client / Project — inherited from the project, not editable here */}
      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="grid gap-2.5 bg-foreground p-4 sm:grid-cols-2">
          <div className="flex h-auto items-center gap-2.5 rounded-xl bg-white/[0.08] px-3.5 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground">
              {clientName.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-background/55">Client</span>
            <span className="min-w-0 flex-1 truncate text-right text-[15px] font-bold text-background">{clientName}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex h-auto items-center gap-2.5 rounded-xl bg-white/[0.08] px-3.5 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
                <Briefcase className="h-3.5 w-3.5" />
              </span>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-background/55">Project</span>
              <span className="min-w-0 flex-1 truncate text-right text-[15px] font-bold text-background">{projectName}</span>
            </div>
            <GoToProjectLink projectId={projectId} isDirty={isDirty} tone="dark" className="self-end px-1" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 bg-card p-4">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", changeOrder.share_token ? "bg-primary" : "bg-border")} />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                {changeOrder.share_token ? "Client link is live" : "Client link not sent yet"}
              </span>
            </div>
            <div className="truncate rounded-lg bg-muted px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
              {changeOrder.share_token ? `${window.location.origin}/change-order/${changeOrder.share_token}` : "Generated the first time you send or preview this change order"}
            </div>
          </div>
          <div className="flex shrink-0 gap-2.5">
            <button
              type="button"
              onClick={() => ensureLinkMut.mutate("share")}
              disabled={isDirty || ensureLinkMut.isPending}
              className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <button
              type="button"
              onClick={() => ensureLinkMut.mutate("copy")}
              disabled={isDirty || ensureLinkMut.isPending}
              aria-label="Copy link"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
        <LinkedDocumentBar
          targetLabel="materials sheet"
          linked={linkedSheet ? { label: `Linked to "${linkedSheet.name}"` } : null}
          onLink={() => setLinkSheetOpen(true)}
          onUnlink={() => unlinkSheetMut.mutate()}
        />
      </div>

      <Dialog open={linkSheetOpen} onOpenChange={setLinkSheetOpen}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>Link a materials sheet</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Approving this change order starts tracking the linked sheet's estimate against real deliveries and usage.
          </p>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {sheets.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No materials sheets on this project yet.</p>
            ) : (
              sheets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => linkSheetMut.mutate(s.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <span className="text-sm font-semibold text-foreground">{s.name}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Left column — sections + reason/notes/schedule */}
        <div className="space-y-4">
          {draft.sections.length === 0 && (
            <div className="stat-card py-12 text-center text-muted-foreground">
              No sections yet. Add a section to build the change order.
            </div>
          )}

          {draft.sections.length > 0 && (
            <div className="flex items-center justify-end gap-3 text-xs font-bold text-primary">
              <button type="button" onClick={() => collapseAll(draft.sections.map((s) => s.id))} className="hover:underline">
                Collapse all
              </button>
              <span className="text-border">|</span>
              <button type="button" onClick={() => expandAll(draft.sections.map((s) => s.id))} className="hover:underline">
                Expand all
              </button>
            </div>
          )}

          {/* Once approved/declined, a change order is a permanent record —
              the fieldset disables every native input/select/textarea/button
              in the section/item tree below in one shot (no readOnly prop
              threading through the shared, quote-also-uses components), and
              the onDragEnd guard stops reordering from writing to the draft
              even if a drag is somehow initiated. */}
          <fieldset disabled={locked} className="contents">
            <DragDropContext
              onDragStart={(start) => setIsDraggingItem(start.type === "item")}
              onDragEnd={(result) => {
                setIsDraggingItem(false);
                if (!locked) onDragEnd(result);
              }}
            >
              <Droppable droppableId="co-sections" type="section">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
                    {draft.sections.map((section, index) => (
                      <Draggable key={section.id} draggableId={section.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                            <LineItemSectionCard
                              section={section}
                              subtotal={sectionSubtotal(section)}
                              categories={categories}
                              onRename={(name) => renameSection(section.id, name)}
                              onDeleteSection={() => removeSection(section.id)}
                              onAddItem={() => addItem(section.id)}
                              onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
                              onDeleteItem={(iid) => removeItem(section.id, iid)}
                              dragHandleProps={dragProvided.dragHandleProps}
                              dragging={dragSnapshot.isDragging}
                              canMoveUp={index > 0}
                              canMoveDown={index < draft.sections.length - 1}
                              onMoveUp={() => moveSection(index, -1)}
                              onMoveDown={() => moveSection(index, 1)}
                              onMoveItem={(itemIndex, direction) => moveItem(section.id, itemIndex, direction)}
                              collapsed={isCollapsed(section.id)}
                              onToggleCollapse={() => toggleCollapse(section.id)}
                              isDraggingItem={isDraggingItem}
                              onAutoExpand={() => expandSection(section.id)}
                              priceLabel="Rate ($, − for credit)"
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </fieldset>

          {!locked && (
            <button
              type="button"
              onClick={addSection}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border bg-card text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" />
              Add section
            </button>
          )}

          <div className="stat-card space-y-5">
            <div className="space-y-2">
              <Label htmlFor="co-reason">Reason</Label>
              <Select
                value={draft.reason ?? NONE}
                onValueChange={(v) => edit((d) => ({ ...d, reason: v === NONE ? null : (v as ChangeOrderReason) }))}
                disabled={locked}
              >
                <SelectTrigger id="co-reason">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {CHANGE_ORDER_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-notes">Notes for the client</Label>
              <Textarea
                id="co-notes"
                value={draft.description}
                placeholder="What's changing and why…"
                disabled={locked}
                onChange={(e) => edit((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-schedule">Schedule impact (working days)</Label>
              <Input
                id="co-schedule"
                type="number"
                step="1"
                inputMode="numeric"
                value={draft.scheduleImpactDays}
                disabled={locked}
                placeholder="0"
                className="w-32"
                onChange={(e) => edit((d) => ({ ...d, scheduleImpactDays: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {scheduleImpactLabel(draft.scheduleImpactDays.trim() ? scheduleImpactDays : null)} — positive adds
                working days, negative saves them.
              </p>
            </div>
          </div>
        </div>

        {/* Right rail — CO totals, then Project impact */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <div className="card-surface p-[18px]">
            <div className="text-base font-bold text-foreground">Change order totals</div>
            <div className="mt-2.5">
              <MoneyRow label="Subtotal" value={formatCurrency(subtotal)} />
              <MoneyRow label={`Sales tax ${quoteDefaults.sales_tax_pct}%`} value={formatCurrency(taxAmount)} />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-3">
              <span className="text-sm font-bold text-foreground">Change order total</span>
              <span className={cn("text-xl font-extrabold tabular-nums", total < 0 ? "text-destructive" : "text-foreground")}>
                {total < 0 ? "−" : ""}
                {formatCurrency(Math.abs(total))}
              </span>
            </div>
          </div>

          {impact && (
            <div className="card-surface p-[18px]">
              <div className="text-base font-bold text-foreground">Project impact</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                <span>Before</span>
                <span>After</span>
              </div>

              <ImpactRow
                label="Original contract"
                before={formatCurrency(impact.originalContract)}
                after={formatCurrency(impact.originalContract)}
              />
              <ImpactRow
                label={`Approved COs (${impact.previouslyApprovedCount})`}
                before={formatCurrency(impact.previouslyApproved)}
                after={formatCurrency(impact.previouslyApproved)}
              />
              <ImpactRow
                label="This change order"
                before="—"
                after={formatCurrency(impact.thisChangeOrder)}
                highlight
              />
              <ImpactRow
                label="Revised contract"
                before={formatCurrency(impact.originalContract + impact.previouslyApproved)}
                after={formatCurrency(impact.revisedContractTotal)}
                strong
              />

              <div className="mt-3 border-t border-hairline pt-3">
                <ImpactRow label="Invoiced to date" before={formatCurrency(impact.invoicedToDate)} after={formatCurrency(impact.invoicedToDate)} />
                <ImpactRow label="Paid to date" before={formatCurrency(impact.paidToDate)} after={formatCurrency(impact.paidToDate)} />
                <ImpactRow
                  label="Remaining to bill"
                  before={formatCurrency(Math.max(0, impact.originalContract + impact.previouslyApproved - impact.invoicedToDate))}
                  after={formatCurrency(impact.remainingToBill)}
                  strong
                />
              </div>

              <div className="mt-3 border-t border-hairline pt-3">
                <ImpactRow
                  label="Est. cost"
                  before={impact.costBefore == null ? "Not available" : formatCurrency(impact.costBefore)}
                  after={impact.costAfter == null ? "Not available" : formatCurrency(impact.costAfter)}
                />
                <ImpactRow
                  label="Margin"
                  before={impact.marginPctBefore == null ? "—" : `${impact.marginPctBefore.toFixed(0)}%`}
                  after={impact.marginPctAfter == null ? "—" : `${impact.marginPctAfter.toFixed(0)}%`}
                />
                {impact.unknownCostItemCount > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-subtle">
                    Cost unknown for {pluralize(impact.unknownCostItemCount, "item")} on this change order — margin
                    after doesn't yet account for its own cost.
                  </p>
                )}
              </div>

              <div className="mt-3 border-t border-hairline pt-3">
                <ImpactRow
                  label="Est. duration"
                  before={impact.estimatedDurationBefore == null ? "Not set" : pluralize(impact.estimatedDurationBefore, "day")}
                  after={impact.estimatedDurationAfter == null ? "Not set" : pluralize(impact.estimatedDurationAfter, "day")}
                />
                <p className="mt-1.5 text-[11px] text-muted-subtle">{scheduleImpactLabel(impact.scheduleImpactDays)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <DraftSaveBar visible={isDirty} onDiscard={discard} onSave={() => saveMut.mutate()} saving={saveMut.isPending} />

      <ShareLinkDialog open={!!shareUrl} onOpenChange={(open) => !open && setShareUrl(null)} url={shareUrl ?? ""} kind="change order" />

      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this change order?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays in the list for the record but never counts toward the contract total.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={declineComment}
            onChange={(e) => setDeclineComment(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => declineMut.mutate()}
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ImpactRow({
  label,
  before,
  after,
  strong,
  highlight,
}: {
  label: string;
  before: string;
  after: string;
  strong?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5", highlight && "rounded-lg bg-primary/5 px-2")}>
      <span className={cn("truncate text-xs", strong ? "font-bold text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-right text-xs tabular-nums", strong ? "font-bold text-foreground" : "text-muted-foreground")}>
        {before}
      </span>
      <span
        className={cn(
          "text-right text-xs tabular-nums",
          highlight ? "font-bold text-primary" : strong ? "font-bold text-foreground" : "text-muted-foreground",
        )}
      >
        {after}
      </span>
    </div>
  );
}
