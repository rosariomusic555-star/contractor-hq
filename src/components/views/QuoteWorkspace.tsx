import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2, Share2 } from "lucide-react";
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
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
import { quoteStatusMeta } from "@/lib/statusMeta";
import { demoQuoteFinancials, demoQuoteTerms, type DemoQuoteTerms } from "@/lib/demoData";
import {
  listClients,
  listProjects,
  listMaterials,
  updateProject,
  updateQuote,
  addQuoteSection,
  updateQuoteSection,
  deleteQuoteSection,
  addQuoteItem,
  updateQuoteItem,
  deleteQuoteItem,
  generateShareLink,
  logProjectEvent,
  materialsCogs,
  type Quote,
} from "@/lib/api";

const NONE = "__none__";

// ---------------------------------------------------------------------------
// Draft model — the whole quote body (sections, items, notes, terms, deposit)
// is edited locally and only written to Supabase when "Save changes" is
// pressed. New rows get a "tmp-" id. Mirrors ProjectMaterialsView. The Client
// and Link-to-project selects are NOT part of the draft — they save on change.
// ---------------------------------------------------------------------------

interface DraftItem {
  id: string;
  name: string;
  description: string;
  /** Unit price. Line total = quantity × price. */
  price: number;
  quantity: number;
  is_optional: boolean;
  /** Set by the client on the share page; carried through, never edited here. */
  client_selected: boolean;
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
      is_optional: i.is_optional,
      client_selected: i.client_selected,
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

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const projectId = quote.project_id;

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials", { project: projectId }],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
  });

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

  const discard = () => {
    dirty.current = false;
    setDraft(seed(quote));
  };

  // --- local mutators ----------------------------------------------------
  const addSection = () =>
    setSections((s) => [...s, { id: tmpId(), name: "", is_optional: false, items: [] }]);
  const renameSection = (sid: string, name: string) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, name } : x)));
  const toggleSectionOptional = (sid: string, v: boolean) =>
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, is_optional: v } : x)));
  const removeSection = (sid: string) => setSections((s) => s.filter((x) => x.id !== sid));
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
                  is_optional: false,
                  client_selected: false,
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
    setSections((s) => s.map((x) => (x.id === sid ? { ...x, items: x.items.filter((i) => i.id !== iid) } : x)));

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

  // Diff the draft against the server quote and write only what changed.
  const saveMut = useMutation({
    mutationFn: async () => {
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
          const srv = serverItems.get(di.id);
          if (!srv) {
            await addQuoteItem(sectionId, {
              name: di.name,
              description: desc,
              price: di.price,
              quantity: di.quantity,
              is_optional: di.is_optional,
              sort_order: ii,
            });
          } else if (
            srv.name !== di.name ||
            (srv.description ?? null) !== desc ||
            Number(srv.price) !== di.price ||
            (srv.quantity == null ? 1 : Number(srv.quantity)) !== di.quantity ||
            srv.is_optional !== di.is_optional ||
            srv.sort_order !== ii
          ) {
            await updateQuoteItem(srv.id, {
              name: di.name,
              description: desc,
              price: di.price,
              quantity: di.quantity,
              is_optional: di.is_optional,
              sort_order: ii,
            });
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
    },
    onSuccess: () => {
      dirty.current = false;
      invalidate();
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      toast({ title: "Quote saved" });
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

  const materialsCost = materialsCogs(materials);
  const fin = demoQuoteFinancials(quoteTotalLive);
  const grandTotal = quoteTotalLive + fin.markupAmount + fin.taxAmount;
  const depositAmount = Math.round((grandTotal * draft.depositPct) / 100);
  const estCost = projectId ? materialsCost : fin.estCost;
  const margin = grandTotal - estCost;
  const marginPct = grandTotal > 0 ? (margin / grandTotal) * 100 : 0;
  const marginColor =
    grandTotal === 0
      ? "text-muted-foreground"
      : marginPct > 20
        ? "text-success"
        : marginPct >= 10
          ? "text-warning"
          : "text-destructive";

  const itemCount = draft.sections.reduce((n, s) => n + s.items.length, 0);
  const sectionRows = draft.sections
    .filter((s) => !s.is_optional && s.items.some((i) => !i.is_optional))
    .map((s) => ({ id: s.id, name: s.name || "Untitled section", subtotal: baseSubtotal(s) }));
  const terms = demoQuoteTerms(quote, draft.depositPct);

  const meta = quoteStatusMeta(quote.status);
  const clientName = quote.client?.name ?? quote.project?.client?.name ?? "No client";
  const persistedLink =
    quote.share_token && quote.status !== "draft"
      ? `${window.location.origin}/quote/${quote.share_token}`
      : null;

  const isDirty = dirty.current;

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

  return (
    <div className={cn("animate-fade-in max-w-6xl space-y-5", isDirty && "pb-40 md:pb-28")}>
      <MobilePageHeader
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

      {/* Mobile: sticky dark quote-total card with an expandable breakdown. */}
      <div className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-2 md:hidden">
        <button
          type="button"
          onClick={() => setBreakdownOpen((o) => !o)}
          className="w-full rounded-2xl bg-foreground p-4 text-left text-background shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-background/60">
                Quote total
              </div>
              <div className="mt-0.5 text-[32px] font-extrabold leading-none tracking-tight tabular-nums">
                {formatCurrency(grandTotal)}
              </div>
            </div>
            {projectId && (
              <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground">
                Margin {marginPct.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.08] px-3 py-2">
              <div className="text-[11px] font-semibold text-background/60">
                Deposit {draft.depositPct}%
              </div>
              <div className="mt-0.5 text-base font-extrabold tabular-nums">
                {formatCurrency(depositAmount)}
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.08] px-3 py-2">
              <div className="text-[11px] font-semibold text-background/60">Est. cost</div>
              <div className="mt-0.5 text-base font-extrabold tabular-nums">
                {formatCurrency(estCost)}
              </div>
            </div>
          </div>
          {breakdownOpen && (
            <div className="mt-3 border-t border-white/10 pt-1">
              {sectionRows.map((r) => (
                <DarkRow key={r.id} label={r.name} value={formatCurrency(r.subtotal)} />
              ))}
              {selectedAddonsTotal > 0 && (
                <DarkRow label="Selected add-ons" value={formatCurrency(selectedAddonsTotal)} />
              )}
              <DarkRow
                label={`Material markup ${fin.markupPct}%`}
                value={formatCurrency(fin.markupAmount)}
              />
              <DarkRow label={`Sales tax ${fin.taxPct}%`} value={formatCurrency(fin.taxAmount)} />
            </div>
          )}
          <div className="mt-2.5 text-center text-[11px] font-bold text-background/60">
            {breakdownOpen ? "Hide breakdown ⌃" : "Show breakdown ⌄"}
          </div>
        </button>
      </div>

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

      <div className="stat-card grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Client</Label>
          <Select
            value={quote.client_id ?? NONE}
            onValueChange={(v) => updateClientMut.mutate(v === NONE ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Link to project</Label>
          <Select
            value={quote.project_id ?? NONE}
            onValueChange={(v) => updateProjectLinkMut.mutate(v === NONE ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No project" />
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
      </div>

      {persistedLink && (
        <div className="stat-card flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Client link</p>
            <p className="truncate font-mono text-sm">{persistedLink}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShareUrl(persistedLink)}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Left column — sections + notes */}
        <div className="space-y-4">
          <div className="flex justify-start">
            <Button size="sm" onClick={addSection} className="font-bold">
              <Plus className="mr-2 h-4 w-4" />
              Add section
            </Button>
          </div>

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
              onRename={(name) => renameSection(section.id, name)}
              onToggleOptional={(checked) => toggleSectionOptional(section.id, checked)}
              onDeleteSection={() => removeSection(section.id)}
              onAddItem={() => addItem(section.id)}
              onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
              onDeleteItem={(iid) => removeItem(section.id, iid)}
            />
          ))}

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

        {/* Desktop right rail — totals, margin, terms */}
        <div className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
          <div className="card-surface p-4">
            <div className="text-base font-bold text-foreground">Totals</div>
            <div className="mt-2.5">
              {sectionRows.map((r) => (
                <MoneyRow key={r.id} label={r.name} value={formatCurrency(r.subtotal)} />
              ))}
              {selectedAddonsTotal > 0 && (
                <MoneyRow label="Selected add-ons" value={formatCurrency(selectedAddonsTotal)} />
              )}
              <MoneyRow
                label={`Material markup ${fin.markupPct}%`}
                value={formatCurrency(fin.markupAmount)}
              />
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

          <div className="rounded-card bg-foreground p-4 text-background">
            <div className="text-xs font-semibold text-background/70">Quote total</div>
            <div className="mt-1 text-[30px] font-extrabold leading-none tracking-tight tabular-nums">
              {formatCurrency(grandTotal)}
            </div>
            <div className="mt-1.5 text-xs text-background/75">
              Deposit {draft.depositPct}% · {formatCurrency(depositAmount)} at signing
            </div>
          </div>

          {projectId ? (
            <div className="rounded-card bg-primary/10 p-3">
              <div className="flex justify-between text-xs font-semibold text-success">
                <span>Est. cost</span>
                <span>{formatCurrency(estCost)}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs font-semibold text-success">
                <span>Margin</span>
                <span className={cn("text-[15px] font-extrabold", marginColor)}>
                  {marginPct.toFixed(0)}%
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Link a project to track cost &amp; margin.</p>
          )}

          <QuoteTermsCard terms={terms} />
        </div>
      </div>

      {/* Below-lg: totals + terms (the right rail is lg-only) */}
      <div className="space-y-4 lg:hidden">
        <div className="card-surface p-4">
          <div className="text-base font-bold text-foreground">Totals</div>
          <div className="mt-2.5">
            <MoneyRow label="Line items" value={formatCurrency(baseTotal)} />
            {selectedAddonsTotal > 0 && (
              <MoneyRow label="Selected add-ons" value={formatCurrency(selectedAddonsTotal)} />
            )}
            <MoneyRow label={`Markup ${fin.markupPct}%`} value={formatCurrency(fin.markupAmount)} />
            <MoneyRow label={`Tax ${fin.taxPct}%`} value={formatCurrency(fin.taxAmount)} />
            <MoneyRow label="Total" value={formatCurrency(grandTotal)} strong />
          </div>
          <div className="mt-3">{primaryAction(true)}</div>
        </div>
        <QuoteTermsCard terms={terms} />
      </div>

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
      />

      <ShareLinkDialog
        open={!!shareUrl}
        onOpenChange={(open) => !open && setShareUrl(null)}
        url={shareUrl ?? ""}
        kind="quote"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function DarkRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-[7px]">
      <span className="text-[13px] text-background/70">{label}</span>
      <span className="text-[13px] font-bold tabular-nums text-background">{value}</span>
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
  onRename,
  onToggleOptional,
  onDeleteSection,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: QuoteSectionCardProps) {
  const items = section.items;

  return (
    <div className="card-surface overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-hairline p-4">
        <div className="min-w-0 flex-1">
          <input
            value={section.name}
            onChange={(e) => onRename(e.target.value)}
            placeholder="New section"
            className="-mx-1 w-full max-w-xs rounded-md border border-transparent bg-transparent px-1 text-base font-bold text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground hover:border-input focus:border-input focus:bg-background focus:ring-2 focus:ring-ring"
          />
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {pluralize(items.length, "item")} · {formatCurrency(subtotal)}
            </span>
            {section.is_optional && <span className="badge-status badge-draft">Optional</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Optional
            <Switch
              checked={section.is_optional}
              onCheckedChange={onToggleOptional}
              aria-label="Optional section"
            />
          </label>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-muted-foreground hover:text-destructive" aria-label="Delete section">
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
      </div>

      {items.length > 0 && (
        <>
          <div className="hidden grid-cols-[minmax(8rem,1fr)_4.5rem_7rem_5.5rem_3.5rem_1.5rem] gap-3 bg-muted/40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-muted-subtle lg:grid">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Total</span>
            <span className="text-center">Opt</span>
            <span />
          </div>
          {items.map((item) => (
            <QuoteItemRow
              key={item.id}
              item={item}
              onEdit={(patch) => onEditItem(item.id, patch)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}
        </>
      )}

      <div className="flex items-center justify-between border-t border-hairline p-3">
        <Button variant="outline" size="sm" onClick={onAddItem}>
          <Plus className="mr-1 h-4 w-4" />
          Add item
        </Button>
        <div className="text-sm">
          <span className="mr-2 text-muted-foreground">Subtotal</span>
          <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}

interface QuoteItemRowProps {
  item: DraftItem;
  onEdit: (patch: Partial<DraftItem>) => void;
  onDelete: () => void;
}

function QuoteItemRow({ item, onEdit, onDelete }: QuoteItemRowProps) {
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [priceStr, setPriceStr] = useState(String(item.price));
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setPriceStr(String(item.price)), [item.price]);

  const total = item.quantity * item.price;

  return (
    <div className="border-b border-hairline p-3 last:border-b-0 lg:grid lg:grid-cols-[minmax(8rem,1fr)_4.5rem_7rem_5.5rem_3.5rem_1.5rem] lg:items-start lg:gap-3 lg:px-4">
      {/* Name + description. Textareas so long text wraps instead of scrolling
          off; they auto-grow so the bigger type stays fully visible. */}
      <div className="min-w-0">
        <AutoGrowTextarea
          value={item.name}
          onChange={(e) => onEdit({ name: e.target.value })}
          placeholder="Item name"
          className="-mx-1 border-transparent px-1 text-base font-semibold hover:border-input focus-visible:border-input"
        />
        <AutoGrowTextarea
          value={item.description}
          onChange={(e) => onEdit({ description: e.target.value })}
          placeholder="Short description"
          className="-mx-1 mt-0.5 border-transparent px-1 text-sm text-muted-foreground hover:border-input focus-visible:border-input"
        />
      </div>

      {/* Qty × Unit price — full, editable, always visible on mobile too. */}
      <div className="mt-2 flex items-center gap-2 lg:mt-0 lg:contents">
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          value={qtyStr}
          onChange={(e) => {
            setQtyStr(e.target.value);
            onEdit({ quantity: parseFloat(e.target.value) || 0 });
          }}
          className="h-10 w-[4.5rem] shrink-0 text-right lg:h-9 lg:w-full"
          aria-label="Quantity"
        />
        <span className="shrink-0 text-muted-subtle lg:hidden">×</span>
        <div className="relative min-w-0 flex-1 lg:flex-none">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={priceStr}
            onChange={(e) => {
              setPriceStr(e.target.value);
              onEdit({ price: parseFloat(e.target.value) || 0 });
            }}
            className="h-10 pl-5 text-right lg:h-9"
            aria-label="Unit price"
          />
        </div>
      </div>

      {/* Line total + optional + delete. Its own row on mobile so Qty / Unit
          price above get real width. */}
      <div className="mt-2 flex items-center justify-between gap-3 lg:mt-0 lg:contents">
        <span className="text-sm font-bold tabular-nums text-foreground lg:pt-1.5 lg:text-right">
          <span className="font-normal text-muted-subtle lg:hidden">= </span>
          {formatCurrency(total)}
        </span>
        <div className="flex items-center gap-3 lg:contents">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground lg:justify-self-center lg:pt-1.5">
            <Checkbox
              checked={item.is_optional}
              onCheckedChange={(c) => onEdit({ is_optional: c === true })}
            />
            <span className="lg:hidden">Optional</span>
          </label>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 text-muted-foreground hover:text-destructive lg:pt-1.5"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
