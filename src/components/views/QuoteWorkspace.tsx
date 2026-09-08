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
import { cn, formatCurrency } from "@/lib/utils";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { ShareLinkDialog } from "@/components/common/ShareLinkDialog";
import { quoteStatusMeta } from "@/lib/statusMeta";
import { demoQuoteFinancials } from "@/lib/demoData";
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
  price: number;
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
      is_optional: i.is_optional,
      client_selected: i.client_selected,
    })),
  })),
  notes: quote.notes ?? "",
  terms: quote.terms ?? "",
  depositPct: Number(quote.deposit_percentage),
});

/** Whether a draft line item counts toward the shown total. */
const itemIncluded = (s: DraftSection, i: DraftItem) =>
  s.is_optional || i.is_optional ? i.client_selected : true;

interface QuoteWorkspaceProps {
  quote: Quote;
  /** Where "Back to ..." goes and what it's labeled — the only thing that
   * differs between reaching this from a project vs. from the quotes list. */
  backHref: string;
  backLabel: string;
}

/**
 * The full quote editor — client/project linking, sections/items, margin
 * panel, notes/terms/deposit, send flow. This is the single place all quote
 * configuration happens, whether the quote started standalone or from a
 * project: project_id/client_id are derived straight from `quote` (not
 * passed in), so linking or unlinking a project here just works.
 */
export function QuoteWorkspace({ quote, backHref, backLabel }: QuoteWorkspaceProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [shareUrl, setShareUrl] = useState<string | null>(null);

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
                { id: tmpId(), name: "", description: "", price: 0, is_optional: false, client_selected: false },
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
              is_optional: di.is_optional,
              sort_order: ii,
            });
          } else if (
            srv.name !== di.name ||
            (srv.description ?? null) !== desc ||
            Number(srv.price) !== di.price ||
            srv.is_optional !== di.is_optional ||
            srv.sort_order !== ii
          ) {
            await updateQuoteItem(srv.id, {
              name: di.name,
              description: desc,
              price: di.price,
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
      void logProjectEvent(projectId, "quote_sent", `Quote shared · ${formatCurrency(quoteTotalLive)}`, {
        quote_id: quote.id,
      });
      qc.invalidateQueries({ queryKey: ["project-events", projectId] });
      setShareUrl(`${window.location.origin}/quote/${token}`);
    },
    onError,
  });

  // --- derived amounts (from the draft) ---------------------------------
  const sectionSubtotal = (s: DraftSection) =>
    s.items.reduce((sum, i) => (itemIncluded(s, i) ? sum + i.price : sum), 0);
  const quoteTotalLive = draft.sections.reduce((sum, s) => sum + sectionSubtotal(s), 0);

  const materialsCost = materialsCogs(materials);
  const margin = quoteTotalLive - materialsCost;
  const marginPct = quoteTotalLive > 0 ? (margin / quoteTotalLive) * 100 : 0;
  const marginColor =
    quoteTotalLive === 0
      ? "text-muted-foreground"
      : marginPct > 20
        ? "text-success"
        : marginPct >= 10
          ? "text-warning"
          : "text-destructive";

  const meta = quoteStatusMeta(quote.status);
  const fin = demoQuoteFinancials(quoteTotalLive);
  const depositAmount = Math.round((quoteTotalLive * draft.depositPct) / 100);
  const persistedLink =
    quote.share_token && quote.status !== "draft"
      ? `${window.location.origin}/quote/${quote.share_token}`
      : null;

  const isDirty = dirty.current;

  return (
    <div className={cn("animate-fade-in space-y-5 max-w-5xl", isDirty && "pb-40 md:pb-28")}>
      <MobilePageHeader
        title={quote.project?.name ?? "Standalone quote"}
        subtitle={`${meta.label} · ${quote.client?.name ?? quote.project?.client?.name ?? "no client"}`}
        back={{ to: backHref, label: backLabel }}
        pills={
          <>
            <span className="badge-status !bg-white/20 !text-sidebar-foreground">{formatCurrency(quoteTotalLive)}</span>
            {projectId && (
              <span className="badge-status !bg-white/15 !text-sidebar-foreground/90">Margin {marginPct.toFixed(0)}%</span>
            )}
          </>
        }
      />

      <div className="hidden md:block">
        <Link to={backHref} className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">
                {quote.project?.name ?? "Standalone quote"}
              </h1>
              <StatusPill meta={meta} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {quote.client?.name ?? quote.project?.client?.name ?? "No client"}
            </p>
          </div>

          <div className="w-full shrink-0 space-y-3 md:w-80">
            <div className="card-surface p-4">
              <MoneyRow label="Line items + add-ons" value={formatCurrency(quoteTotalLive)} />
              <MoneyRow label={`Material markup ${fin.markupPct}%`} value={formatCurrency(fin.markupAmount)} />
              <MoneyRow label={`Sales tax ${fin.taxPct}% (materials)`} value={formatCurrency(fin.taxAmount)} />
            </div>
            <div className="rounded-card bg-foreground p-4 text-background">
              <div className="text-xs font-semibold text-background/70">Quote total</div>
              <div className="mt-1 text-[30px] font-extrabold leading-none tracking-tight tabular-nums">
                {formatCurrency(quoteTotalLive + fin.markupAmount + fin.taxAmount)}
              </div>
              <div className="mt-1.5 text-xs text-background/75">
                Deposit {draft.depositPct}% · {formatCurrency(depositAmount)} at signing
              </div>
            </div>
            {projectId ? (
              <div className="rounded-card bg-primary/10 p-3">
                <div className="flex justify-between text-xs font-semibold text-success">
                  <span>Est. cost</span>
                  <span>{formatCurrency(fin.estCost)}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs font-semibold text-success">
                  <span>Margin</span>
                  <span className={cn("text-[15px] font-extrabold", marginColor)}>{marginPct.toFixed(0)}%</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Link a project to track cost &amp; margin.</p>
            )}
          </div>
        </div>
      </div>

      <div className="stat-card grid grid-cols-1 sm:grid-cols-2 gap-5">
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
        <div className="stat-card flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Client link</p>
            <p className="font-mono text-sm truncate">{persistedLink}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShareUrl(persistedLink)}>
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      )}

      <div className="flex justify-start">
        <Button size="sm" onClick={addSection} className="font-bold">
          <Plus className="w-4 h-4 mr-2" />
          Add section
        </Button>
      </div>

      {draft.sections.length === 0 && (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No sections yet. Add a section to build the quote.</p>
        </div>
      )}

      {draft.sections.length > 0 && (
        <div className="space-y-4">
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
        </div>
      )}

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

      <div className="flex flex-wrap justify-end items-center gap-3">
        {quote.status === "draft" ? (
          <>
            {isDirty && (
              <p className="text-sm text-muted-foreground">Save your changes first.</p>
            )}
            <Button
              onClick={() => shareQuoteMut.mutate()}
              disabled={shareQuoteMut.isPending || isDirty}
              className="font-bold"
            >
              {shareQuoteMut.isPending ? "Preparing…" : "Share quote"}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            onClick={() => persistedLink && setShareUrl(persistedLink)}
            disabled={!persistedLink}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Share link
          </Button>
        )}
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
    <div className="stat-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={section.name}
            onChange={(e) => onRename(e.target.value)}
            placeholder="New section"
            className="h-9 max-w-xs font-semibold"
          />
          {section.is_optional && <span className="badge-status badge-draft shrink-0">Optional</span>}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <Label htmlFor={`optional-${section.id}`} className="text-xs text-muted-foreground">
              Optional section
            </Label>
            <Switch
              id={`optional-${section.id}`}
              checked={section.is_optional}
              onCheckedChange={onToggleOptional}
            />
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
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
        <div className="space-y-2 lg:space-y-1">
          {/* column headers — wide screens only; below lg the rows stack so
              the name & description always get a full-width line */}
          <div className="hidden gap-3 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-subtle lg:grid lg:grid-cols-[minmax(8rem,2fr)_minmax(8rem,2fr)_7rem_5rem_1.5rem]">
            <span>Item</span>
            <span>Description</span>
            <span className="text-right">Price</span>
            <span className="text-center">Optional</span>
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
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onAddItem}>
          <Plus className="w-4 h-4 mr-1" />
          Add item
        </Button>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Subtotal</span>
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
  const [priceStr, setPriceStr] = useState(String(item.price));
  useEffect(() => setPriceStr(String(item.price)), [item.price]);

  return (
    <div className="rounded-xl border border-hairline p-2.5 lg:grid lg:grid-cols-[minmax(8rem,2fr)_minmax(8rem,2fr)_7rem_5rem_1.5rem] lg:items-center lg:gap-3 lg:border-0 lg:p-0">
      <Input
        value={item.name}
        onChange={(e) => onEdit({ name: e.target.value })}
        placeholder="Item name"
        className="h-9"
      />
      <Input
        value={item.description}
        onChange={(e) => onEdit({ description: e.target.value })}
        placeholder="Short description"
        className="mt-2 h-9 lg:mt-0"
      />

      <div className="mt-2 flex items-center gap-2 lg:mt-0 lg:contents">
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
            className="h-9 pl-5 text-right"
            aria-label="Price"
          />
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground lg:justify-self-center">
          <Checkbox
            checked={item.is_optional}
            onCheckedChange={(c) => onEdit({ is_optional: c === true })}
          />
          <span className="lg:hidden">Optional</span>
        </label>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
