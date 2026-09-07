import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2, Copy } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { MoneyRow } from "@/components/common/MoneyRow";
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
  quoteItemIncluded,
  materialsCogs,
  type Quote,
  type QuoteSection,
  type QuoteItem,
} from "@/lib/api";

const NONE = "__none__";

type LivePrices = Record<string, number>;

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
 * passed in), so linking or unlinking a project here just works — the
 * materials/margin panel and project-status-promotion on send react to
 * whatever `quote.project_id` currently is.
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

  const sections = quote.quote_sections;

  // Live prices drive instant total/margin recalculation; Supabase is only
  // written to on blur (see ItemRow). Re-seeded whenever the quote reloads.
  const [live, setLive] = useState<LivePrices>({});
  useEffect(() => {
    const next: LivePrices = {};
    for (const section of sections) {
      for (const item of section.quote_items) next[item.id] = Number(item.price);
    }
    setLive(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["quote", quote.id] });
    // Partial match also covers ["quotes", { project: id }] for the
    // project-scoped quotes list, and ["projects", id] for the headline-quote
    // summary on the project overview.
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

  const addSectionMut = useMutation({
    mutationFn: () =>
      addQuoteSection(quote.id, { name: "New section", sort_order: sections.length }),
    onSuccess: invalidate,
    onError,
  });
  const renameSectionMut = useMutation({
    mutationFn: (v: { id: string; name: string }) => updateQuoteSection(v.id, { name: v.name }),
    onSuccess: invalidate,
    onError,
  });
  const toggleSectionOptionalMut = useMutation({
    mutationFn: (v: { id: string; is_optional: boolean }) =>
      updateQuoteSection(v.id, { is_optional: v.is_optional }),
    onSuccess: invalidate,
    onError,
  });
  const deleteSectionMut = useMutation({
    mutationFn: (sectionId: string) => deleteQuoteSection(sectionId),
    onSuccess: invalidate,
    onError,
  });
  const addItemMut = useMutation({
    mutationFn: (v: { sectionId: string; sortOrder: number }) =>
      addQuoteItem(v.sectionId, { name: "", price: 0, sort_order: v.sortOrder }),
    onSuccess: invalidate,
    onError,
  });
  const saveItemMut = useMutation({
    mutationFn: (v: { itemId: string; patch: Parameters<typeof updateQuoteItem>[1] }) =>
      updateQuoteItem(v.itemId, v.patch),
    onSuccess: invalidate,
    onError,
  });
  const toggleItemOptionalMut = useMutation({
    mutationFn: (v: { itemId: string; is_optional: boolean }) =>
      updateQuoteItem(v.itemId, { is_optional: v.is_optional }),
    onSuccess: invalidate,
    onError,
  });
  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => deleteQuoteItem(itemId),
    onSuccess: invalidate,
    onError,
  });
  const saveFieldMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateQuote>[1]) => updateQuote(quote.id, patch),
    onSuccess: invalidate,
    onError,
  });
  const sendQuoteMut = useMutation({
    mutationFn: async () => {
      const token = quote.share_token ?? (await generateShareLink("quotes", quote.id));
      await updateQuote(quote.id, { status: "sent" });
      if (projectId) await updateProject(projectId, { status: "quote_sent" });
      return token;
    },
    onSuccess: (token) => {
      invalidate();
      setShareUrl(`${window.location.origin}/quote/${token}`);
    },
    onError,
  });

  const livePriceFor = (item: QuoteItem) => live[item.id] ?? Number(item.price);

  const sectionSubtotal = (section: QuoteSection) =>
    section.quote_items.reduce(
      (sum, item) => (quoteItemIncluded(section, item) ? sum + livePriceFor(item) : sum),
      0,
    );

  const quoteTotalLive = sections.reduce((sum, section) => sum + sectionSubtotal(section), 0);
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

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Share link", description: url });
    }
  };

  const meta = quoteStatusMeta(quote.status);
  const fin = demoQuoteFinancials(quoteTotalLive);
  const depositAmount = Math.round((quoteTotalLive * Number(quote.deposit_percentage)) / 100);
  const persistedLink =
    quote.share_token && quote.status !== "draft"
      ? `${window.location.origin}/quote/${quote.share_token}`
      : null;

  return (
    <div className="animate-fade-in space-y-5 max-w-5xl">
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
                Deposit {quote.deposit_percentage}% · {formatCurrency(depositAmount)} at signing
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
          <Button variant="outline" size="sm" onClick={() => copyLink(persistedLink)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy link
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => addSectionMut.mutate()}
          className="font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add section
        </Button>
      </div>

      {sections.length === 0 && (
        <div className="stat-card text-center py-12">
          <p className="text-muted-foreground">No sections yet. Add a section to build the quote.</p>
        </div>
      )}

      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((section) => (
            <QuoteSectionCard
              key={section.id}
              section={section}
              subtotal={sectionSubtotal(section)}
              onRename={(name) => renameSectionMut.mutate({ id: section.id, name })}
              onToggleOptional={(checked) =>
                toggleSectionOptionalMut.mutate({ id: section.id, is_optional: checked })
              }
              onDeleteSection={() => deleteSectionMut.mutate(section.id)}
              onAddItem={() =>
                addItemMut.mutate({ sectionId: section.id, sortOrder: section.quote_items.length })
              }
              onLivePriceChange={(itemId, price) => setLive((prev) => ({ ...prev, [itemId]: price }))}
              onSaveItem={(itemId, patch) => saveItemMut.mutate({ itemId, patch })}
              onToggleItemOptional={(itemId, checked) =>
                toggleItemOptionalMut.mutate({ itemId, is_optional: checked })
              }
              onDeleteItem={(itemId) => deleteItemMut.mutate(itemId)}
            />
          ))}
        </div>
      )}

      <div className="stat-card space-y-5">
        <div className="space-y-2">
          <Label htmlFor="quote-notes">Notes</Label>
          <Textarea
            id="quote-notes"
            defaultValue={quote.notes ?? ""}
            placeholder="Any notes for the client about this job..."
            onBlur={(e) => saveFieldMut.mutate({ notes: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quote-terms">Terms &amp; conditions</Label>
          <Textarea
            id="quote-terms"
            defaultValue={quote.terms ?? ""}
            placeholder="Payment terms, warranty info, etc."
            onBlur={(e) => saveFieldMut.mutate({ terms: e.target.value || null })}
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
              defaultValue={quote.deposit_percentage}
              className="pr-7"
              onBlur={(e) =>
                saveFieldMut.mutate({ deposit_percentage: parseFloat(e.target.value) || 0 })
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

      <div className="flex justify-end items-center gap-3">
        {quote.status === "draft" ? (
          <Button
            onClick={() => sendQuoteMut.mutate()}
            disabled={sendQuoteMut.isPending}
            className="font-bold"
          >
            {sendQuoteMut.isPending ? "Sending…" : "Send quote"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Quote {meta.label.toLowerCase()} — share link above.
          </p>
        )}
      </div>

      <Dialog open={!!shareUrl} onOpenChange={(open) => !open && setShareUrl(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quote sent</DialogTitle>
            <DialogDescription>
              Share this link with your client so they can review and approve the quote.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl ?? ""} className="font-mono text-sm" />
            <Button
              type="button"
              variant="outline"
              onClick={() => shareUrl && copyLink(shareUrl)}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface QuoteSectionCardProps {
  section: QuoteSection;
  subtotal: number;
  onRename: (name: string) => void;
  onToggleOptional: (checked: boolean) => void;
  onDeleteSection: () => void;
  onAddItem: () => void;
  onLivePriceChange: (itemId: string, price: number) => void;
  onSaveItem: (itemId: string, patch: { name?: string; description?: string | null; price?: number }) => void;
  onToggleItemOptional: (itemId: string, checked: boolean) => void;
  onDeleteItem: (itemId: string) => void;
}

function QuoteSectionCard({
  section,
  subtotal,
  onRename,
  onToggleOptional,
  onDeleteSection,
  onAddItem,
  onLivePriceChange,
  onSaveItem,
  onToggleItemOptional,
  onDeleteItem,
}: QuoteSectionCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(section.name);

  useEffect(() => setNameDraft(section.name), [section.name]);

  const items = section.quote_items;

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== section.name) onRename(trimmed);
    else setNameDraft(section.name);
  };

  return (
    <div className="stat-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {editingName ? (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setNameDraft(section.name);
                  setEditingName(false);
                }
              }}
              className="h-8 max-w-xs font-medium"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-left font-medium text-foreground hover:underline underline-offset-2 truncate"
            >
              {section.name || "Untitled section"}
            </button>
          )}
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
                    ? `This section has ${items.length} item${items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)}. Deleting it removes those items too. This can't be undone.`
                    : "This section is empty. This can't be undone."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDeleteSection}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium py-1 px-1">Item</th>
                <th className="text-left font-medium py-1 px-1">Description</th>
                <th className="text-right font-medium py-1 px-1 w-28">Price</th>
                <th className="text-center font-medium py-1 px-1 w-20">Optional</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <QuoteItemRow
                  key={item.id}
                  item={item}
                  onLivePriceChange={(price) => onLivePriceChange(item.id, price)}
                  onSave={(patch) => onSaveItem(item.id, patch)}
                  onToggleOptional={(checked) => onToggleItemOptional(item.id, checked)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onAddItem}>
          <Plus className="w-4 h-4 mr-1" />
          Add item
        </Button>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Subtotal</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}

interface QuoteItemRowProps {
  item: QuoteItem;
  onLivePriceChange: (price: number) => void;
  onSave: (patch: { name?: string; description?: string | null; price?: number }) => void;
  onToggleOptional: (checked: boolean) => void;
  onDelete: () => void;
}

function QuoteItemRow({
  item,
  onLivePriceChange,
  onSave,
  onToggleOptional,
  onDelete,
}: QuoteItemRowProps) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [priceStr, setPriceStr] = useState(String(item.price));

  useEffect(() => setName(item.name), [item.name]);
  useEffect(() => setDescription(item.description ?? ""), [item.description]);
  useEffect(() => setPriceStr(String(item.price)), [item.price]);

  const fieldClass =
    "h-8 border-0 shadow-none bg-transparent focus-visible:ring-1 focus-visible:ring-offset-0 px-2";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-1 px-0">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onSave({ name })}
          placeholder="Item name"
          className={fieldClass}
        />
      </td>
      <td className="py-1 px-0">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSave({ description: description || null })}
          placeholder="Short description"
          className={fieldClass}
        />
      </td>
      <td className="py-1 px-0">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            value={priceStr}
            onChange={(e) => {
              setPriceStr(e.target.value);
              onLivePriceChange(parseFloat(e.target.value) || 0);
            }}
            onBlur={() => onSave({ price: parseFloat(priceStr) || 0 })}
            className={`${fieldClass} text-right pl-5`}
          />
        </div>
      </td>
      <td className="py-1 px-1 text-center">
        <Checkbox checked={item.is_optional} onCheckedChange={(c) => onToggleOptional(c === true)} />
      </td>
      <td className="py-1 px-1">
        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
