import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Loader2, Package, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import {
  getSignedImageUrls,
  saveSelectionGroup,
  saveSelectionTemplate,
  uploadSelectionImage,
  type MaterialsItem,
  type ProductCatalogItem,
  type QuoteSelectionGroup,
  type SelectionGroupDraft,
  type SelectionOptionDraft,
} from "@/lib/api";
import { CatalogPicker } from "@/components/materials/CatalogPicker";
import { priceLabel } from "@/lib/selections";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

type PriceMode = "included" | "add" | "discount";
const NONE = "__none__";

interface OptionRow extends SelectionOptionDraft {
  key: string;
  mode: PriceMode;
  amount: string;
  cost: string;
  linkUnitCost: string;
}

const toRow = (o: Partial<SelectionOptionDraft> & { id?: string }): OptionRow => {
  const p = Number(o.price_delta) || 0;
  return {
    key: o.id ?? crypto.randomUUID(),
    id: o.id,
    name: o.name ?? "",
    description: o.description ?? "",
    image_path: o.image_path ?? null,
    catalog_product_id: o.catalog_product_id ?? null,
    color: o.color ?? null,
    price_delta: p,
    cost_delta: Number(o.cost_delta) || 0,
    link_item_id: o.link_item_id ?? null,
    link_set: o.link_set ?? {},
    is_default: !!o.is_default,
    mode: p > 0 ? "add" : p < 0 ? "discount" : "included",
    amount: p ? String(Math.abs(p)) : "",
    cost: o.cost_delta ? String(o.cost_delta) : "",
    linkUnitCost: o.link_set?.unit_cost != null ? String(o.link_set.unit_cost) : "",
  };
};

/**
 * Add / edit a client selection group on a quote section (0115): name,
 * help text, required, single / multiple choice, and its options — name,
 * description, photo, price adjustment (Included / + / −), an internal cost
 * adjustment and Cost plan link (never shown to the client), and the
 * default. "Add from Catalog" turns picked product colors into options.
 */
function SelectionGroupDialogInner({
  open,
  onOpenChange,
  quoteSectionId,
  group,
  initial,
  sortOrder,
  linkableLines,
  catalogItems,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quoteSectionId: string;
  /** Edit an existing group… */
  group?: QuoteSelectionGroup | null;
  /** …or start from a template. */
  initial?: Partial<SelectionGroupDraft> | null;
  sortOrder: number;
  /** The Cost plan lines this section's feature has — link targets. */
  linkableLines: MaterialsItem[];
  catalogItems: ProductCatalogItem[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [help, setHelp] = useState("");
  const [required, setRequired] = useState(true);
  const [multi, setMulti] = useState(false);
  const [rows, setRows] = useState<OptionRow[]>([]);
  const [asTemplate, setAsTemplate] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogProduct, setCatalogProduct] = useState<ProductCatalogItem | null>(null);
  const [catalogColors, setCatalogColors] = useState<string[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const src = group
      ? { name: group.name, help_text: group.help_text, required: group.required, multi: group.multi, options: group.quote_selection_options ?? [] }
      : initial ?? null;
    setName(src?.name ?? "");
    setHelp(src?.help_text ?? "");
    setRequired(src?.required ?? true);
    setMulti(src?.multi ?? false);
    setRows((src?.options ?? []).map((o) => toRow(o as SelectionOptionDraft)));
    setAsTemplate(false);
    setCatalogProduct(null);
    setCatalogColors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id]);

  const paths = rows.map((r) => r.image_path).filter(Boolean) as string[];
  const { data: urls = {} } = useQuery({
    queryKey: ["selection-image-urls", paths.join(",")],
    queryFn: () => getSignedImageUrls(paths),
    enabled: open && paths.length > 0,
  });

  const edit = (key: string, patch: Partial<OptionRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setDefault = (key: string, on: boolean) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, is_default: on } : multi ? r : { ...r, is_default: on ? false : r.is_default })));

  const addFromCatalog = () => {
    if (!catalogProduct) return;
    const colors = catalogColors.length ? catalogColors : [null];
    setRows((rs) => [
      ...rs,
      ...colors.map((c) =>
        toRow({
          name: c ? `${catalogProduct.name} — ${c}` : catalogProduct.name,
          catalog_product_id: catalogProduct.id,
          color: c,
          price_delta: 0,
          cost_delta: 0,
          is_default: false,
        }),
      ),
    ]);
    setCatalogProduct(null);
    setCatalogColors([]);
  };

  const draft = (): SelectionGroupDraft => ({
    id: group?.id,
    name,
    help_text: help,
    required,
    multi,
    options: rows.map((r) => {
      const amt = Number(r.amount) || 0;
      const price = r.mode === "included" ? 0 : r.mode === "add" ? amt : -amt;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        image_path: r.image_path,
        catalog_product_id: r.catalog_product_id,
        color: r.color,
        price_delta: price,
        cost_delta: Number(r.cost) || 0,
        link_item_id: r.link_item_id,
        link_set: r.link_item_id
          ? {
              catalog_product_id: r.catalog_product_id ?? null,
              color: r.color ?? null,
              unit_cost: r.linkUnitCost.trim() ? Number(r.linkUnitCost) : null,
              name: null,
            }
          : {},
        is_default: r.is_default,
      };
    }),
  });

  const invalid = !name.trim() ? "Name the group" : rows.length < 2 ? "Add at least two options" : rows.some((r) => !r.name.trim()) ? "Every option needs a name" : null;

  const save = useMutation({
    mutationFn: async () => {
      const d = draft();
      await saveSelectionGroup(quoteSectionId, d, sortOrder);
      if (asTemplate) {
        await saveSelectionTemplate({
          name: d.name,
          help_text: d.help_text ?? null,
          required: d.required,
          multi: d.multi,
          options: d.options.map(({ id, link_item_id, link_set, ...o }) => o),
        });
      }
    },
    onSuccess: () => {
      toast({ title: group ? "Selection updated" : "Selection added", description: asTemplate ? "Also saved as a template." : undefined });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  const lineLabel = (l: MaterialsItem) => `${l.name}${l.unit ? ` (${l.unit})` : ""}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{group ? "Edit client selection" : "Add client selection"}</DialogTitle>
            <DialogDescription>The client picks from exactly these options — nothing else from the Catalog.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sel-name">Name</Label>
                <Input id="sel-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paver color" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sel-help">Help text (optional)</Label>
                <Input id="sel-help" value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Pick the color for the main field" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={required} onCheckedChange={(v) => setRequired(!!v)} />
                Required
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={multi} onCheckedChange={(v) => setMulti(!!v)} />
                Client can choose more than one
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-foreground">Options</div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setCatalogOpen(true)}>
                  <Package className="mr-1 h-3.5 w-3.5" />
                  Add from Catalog
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, toRow({ name: "", price_delta: 0, cost_delta: 0, is_default: rs.length === 0 })])}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add option
                </Button>
              </div>
            </div>

            {catalogProduct && (
              <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {catalogProduct.manufacturer} {catalogProduct.name}
                  </span>
                  <button type="button" onClick={() => setCatalogProduct(null)} aria-label="Cancel">
                    <X className="h-4 w-4 text-muted-subtle" />
                  </button>
                </div>
                {(catalogProduct.colors ?? []).length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">Pick the colors to offer — one option each.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {catalogProduct.colors!.map((c) => {
                        const on = catalogColors.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCatalogColors((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))}
                            className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", on ? "border-primary bg-primary/15" : "border-border")}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No colors on file — it'll be added as one option.</p>
                )}
                <Button size="sm" onClick={addFromCatalog}>
                  Add {catalogColors.length > 1 ? `${catalogColors.length} options` : "option"}
                </Button>
              </div>
            )}

            {rows.length === 0 && <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">No options yet.</p>}
            {rows.map((r, idx) => (
              <div key={r.key} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40" title="Photo">
                    {uploadingKey === r.key ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-subtle" />
                    ) : r.image_path && urls[r.image_path] ? (
                      <img src={urls[r.image_path]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-4 w-4 text-muted-subtle" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setUploadingKey(r.key);
                        try {
                          edit(r.key, { image_path: await uploadSelectionImage(f) });
                        } catch (err) {
                          toast({ title: "Couldn't upload", description: (err as Error).message, variant: "destructive" });
                        } finally {
                          setUploadingKey(null);
                        }
                      }}
                    />
                  </label>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input value={r.name} onChange={(e) => edit(r.key, { name: e.target.value })} placeholder={`Option ${idx + 1} name`} />
                    <Textarea rows={1} value={r.description ?? ""} onChange={(e) => edit(r.key, { description: e.target.value })} placeholder="Description (optional)" />
                  </div>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove option" className="p-1 text-muted-subtle hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
                  <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Price">
                    {(
                      [
                        ["included", "Included"],
                        ["add", "+ Add"],
                        ["discount", "− Discount"],
                      ] as const
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={r.mode === m}
                        onClick={() => edit(r.key, { mode: m })}
                        className={cn("rounded-md px-2.5 py-1", r.mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {r.mode !== "included" ? (
                    <Input inputMode="decimal" value={r.amount} onChange={(e) => edit(r.key, { amount: e.target.value })} placeholder="Amount ($)" />
                  ) : (
                    <div />
                  )}
                  <Input
                    inputMode="decimal"
                    value={r.cost}
                    onChange={(e) => edit(r.key, { cost: e.target.value })}
                    placeholder="Internal cost change ($)"
                    title="Internal only — what this option adds to (or saves on) your cost. Never shown to the client."
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_140px] sm:items-center">
                  <Select value={r.link_item_id ?? NONE} onValueChange={(v) => edit(r.key, { link_item_id: v === NONE ? null : v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Changes a Cost plan line (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No Cost plan link</SelectItem>
                      {linkableLines.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          Sets line: {lineLabel(l)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {r.link_item_id ? (
                    <Input
                      inputMode="decimal"
                      value={r.linkUnitCost}
                      onChange={(e) => edit(r.key, { linkUnitCost: e.target.value })}
                      placeholder="New unit cost"
                      className="h-9 text-xs"
                    />
                  ) : (
                    <div />
                  )}
                </div>
                {r.link_item_id && (
                  <p className="text-[11px] text-muted-foreground">
                    On approval the line takes {r.catalog_product_id ? "this Catalog product" : "this option"}
                    {r.color ? ` in ${r.color}` : ""}
                    {r.linkUnitCost ? ` at ${formatCurrency(Number(r.linkUnitCost))}/unit` : ""}. Internal only.
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <Checkbox checked={r.is_default} onCheckedChange={(v) => setDefault(r.key, !!v)} />
                    Default (preselected)
                  </label>
                  <span className="text-muted-foreground">
                    Client sees: <span className="font-semibold text-foreground">{priceLabel(r.mode === "included" ? 0 : (r.mode === "add" ? 1 : -1) * (Number(r.amount) || 0))}</span>
                    {(Number(r.cost) || 0) !== 0 && (
                      <span className="ml-2">
                        · margin {formatCurrency((r.mode === "included" ? 0 : (r.mode === "add" ? 1 : -1) * (Number(r.amount) || 0)) - (Number(r.cost) || 0))}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={asTemplate} onCheckedChange={(v) => setAsTemplate(!!v)} />
            Also save this group as a template for future quotes
          </label>

          {invalid && <p className="text-xs text-muted-foreground">{invalid}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!!invalid || save.isPending}>
              {save.isPending ? "Saving…" : "Save selection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Add from Catalog</DialogTitle>
          </DialogHeader>
          <CatalogPicker
            catalogItems={catalogItems}
            onSelect={(product) => {
              setCatalogProduct(product);
              setCatalogColors([]);
              setCatalogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const SelectionGroupDialog = withErrorBoundary(SelectionGroupDialogInner, "SelectionGroupDialog");
