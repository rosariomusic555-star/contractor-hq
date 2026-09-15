import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Share2,
  Briefcase,
  Copy,
  ImagePlus,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { ClientPickerDialog } from "@/components/common/ClientPicker";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { quoteStatusMeta } from "@/lib/statusMeta";
import { demoQuoteFinancials, demoQuoteTerms, type DemoQuoteTerms } from "@/lib/demoData";
import { compressImageFile } from "@/lib/imageUpload";
import {
  listClients,
  listProjects,
  listMaterials,
  listMaterialsSheets,
  listMaterialsBySheet,
  listQuotes,
  linkQuoteToMaterialSheet,
  listCategories,
  updateProject,
  updateQuote,
  addQuoteSection,
  updateQuoteSection,
  deleteQuoteSection,
  addQuoteItem,
  updateQuoteItem,
  deleteQuoteItem,
  uploadQuoteItemImage,
  deleteQuoteItemImage,
  getSignedImageUrls,
  generateShareLink,
  logProjectEvent,
  materialsCogs,
  getQuoteDefaults,
  QUOTE_DEFAULTS_FALLBACK,
  listProductCatalog,
  listQuickQuoteRates,
  type Quote,
  type Category,
} from "@/lib/api";
import { QuickQuoteDialog } from "@/components/quotes/QuickQuoteDialog";
import { QuickQuoteFormDialog, type QuickQuoteResult } from "@/components/quotes/QuickQuoteFormDialog";
import { findQuickQuoteTemplate } from "@/lib/quickQuote";

const NONE = "__none__";

// ---------------------------------------------------------------------------
// Draft model — the whole quote body (sections, items, notes, terms, deposit)
// is edited locally and only written to Supabase when "Save changes" is
// pressed. New rows get a "tmp-" id. Mirrors ProjectMaterialsView. The Client
// and Link-to-project selects are NOT part of the draft — they save on change.
// ---------------------------------------------------------------------------

/**
 * A photo on a draft line item — either not yet uploaded (`file` set, a
 * pre-compressed blob held only in memory + `previewUrl`, a local
 * `URL.createObjectURL`) or already persisted (`storage_path` set, `file`
 * null, resolved to a signed URL for display same as everywhere else).
 * Nothing in Storage exists for a `file`-backed image until Save uploads
 * it — that's what makes Discard/navigating-away-without-saving safe: there
 * is never anything to orphan, because nothing was ever written.
 */
interface DraftImage {
  id: string;
  storage_path: string | null;
  file: Blob | null;
  previewUrl: string | null;
  sort_order: number;
}
interface DraftItem {
  id: string;
  name: string;
  description: string;
  /** Unit price. Line total = quantity × price. */
  price: number;
  quantity: number;
  /** Unit of measure label (sf, cy, ea…). Not part of the math. */
  unit: string;
  is_optional: boolean;
  /** Set by the client on the share page; carried through, never edited here. */
  client_selected: boolean;
  /** Optional work category (Settings > Categories). Null = uncategorized. */
  category_id: string | null;
  images: DraftImage[];
}
interface DraftSection {
  id: string;
  name: string;
  is_optional: boolean;
  items: DraftItem[];
}
interface QuoteDraft {
  sections: DraftSection[];
  notes: string;
  terms: string;
  depositPct: number;
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

/** Revokes preview URLs for any not-yet-uploaded images on an item — call
 * whenever a draft item is discarded or removed so it doesn't leak. */
const revokeLocalImageUrls = (item: DraftItem) => {
  for (const img of item.images) {
    if (img.file && img.previewUrl) URL.revokeObjectURL(img.previewUrl);
  }
};

const seed = (quote: Quote): QuoteDraft => ({
  sections: quote.quote_sections.map((s) => ({
    id: s.id,
    name: s.name,
    is_optional: s.is_optional,
    items: s.quote_items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? "",
      price: Number(i.price),
      quantity: i.quantity == null ? 1 : Number(i.quantity),
      unit: i.unit ?? "",
      is_optional: i.is_optional,
      client_selected: i.client_selected,
      category_id: i.category_id ?? null,
      images: (i.quote_item_images ?? []).map((img) => ({
        id: img.id,
        storage_path: img.storage_path,
        file: null,
        previewUrl: null,
        sort_order: img.sort_order,
      })),
    })),
  })),
  notes: quote.notes ?? "",
  terms: quote.terms ?? "",
  depositPct: Number(quote.deposit_percentage),
});

/** Line total = quantity × unit price. */
const lineTotal = (i: DraftItem) => i.price * i.quantity;
/** An item is an "optional add-on" if its section or the item itself is flagged. */
const itemIsAddon = (s: DraftSection, i: DraftItem) => s.is_optional || i.is_optional;
/** Whether a draft line item counts toward the shown total. */
const itemIncluded = (s: DraftSection, i: DraftItem) =>
  itemIsAddon(s, i) ? i.client_selected : true;
/** A section's base (non-optional) subtotal — what always counts. */
const baseSubtotal = (s: DraftSection) =>
  s.is_optional ? 0 : s.items.reduce((sum, i) => (i.is_optional ? sum : sum + lineTotal(i)), 0);

interface QuoteWorkspaceProps {
  quote: Quote;
  /** Where "Back to ..." goes and what it's labeled — the only thing that
   * differs between reaching this from a project vs. from the quotes list. */
  backHref: string;
  backLabel: string;
}

/**
 * The full quote editor — client/project linking, sections/items, totals /
 * margin panel, notes/terms/deposit, send flow. Single place all quote
 * configuration happens, whether the quote started standalone or from a
 * project: project_id/client_id are derived straight from `quote`.
 */
export function QuoteWorkspace({ quote, backHref, backLabel }: QuoteWorkspaceProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [confirmApprovedSaveOpen, setConfirmApprovedSaveOpen] = useState(false);
  const [quickQuotePickerOpen, setQuickQuotePickerOpen] = useState(false);
  const [quickQuoteBuildType, setQuickQuoteBuildType] = useState<string | null>(null);
  // Set right before triggering a save from the "Create project" nudge, so
  // whatever's currently in the editor — saved or not — is what actually
  // gets moved into the new project, instead of re-parenting whatever was
  // last persisted to the DB. Consumed (and cleared) in saveMut's
  // onSuccess; also cleared if the approved-quote confirm dialog is
  // dismissed without saving, so a later unrelated save can't misfire it.
  const createProjectAfterSave = useRef(false);

  const { data: catalogItems = [] } = useQuery({
    queryKey: ["product-catalog"],
    queryFn: listProductCatalog,
  });
  const { data: quickQuoteRates = [] } = useQuery({
    queryKey: ["quick-quote-rates"],
    queryFn: listQuickQuoteRates,
  });

  const projectId = quote.project_id;

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: quoteDefaults = QUOTE_DEFAULTS_FALLBACK } = useQuery({
    queryKey: ["quote-defaults"],
    queryFn: getQuoteDefaults,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials", { project: projectId }],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });
  // Sibling documents in this project (0042) — drive the "more than one
  // sheet or quote" ambiguity check for Estimated Cost, below.
  const { data: materialsSheets = [] } = useQuery({
    queryKey: ["materials-sheets", { project: projectId }],
    queryFn: () => listMaterialsSheets(projectId!),
    enabled: !!projectId,
  });
  const { data: projectQuotes = [] } = useQuery({
    queryKey: ["quotes", { project: projectId }],
    queryFn: () => listQuotes(projectId!),
    enabled: !!projectId,
  });
  const { data: linkedSheetSections = [] } = useQuery({
    queryKey: ["materials", { sheet: quote.material_sheet_id }],
    queryFn: () => listMaterialsBySheet(quote.material_sheet_id!),
    enabled: !!quote.material_sheet_id,
  });
  const [linkSheetPickerOpen, setLinkSheetPickerOpen] = useState(false);

  // --- draft state --------------------------------------------------------
  const [draft, setDraft] = useState<QuoteDraft>(() => seed(quote));
  const dirty = useRef(false);

  // Re-seed from the server when the quote reloads — but never clobber unsaved
  // edits. (Changing the Client / project link refetches the quote; the draft
  // is preserved across that.)
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(quote));
  }, [quote]);

  const markDirty = () => {
    dirty.current = true;
  };
  const edit = (fn: (d: QuoteDraft) => QuoteDraft) => {
    markDirty();
    setDraft(fn);
  };
  const setSections = (fn: (s: DraftSection[]) => DraftSection[]) =>
    edit((d) => ({ ...d, sections: fn(d.sections) }));

  // Not-yet-uploaded image previews are local blob URLs — revoke them
  // before throwing the draft away so they don't leak. Nothing was ever
  // uploaded to Storage for them, so there's no server-side cleanup to do.
  const discard = () => {
    for (const s of draft.sections) for (const i of s.items) revokeLocalImageUrls(i);
    dirty.current = false;
    setDraft(seed(quote));
  };

  // --- local mutators ----------------------------------------------------
  const addSection = () =>
    setSections((s) => [...s, { id: tmpId(), name: "", is_optional: false, items: [] }]);
  // Quick Quote lands as an ordinary new draft section with exactly one
  // line item — indistinguishable from a manually-added section/item from
  // this point on, so everything below (edit, delete, add more rows, Save)
  // treats it exactly the same.
  const addQuickQuoteSection = (result: QuickQuoteResult) =>
    setSections((s) => [
      ...s,
      {
        id: tmpId(),
        name: result.name,
        is_optional: false,
        items: [
          {
            id: tmpId(),
            name: result.name,
            description: result.description,
            price: result.rate,
            quantity: result.quantity,
            unit: result.unit,
            is_optional: false,
            client_selected: false,
            category_id: null,
            images: [],
          },
        ],
      },
    ]);
  const renameSection = (sid: string, name: string) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, name } : x)));
  const toggleSectionOptional = (sid: string, v: boolean) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, is_optional: v } : x)));
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
                {
                  id: tmpId(),
                  name: "",
                  description: "",
                  price: 0,
                  quantity: 1,
                  unit: "ea",
                  is_optional: false,
                  client_selected: false,
                  category_id: null,
                  images: [],
                },
              ],
            }
          : x,
      ),
    );
  const editItem = (sid: string, iid: string, patch: Partial<DraftItem>) =>
    setSections((s) =>
      s.map((x) =>
        x.id === sid ? { ...x, items: x.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) } : x,
      ),
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

  // --- server sync -------------------------------------------------------
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["quote", quote.id] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const updateClientMut = useMutation({
    mutationFn: (clientId: string | null) => updateQuote(quote.id, { client_id: clientId }),
    onSuccess: invalidate,
    onError,
  });
  const updateProjectLinkMut = useMutation({
    mutationFn: (newProjectId: string | null) => updateQuote(quote.id, { project_id: newProjectId }),
    onSuccess: invalidate,
    onError,
  });
  // Which materials sheet this quote's Estimated Cost pulls from — only
  // shown/used once the project has more than one sheet or more than one
  // quote (see needsExplicitMaterialsLink below). Sets sheetId null to unlink.
  const linkMaterialSheetMut = useMutation({
    mutationFn: (sheetId: string | null) => linkQuoteToMaterialSheet(quote.id, sheetId),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["materials-sheets", { project: projectId }] });
    },
    onError,
  });

  // Diff the draft against the server quote and write only what changed.
  const saveMut = useMutation({
    mutationFn: async () => {
      // An approved quote's sections/items/photos are locked at the DB
      // level (0033) — editing must revert it to draft FIRST (a separate,
      // awaited call — these are independent REST requests, not one
      // transaction) or the writes below would be rejected by that lock.
      // This is what actually invalidates the client's signature; the
      // confirm dialog just makes sure that's not a surprise.
      const wasApproved = quote.status === "approved";
      if (wasApproved) {
        await updateQuote(quote.id, { status: "draft", signed_at: null, signed_by: null });
      }

      const serverSections = new Map(quote.quote_sections.map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.sections.map((s) => s.id));

      // 1. deletes — server sections no longer in the draft (cascades items)
      for (const s of quote.quote_sections) {
        if (!draftSectionIds.has(s.id)) await deleteQuoteSection(s.id);
      }

      // 2. per section: create / update, then its items
      for (let si = 0; si < draft.sections.length; si++) {
        const ds = draft.sections[si];
        const name = ds.name.trim() || "New section";
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await addQuoteSection(quote.id, {
            name,
            is_optional: ds.is_optional,
            sort_order: si,
          });
          sectionId = created.id;
        } else if (
          server.name !== name ||
          server.is_optional !== ds.is_optional ||
          server.sort_order !== si
        ) {
          await updateQuoteSection(server.id, {
            name,
            is_optional: ds.is_optional,
            sort_order: si,
          });
        }

        const serverItems = new Map((server?.quote_items ?? []).map((i) => [i.id, i]));
        const draftItemIds = new Set(ds.items.filter((i) => !isTmp(i.id)).map((i) => i.id));

        if (server) {
          for (const i of server.quote_items) {
            if (!draftItemIds.has(i.id)) await deleteQuoteItem(i.id);
          }
        }

        for (let ii = 0; ii < ds.items.length; ii++) {
          const di = ds.items[ii];
          const desc = di.description.trim() || null;
          const unit = di.unit.trim() || null;
          const srv = serverItems.get(di.id);
          let itemId: string;

          if (!srv) {
            const created = await addQuoteItem(sectionId, {
              name: di.name,
              description: desc,
              price: di.price,
              quantity: di.quantity,
              unit,
              is_optional: di.is_optional,
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
              srv.is_optional !== di.is_optional ||
              srv.sort_order !== ii ||
              (srv.category_id ?? null) !== di.category_id
            ) {
              await updateQuoteItem(srv.id, {
                name: di.name,
                description: desc,
                price: di.price,
                quantity: di.quantity,
                unit,
                is_optional: di.is_optional,
                sort_order: ii,
                category_id: di.category_id,
              });
            }
          }

          // Images — diff the draft against what's actually persisted for
          // this item. A brand-new item has no server images at all, so
          // every draft image on it is by definition a fresh upload.
          const serverImages = srv?.quote_item_images ?? [];
          const draftImageIds = new Set(
            di.images.filter((img) => img.storage_path).map((img) => img.id),
          );
          for (const img of serverImages) {
            if (!draftImageIds.has(img.id)) await deleteQuoteItemImage(img);
          }
          for (let ki = 0; ki < di.images.length; ki++) {
            const dimg = di.images[ki];
            if (dimg.file) {
              await uploadQuoteItemImage(itemId, dimg.file, ki);
              if (dimg.previewUrl) URL.revokeObjectURL(dimg.previewUrl);
            }
          }
        }
      }

      // 3. quote-level fields
      const patch: Parameters<typeof updateQuote>[1] = {};
      if ((quote.notes ?? "") !== draft.notes) patch.notes = draft.notes.trim() || null;
      if ((quote.terms ?? "") !== draft.terms) patch.terms = draft.terms.trim() || null;
      if (Number(quote.deposit_percentage) !== draft.depositPct)
        patch.deposit_percentage = draft.depositPct;
      if (Object.keys(patch).length) await updateQuote(quote.id, patch);

      return { wasApproved };
    },
    onSuccess: ({ wasApproved }) => {
      dirty.current = false;
      invalidate();
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      if (wasApproved) {
        void logProjectEvent(
          projectId,
          "quote_reverted",
          "Quote edited after approval — signature invalidated, reverted to draft",
        );
        qc.invalidateQueries({ queryKey: ["project-events", projectId] });
        toast({ title: "Quote saved", description: "Signature invalidated — back to draft." });
      } else if (!createProjectAfterSave.current) {
        toast({ title: "Quote saved" });
      }
      if (createProjectAfterSave.current) {
        createProjectAfterSave.current = false;
        navigate("/projects/new", { state: { linkQuoteId: quote.id } });
      }
    },
    onError,
  });

  const shareQuoteMut = useMutation({
    mutationFn: async () => {
      const token = quote.share_token ?? (await generateShareLink("quotes", quote.id));
      await updateQuote(quote.id, { status: "sent" });
      if (projectId) await updateProject(projectId, { status: "quote_sent" });
      return token;
    },
    onSuccess: (token) => {
      invalidate();
      void logProjectEvent(projectId, "quote_sent", `Quote shared · ${formatCurrency(grandTotal)}`, {
        quote_id: quote.id,
      });
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      setShareUrl(`${window.location.origin}/quote/${token}`);
    },
    onError,
  });

  // Preview never changes the quote's status — it just makes sure a share
  // token exists (even for a draft) and opens the client-facing page.
  const previewMut = useMutation({
    mutationFn: async () => quote.share_token ?? generateShareLink("quotes", quote.id),
    onSuccess: (token) => {
      invalidate();
      window.open(`${window.location.origin}/quote/${token}`, "_blank", "noopener,noreferrer");
    },
    onError,
  });

  // Client Share Card's Share/Copy buttons: same "mint a token without
  // touching status" as Preview, just a different thing to do with it once
  // it exists.
  const ensureLinkMut = useMutation({
    mutationFn: async (intent: "share" | "copy") => ({
      token: quote.share_token ?? (await generateShareLink("quotes", quote.id)),
      intent,
    }),
    onSuccess: ({ token, intent }) => {
      invalidate();
      const url = `${window.location.origin}/quote/${token}`;
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

  // --- derived amounts (from the draft) ---------------------------------
  const sectionSubtotal = (s: DraftSection) =>
    s.items.reduce((sum, i) => (itemIncluded(s, i) ? sum + lineTotal(i) : sum), 0);
  const quoteTotalLive = draft.sections.reduce((sum, s) => sum + sectionSubtotal(s), 0);
  const baseTotal = draft.sections.reduce((sum, s) => sum + baseSubtotal(s), 0);
  // Add-ons the client has picked (roll into the total); vs. everything optional.
  const selectedAddonsTotal = draft.sections.reduce(
    (sum, s) =>
      sum +
      s.items.reduce((a, i) => a + (itemIsAddon(s, i) && i.client_selected ? lineTotal(i) : 0), 0),
    0,
  );
  const optionalAvailableTotal = draft.sections.reduce(
    (sum, s) =>
      sum +
      s.items.reduce((a, i) => a + (itemIsAddon(s, i) && !i.client_selected ? lineTotal(i) : 0), 0),
    0,
  );
  // Ambiguous once this project has more than one materials sheet or more
  // than one quote — below that, this quote's cost pairs automatically with
  // the project's single (or only) sheet, exactly as before this feature
  // (materialsCogs(materials) is the whole-project aggregate, which equals
  // "that one sheet" whenever there's at most one).
  const needsExplicitMaterialsLink = !!projectId && (materialsSheets.length > 1 || projectQuotes.length > 1);
  const linkedSheet = materialsSheets.find((s) => s.id === quote.material_sheet_id);
  const materialsCost = needsExplicitMaterialsLink
    ? quote.material_sheet_id
      ? materialsCogs(linkedSheetSections)
      : null
    : materialsCogs(materials);
  const fin = demoQuoteFinancials(
    quoteTotalLive,
    quoteDefaults.sales_tax_pct,
    quoteDefaults.quote_validity_days,
  );
  // Material markup was a synthetic demo percentage — it never counted toward
  // the real quote total (api.ts quoteTotal(), the shared client-facing page,
  // and the Project detail "Contract" figure all only ever summed real line
  // items). Folding it in here made the Builder's own total disagree with
  // every other number in the app; sales tax stays, unrelated to this.
  const grandTotal = quoteTotalLive + fin.taxAmount;
  const depositAmount = Math.round((grandTotal * draft.depositPct) / 100);
  // Standalone quotes (no project) have no real cost source — the Materials
  // Sheet lives on a project. There used to be a guessed fallback here
  // (60% of the quote total, from demoQuoteFinancials().estCost) but that
  // was fabricated, not derived from anything real, so it's gone. Margin
  // and profit are equally undefined without a real cost, so both cascade
  // to null too rather than displaying a number built on the same guess.
  // A project-linked quote with an ambiguous, unlinked materials sheet is
  // equally undefined until the user picks one — see needsExplicitMaterialsLink.
  const estCost = projectId ? materialsCost : null;
  const margin = estCost == null ? null : grandTotal - estCost;
  const marginPct = estCost == null ? null : grandTotal > 0 ? (margin! / grandTotal) * 100 : 0;

  const itemCount = draft.sections.reduce((n, s) => n + s.items.length, 0);
  const sectionRows = draft.sections
    .filter((s) => !s.is_optional && s.items.some((i) => !i.is_optional))
    .map((s) => ({ id: s.id, name: s.name || "Untitled section", subtotal: baseSubtotal(s) }));
  const terms = demoQuoteTerms(quote, draft.depositPct, quoteDefaults.quote_validity_days);

  const meta = quoteStatusMeta(quote.status);
  const clientName = quote.client?.name ?? quote.project?.client?.name ?? "No client";
  const persistedLink =
    quote.share_token && quote.status !== "draft"
      ? `${window.location.origin}/quote/${quote.share_token}`
      : null;

  const isDirty = dirty.current;

  const handleSaveClick = () => {
    createProjectAfterSave.current = false;
    if (quote.status === "approved") {
      setConfirmApprovedSaveOpen(true);
    } else {
      saveMut.mutate();
    }
  };

  // The standalone-quote "Create project" nudge: whatever's currently in
  // the editor must land in the new project, not just whatever the DB
  // already has — so if there are unsaved changes, save first (reusing
  // the exact same saveMut the Save button uses, including its
  // approved-quote confirm gate) and only navigate once that succeeds.
  const handleCreateProjectClick = () => {
    if (!isDirty) {
      navigate("/projects/new", { state: { linkQuoteId: quote.id } });
      return;
    }
    createProjectAfterSave.current = true;
    if (quote.status === "approved") {
      setConfirmApprovedSaveOpen(true);
    } else {
      saveMut.mutate();
    }
  };

  const primaryAction = (fullWidth?: boolean) =>
    quote.status === "draft" ? (
      <Button
        onClick={() => shareQuoteMut.mutate()}
        disabled={shareQuoteMut.isPending || isDirty}
        className={cn("font-bold", fullWidth && "w-full")}
      >
        {shareQuoteMut.isPending ? "Preparing…" : "Send for signature"}
      </Button>
    ) : (
      <Button
        variant="outline"
        onClick={() => persistedLink && setShareUrl(persistedLink)}
        disabled={!persistedLink}
        className={cn(fullWidth && "w-full")}
      >
        <Share2 className="mr-2 h-4 w-4" />
        Share link
      </Button>
    );

  // Same Send/Share choice as primaryAction, as plain label/onClick/disabled
  // for the QuoteSummaryCard's own button styling.
  const sendLabel =
    quote.status === "draft"
      ? shareQuoteMut.isPending
        ? "Preparing…"
        : "Send for signature"
      : "Share link";
  const sendDisabled =
    quote.status === "draft" ? shareQuoteMut.isPending || isDirty : !persistedLink;
  const onSendClick = () =>
    quote.status === "draft" ? shareQuoteMut.mutate() : persistedLink && setShareUrl(persistedLink);
  const previewLabel = previewMut.isPending ? "Opening…" : "Preview";

  return (
    <div className={cn("animate-fade-in max-w-6xl space-y-5", isDirty && "pb-40 md:pb-28")}>
      <MobilePageHeader
        className="mobile-header-ink"
        title={quote.project?.name ?? "Standalone quote"}
        subtitle={`${meta.label} · ${clientName}`}
        back={{ to: backHref, label: backLabel }}
        pills={
          <>
            <span className="badge-status !bg-white/20 !text-sidebar-foreground">
              {pluralize(itemCount, "item")}
            </span>
            <span className="badge-status !bg-white/15 !text-sidebar-foreground/90">{meta.label}</span>
          </>
        }
      />

      {/* Desktop header */}
      <div className="hidden md:block">
        <Link
          to={backHref}
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-muted-subtle">
              Quotes{quote.status === "draft" ? " · Draft" : ""}
            </div>
            <div className="mt-1 flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">
                {quote.project?.name ?? "Standalone quote"}
              </h1>
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && quote.status === "draft" && (
              <span className="text-xs text-muted-foreground">Save your changes first</span>
            )}
            {primaryAction()}
          </div>
        </div>
      </div>

      <ClientShareCard
        clientId={quote.client_id}
        clients={clients}
        onClientChange={(v) => updateClientMut.mutate(v)}
        projectId={quote.project_id}
        projects={projects}
        onProjectChange={(v) => updateProjectLinkMut.mutate(v)}
        hasToken={!!quote.share_token}
        shareUrl={quote.share_token ? `${window.location.origin}/quote/${quote.share_token}` : null}
        onShare={() => ensureLinkMut.mutate("share")}
        onCopy={() => ensureLinkMut.mutate("copy")}
        actionsDisabled={isDirty || ensureLinkMut.isPending}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Left column — sections + notes */}
        <div className="space-y-4">
          {draft.sections.length === 0 && (
            <div className="stat-card py-12 text-center text-muted-foreground">
              No sections yet. Add a section to build the quote.
            </div>
          )}

          {draft.sections.map((section) => (
            <QuoteSectionCard
              key={section.id}
              section={section}
              subtotal={sectionSubtotal(section)}
              categories={categories}
              onRename={(name) => renameSection(section.id, name)}
              onToggleOptional={(checked) => toggleSectionOptional(section.id, checked)}
              onDeleteSection={() => removeSection(section.id)}
              onAddItem={() => addItem(section.id)}
              onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
              onDeleteItem={(iid) => removeItem(section.id, iid)}
            />
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={addSection}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border bg-card text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" />
              Add section
            </button>
            <button
              type="button"
              onClick={() => setQuickQuotePickerOpen(true)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-primary/30 bg-primary/5 text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4" />
              Add Quick Quote
            </button>
          </div>

          <div className="stat-card space-y-5">
            <div className="space-y-2">
              <Label htmlFor="quote-notes">Notes</Label>
              <Textarea
                id="quote-notes"
                value={draft.notes}
                placeholder="Any notes for the client about this job..."
                onChange={(e) => edit((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-terms">Terms &amp; conditions</Label>
              <Textarea
                id="quote-terms"
                value={draft.terms}
                placeholder="Payment terms, warranty info, etc."
                onChange={(e) => edit((d) => ({ ...d, terms: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-deposit">Deposit required</Label>
              <div className="relative w-32">
                <Input
                  id="quote-deposit"
                  type="number"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  value={String(draft.depositPct)}
                  className="pr-7"
                  onChange={(e) =>
                    edit((d) => ({ ...d, depositPct: parseFloat(e.target.value) || 0 }))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Percentage of the quote total required upfront.
              </p>
            </div>
          </div>
        </div>

        {/* Desktop right rail — totals + quote total + margin, then terms */}
        <div className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
          <div className="card-surface p-[18px]">
            <div className="text-base font-bold text-foreground">Totals</div>
            <div className="mt-2.5">
              {sectionRows.map((r) => (
                <MoneyRow key={r.id} label={r.name} value={formatCurrency(r.subtotal)} />
              ))}
              {selectedAddonsTotal > 0 && (
                <MoneyRow label="Selected add-ons" value={formatCurrency(selectedAddonsTotal)} />
              )}
              <MoneyRow
                label={`Sales tax ${fin.taxPct}% (materials)`}
                value={formatCurrency(fin.taxAmount)}
              />
            </div>
            {optionalAvailableTotal > 0 && (
              <p className="mt-2.5 text-[11px] text-muted-foreground">
                + {formatCurrency(optionalAvailableTotal)} in optional add-ons the client can pick
              </p>
            )}
          </div>

          <QuoteSummaryCard
            variant="desktop"
            onCreateProject={handleCreateProjectClick}
            total={grandTotal}
            cost={estCost}
            profit={margin}
            marginPct={marginPct}
            needsMaterialsLink={needsExplicitMaterialsLink}
            linkedSheetName={linkedSheet?.name ?? null}
            onLinkMaterialsSheet={() => setLinkSheetPickerOpen(true)}
            onUnlinkMaterialsSheet={() => linkMaterialSheetMut.mutate(null)}
            depositPct={draft.depositPct}
            deposit={depositAmount}
            lineItems={baseTotal}
            taxPct={fin.taxPct}
            tax={fin.taxAmount}
            open={breakdownOpen}
            onToggle={() => setBreakdownOpen((o) => !o)}
            sendLabel={sendLabel}
            sendDisabled={sendDisabled}
            onSend={onSendClick}
            previewLabel={previewLabel}
            previewDisabled={isDirty || previewMut.isPending}
            onPreview={() => previewMut.mutate()}
          />

          <QuoteTermsCard terms={terms} />
        </div>
      </div>

      {/* Mobile: one quote-total summary card at the bottom of the page. */}
      <div className="lg:hidden">
        <QuoteSummaryCard
          variant="mobile"
          onCreateProject={handleCreateProjectClick}
          total={grandTotal}
          cost={estCost}
          profit={margin}
          marginPct={marginPct}
          needsMaterialsLink={needsExplicitMaterialsLink}
          linkedSheetName={linkedSheet?.name ?? null}
          onLinkMaterialsSheet={() => setLinkSheetPickerOpen(true)}
          onUnlinkMaterialsSheet={() => linkMaterialSheetMut.mutate(null)}
          depositPct={draft.depositPct}
          deposit={depositAmount}
          lineItems={baseTotal}
          taxPct={fin.taxPct}
          tax={fin.taxAmount}
          open={breakdownOpen}
          onToggle={() => setBreakdownOpen((o) => !o)}
          sendLabel={sendLabel}
          sendDisabled={sendDisabled}
          onSend={onSendClick}
          previewLabel={previewLabel}
          previewDisabled={isDirty || previewMut.isPending}
          onPreview={() => previewMut.mutate()}
        />
      </div>

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={handleSaveClick}
        saving={saveMut.isPending}
      />

      <AlertDialog
        open={confirmApprovedSaveOpen}
        onOpenChange={(open) => {
          setConfirmApprovedSaveOpen(open);
          // Dismissed (Escape/outside click/Cancel) without saving — don't
          // let a stale "create project after save" flag misfire the next
          // unrelated save.
          if (!open) createProjectAfterSave.current = false;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editing an approved quote</AlertDialogTitle>
            <AlertDialogDescription>
              {quote.signed_by ? `${quote.signed_by}'s` : "The client's"} signature will be invalidated
              and this quote will revert to draft. They'll need to review and approve it again at the
              same link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmApprovedSaveOpen(false);
                saveMut.mutate();
              }}
            >
              Save and revert to draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareLinkDialog
        open={!!shareUrl}
        onOpenChange={(open) => !open && setShareUrl(null)}
        url={shareUrl ?? ""}
        kind="quote"
      />

      <QuickQuoteDialog
        open={quickQuotePickerOpen}
        onOpenChange={setQuickQuotePickerOpen}
        onPick={(buildTypeId) => {
          setQuickQuoteBuildType(buildTypeId);
          setQuickQuotePickerOpen(false);
        }}
      />
      {quickQuoteBuildType &&
        (() => {
          const template = findQuickQuoteTemplate(quickQuoteBuildType);
          if (!template) return null;
          return (
            <QuickQuoteFormDialog
              open={!!quickQuoteBuildType}
              onOpenChange={(open) => !open && setQuickQuoteBuildType(null)}
              template={template}
              rates={quickQuoteRates}
              catalogItems={catalogItems}
              onCreate={addQuickQuoteSection}
            />
          );
        })()}

      {needsExplicitMaterialsLink && (
        <LinkMaterialsSheetDialog
          open={linkSheetPickerOpen}
          onOpenChange={setLinkSheetPickerOpen}
          sheets={materialsSheets}
          onSelect={(sheetId) => linkMaterialSheetMut.mutate(sheetId)}
        />
      )}
    </div>
  );
}

/** The quote builder's own "Link a materials sheet" picker — lists sheets
 * within this quote's project only (project-scoped, not app-wide), mirroring
 * the materials sheet builder's own "Link a quote" picker. */
function LinkMaterialsSheetDialog({
  open,
  onOpenChange,
  sheets,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheets: { id: string; name: string }[];
  onSelect: (sheetId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Link a materials sheet</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {sheets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No materials sheets on this project yet.
            </p>
          ) : (
            sheets.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                onClick={() => {
                  onSelect(sheet.id);
                  onOpenChange(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 pl-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="text-sm font-semibold text-foreground">{sheet.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface QuoteSummaryCardProps {
  /** "mobile" = full-width bottom card; "desktop" = 340px sidebar card. */
  variant: "mobile" | "desktop";
  /** The standalone "Create project" nudge — saves any unsaved changes
   * first (same saveMut the Save button uses) so the new project gets
   * whatever's currently in the editor, then navigates to create it. */
  onCreateProject: () => void;
  total: number;
  /** Null for a standalone quote, or a project-linked quote with an
   * ambiguous, unlinked materials sheet (see needsMaterialsLink) — either
   * way there's no real cost source yet, so this and profit/marginPct show
   * "Not available" rather than a guessed number. */
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
  /** True once this quote's project has more than one materials sheet or
   * more than one quote — the single-document implicit pairing no longer
   * applies, so the Est. cost row shows a Link/Change/Unlink affordance
   * instead of pairing automatically. */
  needsMaterialsLink: boolean;
  /** Name of the currently-linked sheet, if any (only meaningful when
   * needsMaterialsLink is true). */
  linkedSheetName: string | null;
  onLinkMaterialsSheet: () => void;
  onUnlinkMaterialsSheet: () => void;
  depositPct: number;
  deposit: number;
  lineItems: number;
  taxPct: number;
  tax: number;
  open: boolean;
  onToggle: () => void;
  sendLabel: string;
  sendDisabled?: boolean;
  onSend: () => void;
  previewLabel: string;
  previewDisabled?: boolean;
  onPreview: () => void;
}

/**
 * Quote total + margin + deposit/cost/profit + expandable breakdown, with
 * its own Send/Preview actions. Used both as the sticky-free bottom card on
 * mobile and as a card in the desktop right rail — same content, tuned
 * sizing per breakpoint (see the "Quote Summary Card" design mockup).
 */
function QuoteSummaryCard({
  variant,
  onCreateProject,
  total,
  cost,
  profit,
  marginPct,
  needsMaterialsLink,
  linkedSheetName,
  onLinkMaterialsSheet,
  onUnlinkMaterialsSheet,
  depositPct,
  deposit,
  lineItems,
  taxPct,
  tax,
  open,
  onToggle,
  sendLabel,
  sendDisabled,
  onSend,
  previewLabel,
  previewDisabled,
  onPreview,
}: QuoteSummaryCardProps) {
  const isMobile = variant === "mobile";

  return (
    <div
      className={cn(
        "card-surface flex flex-col",
        isMobile ? "gap-4 rounded-3xl p-[18px] shadow-card-hover" : "gap-[18px] p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
            Quote total
          </div>
          <div
            className={cn(
              "mt-1 font-extrabold leading-none tracking-tight tabular-nums text-foreground",
              isMobile ? "text-[34px]" : "text-[30px]",
            )}
          >
            {formatCurrency(total)}
          </div>
        </div>
        {marginPct != null && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 font-extrabold text-success",
              isMobile ? "h-[30px] px-3.5 text-xs" : "h-7 px-3 text-xs",
            )}
          >
            Margin {marginPct.toFixed(0)}%
          </span>
        )}
      </div>

      {isMobile ? (
        <div className="grid grid-cols-3 gap-2">
          <SummaryTile label={`Deposit ${depositPct}%`} value={formatCurrency(deposit)} />
          <SummaryTile
            label="Est. cost"
            value={
              cost == null ? (
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[13px] font-extrabold text-foreground">Not available</span>
                  <button
                    type="button"
                    onClick={needsMaterialsLink ? onLinkMaterialsSheet : onCreateProject}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    {needsMaterialsLink ? "Link materials sheet" : "Create project"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-1">
                  <span>{formatCurrency(cost)}</span>
                  {needsMaterialsLink && (
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                      {linkedSheetName}
                      <button type="button" onClick={onLinkMaterialsSheet} className="font-bold text-primary hover:underline">
                        Change
                      </button>
                      <button type="button" onClick={onUnlinkMaterialsSheet} className="font-bold text-primary hover:underline">
                        Unlink
                      </button>
                    </span>
                  )}
                </div>
              )
            }
          />
          <SummaryTile
            label="Estimated profit"
            value={profit == null ? "Not available" : formatCurrency(profit)}
            highlight
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <SummaryRow label={`Deposit ${depositPct}%`} value={formatCurrency(deposit)} />
          <SummaryRow
            label="Est. cost"
            value={
              cost == null ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-sm font-extrabold text-foreground">Not available</span>
                  <button
                    type="button"
                    onClick={needsMaterialsLink ? onLinkMaterialsSheet : onCreateProject}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    {needsMaterialsLink ? "Link materials sheet" : "Create project"}
                  </button>
                </span>
              ) : (
                <span className="inline-flex flex-col items-end gap-0.5">
                  <span>{formatCurrency(cost)}</span>
                  {needsMaterialsLink && (
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      {linkedSheetName}
                      <button type="button" onClick={onLinkMaterialsSheet} className="font-bold text-primary hover:underline">
                        Change
                      </button>
                      <button type="button" onClick={onUnlinkMaterialsSheet} className="font-bold text-primary hover:underline">
                        Unlink
                      </button>
                    </span>
                  )}
                </span>
              )
            }
          />
          <SummaryRow label="Profit" value={profit == null ? "Not available" : formatCurrency(profit)} highlight />
        </div>
      )}

      {open && (
        <div className="flex flex-col">
          <MoneyRow label="Line items" value={formatCurrency(lineItems)} />
          <MoneyRow label={`Sales tax ${taxPct}%`} value={formatCurrency(tax)} />
        </div>
      )}

      <div className="flex gap-2.5">
        <Button
          onClick={onSend}
          disabled={sendDisabled}
          className={cn("flex-1 font-bold", isMobile ? "h-[46px] rounded-[13px]" : "h-11 rounded-xl")}
        >
          {sendLabel}
        </Button>
        <Button
          variant="outline"
          onClick={onPreview}
          disabled={previewDisabled}
          className={cn("flex-1", isMobile ? "h-[46px] rounded-[13px]" : "h-11 rounded-xl")}
        >
          {previewLabel}
        </Button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex items-center justify-center gap-1.5 border-t border-hairline text-xs font-bold text-muted-foreground transition-colors hover:bg-muted/40",
          isMobile ? "-mx-[18px] -mb-[18px] rounded-b-3xl px-[18px] pb-4 pt-3" : "-mx-5 -mb-5 rounded-b-card px-5 pb-4 pt-3",
        )}
      >
        {open ? "Hide breakdown ⌃" : "Show breakdown ⌄"}
      </button>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5",
        highlight ? "border border-primary/40 bg-primary/10" : "bg-muted",
      )}
    >
      <div className={cn("text-[11px] font-semibold", highlight ? "text-success" : "text-muted-foreground")}>
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[15px] font-extrabold tabular-nums",
          highlight ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3.5 py-3",
        highlight ? "border border-primary/40 bg-primary/10" : "bg-muted",
      )}
    >
      <span className={cn("text-xs font-semibold", highlight ? "text-success" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn("text-base font-extrabold tabular-nums", highlight ? "text-success" : "text-foreground")}
      >
        {value}
      </span>
    </div>
  );
}

interface ClientShareCardProps {
  clientId: string | null;
  clients: { id: string; name: string }[];
  onClientChange: (id: string | null) => void;
  projectId: string | null;
  projects: { id: string; name: string }[];
  onProjectChange: (id: string | null) => void;
  /** Whether a share token already exists — drives the status dot/label. */
  hasToken: boolean;
  shareUrl: string | null;
  onShare: () => void;
  onCopy: () => void;
  actionsDisabled?: boolean;
}

/**
 * Client + Project pickers and the client-facing share link, unified into
 * one card (the "Client Share Card" design). Replaces the old separate
 * Client/Project select grid and the "Client link" card.
 */
function ClientShareCard({
  clientId,
  clients,
  onClientChange,
  projectId,
  projects,
  onProjectChange,
  hasToken,
  shareUrl,
  onShare,
  onCopy,
  actionsDisabled,
}: ClientShareCardProps) {
  const clientName = clients.find((c) => c.id === clientId)?.name;
  const clientInitial = clientName ? clientName.trim().charAt(0).toUpperCase() || "?" : "?";
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const pillTriggerClass =
    "h-auto items-center gap-2.5 rounded-xl border-none bg-white/[0.08] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.14] focus:ring-2 focus:ring-primary focus:ring-offset-0 [&>span]:line-clamp-1";
  const pillLabelClass = "shrink-0 text-[11px] font-bold uppercase tracking-wide text-background/55";
  const pillValueClass = "min-w-0 flex-1 truncate text-right text-[15px] font-bold text-background";

  return (
    <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
      {/* Dark header — Client / Project pickers, styled as pills */}
      <div className="grid gap-2.5 bg-foreground p-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setClientPickerOpen(true)}
          className={cn("flex", pillTriggerClass)}
        >
          <span className="!flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground">
            {clientInitial}
          </span>
          <span className={pillLabelClass}>Client</span>
          <span className={pillValueClass}>{clientName ?? "No client"}</span>
        </button>
        <ClientPickerDialog
          open={clientPickerOpen}
          onOpenChange={setClientPickerOpen}
          onSelect={onClientChange}
          allowClear
        />

        <Select value={projectId ?? NONE} onValueChange={(v) => onProjectChange(v === NONE ? null : v)}>
          <SelectTrigger className={pillTriggerClass}>
            <span className="!flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
              <Briefcase className="h-3.5 w-3.5" />
            </span>
            <span className={pillLabelClass}>Project</span>
            <span className={pillValueClass}>
              <SelectValue placeholder="No project" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* White footer — link status + url + Share/Copy */}
      <div className="flex flex-wrap items-center gap-3.5 bg-card p-4">
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn("h-[7px] w-[7px] shrink-0 rounded-full", hasToken ? "bg-primary" : "bg-border")}
            />
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
              {hasToken ? "Client link is live" : "Client link not sent yet"}
            </span>
          </div>
          <div className="truncate rounded-lg bg-muted px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
            {shareUrl ?? "Generated the first time you share or preview this quote"}
          </div>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={onShare}
            disabled={actionsDisabled}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={actionsDisabled}
            aria-label="Copy link"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuoteTermsCard({ terms }: { terms: DemoQuoteTerms }) {
  const row = (label: string, value: string) => (
    <div className="flex justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
  return (
    <div className="card-surface p-4">
      <div className="text-base font-bold text-foreground">Terms</div>
      <div className="mt-2.5 space-y-2.5">
        {row("Valid until", terms.validUntil)}
        {row("Deposit", terms.depositLabel)}
        {row("Balance", terms.balance)}
        {row("Warranty", terms.warranty)}
        {row("Crew window", terms.crewWindow)}
      </div>
    </div>
  );
}

interface QuoteSectionCardProps {
  section: DraftSection;
  subtotal: number;
  categories: Category[];
  onRename: (name: string) => void;
  onToggleOptional: (checked: boolean) => void;
  onDeleteSection: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (itemId: string) => void;
}

function QuoteSectionCard({
  section,
  subtotal,
  categories,
  onRename,
  onToggleOptional,
  onDeleteSection,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: QuoteSectionCardProps) {
  const items = section.items;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
      {/* Slate section header — editable name + running subtotal. Same
          blue-gray the mobile top banner used before it switched to ink. */}
      <div className="flex items-center justify-between gap-5 bg-sidebar px-5 py-4">
        <div className="min-w-0 flex-1">
          <input
            value={section.name}
            onChange={(e) => onRename(e.target.value)}
            placeholder="New section"
            className="-ml-2.5 w-full rounded-lg border-none bg-transparent px-2.5 py-1 text-[19px] font-bold tracking-tight text-background outline-none transition placeholder:font-semibold placeholder:text-background/40 hover:bg-white/[0.08] focus:bg-white/[0.12] focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-background/55">{pluralize(items.length, "item")}</div>
          <div className="mt-0.5 text-[19px] font-extrabold tracking-tight tabular-nums text-background">
            {formatCurrency(subtotal)}
          </div>
        </div>
      </div>

      {/* Optional toggle + delete */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-2.5">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Switch
            checked={section.is_optional}
            onCheckedChange={onToggleOptional}
            aria-label="Optional section"
          />
          Optional section — client can add or drop it
        </label>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Delete section"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {items.length > 0
                  ? `Removes ${items.length} item${items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)}. Nothing is saved until you press Save changes.`
                  : "This section is empty."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDeleteSection}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-3 p-[18px]">
        {items.map((item) => (
          <QuoteItemRow
            key={item.id}
            item={item}
            categories={categories}
            onEdit={(patch) => onEditItem(item.id, patch)}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
        <button
          type="button"
          onClick={onAddItem}
          className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add item to this section
        </button>
      </div>
    </div>
  );
}

interface QuoteItemRowProps {
  item: DraftItem;
  categories: Category[];
  onEdit: (patch: Partial<DraftItem>) => void;
  onDelete: () => void;
}

const ITEM_FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

function QuoteItemRow({ item, categories, onEdit, onDelete }: QuoteItemRowProps) {
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [priceStr, setPriceStr] = useState(String(item.price));
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setPriceStr(String(item.price)), [item.price]);

  const total = item.quantity * item.price;

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-hairline p-4 transition-shadow hover:border-input hover:shadow-card-hover">
      {/* Item name + delete. Textarea so long names wrap and it auto-grows. */}
      <div className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-end gap-3">
        <div className="min-w-0">
          <div className={ITEM_FIELD_LABEL}>Item</div>
          <AutoGrowTextarea
            value={item.name}
            onChange={(e) => onEdit({ name: e.target.value })}
            placeholder="Item name"
            className="mt-1 rounded-xl bg-muted px-3 py-2 text-[15px] font-semibold hover:border-input focus-visible:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="mb-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Description */}
      <div>
        <div className={ITEM_FIELD_LABEL}>Description</div>
        <AutoGrowTextarea
          value={item.description}
          onChange={(e) => onEdit({ description: e.target.value })}
          placeholder="Short description"
          className="mt-1 min-h-[44px] rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground hover:border-input focus-visible:border-primary"
        />
      </div>

      {/* Category — optional, its own full-width row so the picked name is
          never truncated/clipped on mobile. */}
      <div>
        <div className={ITEM_FIELD_LABEL}>Category</div>
        <Select
          value={item.category_id ?? NONE}
          onValueChange={(v) => onEdit({ category_id: v === NONE ? null : v })}
        >
          <SelectTrigger className="mt-1 h-[42px]" aria-label="Category">
            <SelectValue placeholder="Uncategorized" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Photos — optional, multiple. Part of the draft like every other
          field here: picking a file compresses + previews it locally, and
          it's only uploaded when the whole quote is saved. */}
      <QuoteItemPhotos item={item} onEdit={onEdit} />

      {/* Qty · Unit · Rate · Line total — two-up on mobile, four-up from sm. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Qty</div>
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => {
              setQtyStr(e.target.value);
              onEdit({ quantity: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Quantity"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit</div>
          <Input
            value={item.unit}
            onChange={(e) => onEdit({ unit: e.target.value })}
            placeholder="ea"
            className="mt-1 h-[42px]"
            aria-label="Unit"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Rate ($)</div>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={priceStr}
            onChange={(e) => {
              setPriceStr(e.target.value);
              onEdit({ price: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Unit price"
          />
        </label>
        <div>
          <div className={ITEM_FIELD_LABEL}>Line total</div>
          <div className="mt-1 flex h-[42px] items-center justify-end rounded-md bg-primary/10 px-3 text-base font-extrabold tabular-nums text-success">
            {formatCurrency(total)}
          </div>
        </div>
      </div>

      {/* Optional add-on */}
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Checkbox
          checked={item.is_optional}
          onCheckedChange={(c) => onEdit({ is_optional: c === true })}
        />
        Optional add-on — client chooses whether to include this line
      </label>
    </div>
  );
}

const THUMB_CLASS = "h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted";

interface QuoteItemPhotosProps {
  item: DraftItem;
  onEdit: (patch: Partial<DraftItem>) => void;
}

/**
 * Fully draft-driven, like every other field on this row — picking a file
 * compresses it immediately (so the preview matches exactly what will be
 * uploaded) and adds it to `item.images` via `onEdit`, same as typing into
 * any other field. Nothing touches Storage until "Save changes" runs (see
 * QuoteWorkspace's saveMut), so this works identically on a brand-new,
 * never-saved line item — there's no server item to attach to yet, and none
 * is needed until save time.
 */
function QuoteItemPhotos({ item, onEdit }: QuoteItemPhotosProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const images = item.images;
  const lightboxImage = images.find((img) => img.id === lightboxImageId) ?? null;

  // Only persisted images need a signed URL — local ones already have their
  // own preview URL (see DraftImage).
  const persistedImages = images.filter((img) => img.storage_path && !img.file);
  const paths = persistedImages.map((img) => img.storage_path!);
  const { data: signedUrls = {} } = useQuery({
    queryKey: ["quote-item-image-urls", item.id, persistedImages.map((i) => i.id).join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const srcFor = (img: DraftImage) => img.previewUrl ?? (img.storage_path ? signedUrls[img.storage_path] : undefined);

  const addFiles = async (files: File[]) => {
    setCompressing(true);
    try {
      const added: DraftImage[] = [];
      for (const file of files) {
        const compressed = await compressImageFile(file);
        added.push({
          id: tmpId(),
          storage_path: null,
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
          sort_order: images.length + added.length,
        });
      }
      onEdit({ images: [...images, ...added] });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setCompressing(false);
    }
  };

  const removeImage = (imageId: string) => {
    const img = images.find((i) => i.id === imageId);
    if (img?.file && img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    onEdit({ images: images.filter((i) => i.id !== imageId) });
    setLightboxImageId(null);
  };

  return (
    <div>
      <div className={ITEM_FIELD_LABEL}>Photos</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setLightboxImageId(img.id)}
            className={cn(THUMB_CLASS, "relative")}
            aria-label="View photo"
          >
            {srcFor(img) ? (
              <img src={srcFor(img)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
              </div>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing}
          className={cn(
            THUMB_CLASS,
            "flex items-center justify-center border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-subtle",
          )}
          aria-label="Add photo"
        >
          {compressing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addFiles(files);
          }}
        />
      </div>

      <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImageId(null)}>
        <DialogContent className="max-w-lg gap-3 p-4">
          <DialogTitle className="text-sm font-bold text-foreground">Photo</DialogTitle>
          {lightboxImage && (
            <>
              {srcFor(lightboxImage) ? (
                <img
                  src={srcFor(lightboxImage)}
                  alt=""
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-subtle" />
                </div>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeImage(lightboxImage.id)}
              >
                <X className="h-4 w-4" />
                Remove photo
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
