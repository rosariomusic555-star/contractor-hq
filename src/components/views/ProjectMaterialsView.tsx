import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2, BookOpen, Lock, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DraftSaveBar } from "@/components/common/DraftSaveBar";
import { AutoGrowTextarea } from "@/components/common/AutoGrowTextarea";
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
import {
  getProject,
  listMaterials,
  listExpenseCategories,
  listPriceBookItems,
  listProductCatalog,
  listCatalogPriceOverrides,
  upsertCatalogPriceOverride,
  createMaterialsSection,
  updateMaterialsSection,
  deleteMaterialsSection,
  addMaterialsItem,
  updateMaterialsItem,
  deleteMaterialsItem,
  type MaterialsSection,
  type ExpenseCategory,
  type PriceBookItem,
  type ProductCatalogItem,
  type CatalogPriceOverride,
} from "@/lib/api";
import { SmartCalculatorDialog } from "@/components/materials/SmartCalculatorDialog";
import type { GeneratedMaterialItem } from "@/lib/materialsCalculators";

/** Fixed, code-level list so every brand shows in the Catalog tab even
 * before it has any products — otherwise brands with zero rows would
 * silently vanish instead of showing "No products yet." */
const CATALOG_BRANDS = ["Techo-Bloc", "Belgard", "Keystone", "Unilock", "Cambridge Pavers"];

const NONE = "__none__";

// ---------------------------------------------------------------------------
// Draft model — the whole sheet is edited locally and only written to
// Supabase when "Save changes" is pressed. New rows get a "tmp-" id.
// ---------------------------------------------------------------------------

interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  /** Optional cost category (Settings > Expense categories). Null = uncategorized. */
  expense_category_id: string | null;
  /** Free-text unit of measure (sf, cy, bag, lf, ea…). Not part of the math. */
  unit: string;
  /** Set when this line was picked from the Price Book — locks
   * expense_category_id in the UI. Null = a normal custom line (or a pick
   * that's since been unlinked). */
  price_book_item_id: string | null;
  /** Set when this line was picked from the Product Catalog instead — a
   * line is ever linked to at most one of price_book_item_id /
   * catalog_product_id, never both. */
  catalog_product_id: string | null;
  /** Reference-only, every line regardless of source — not part of the
   * quantity*unit_cost math. */
  waste_percent: number;
  /** Draft-only UI state, never persisted itself — when true, saving this
   * item also upserts its unit_cost into catalog_price_overrides. Reset to
   * false after every save. */
  rememberPrice: boolean;
}
interface DraftSection {
  id: string;
  name: string;
  items: DraftItem[];
}

const tmpId = () => `tmp-${crypto.randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const seed = (sections: MaterialsSection[]): DraftSection[] =>
  sections.map((s) => ({
    id: s.id,
    name: s.name,
    items: s.materials_items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
      expense_category_id: i.expense_category_id ?? null,
      unit: i.unit ?? "",
      price_book_item_id: i.price_book_item_id ?? null,
      catalog_product_id: i.catalog_product_id ?? null,
      waste_percent: Number(i.waste_percent ?? 0),
      rememberPrice: false,
    })),
  }));

const itemChanged = (
  a: DraftItem,
  b: {
    name: string;
    quantity: number;
    unit_cost: number;
    expense_category_id: string | null;
    unit: string;
    price_book_item_id: string | null;
    catalog_product_id: string | null;
    waste_percent: number;
  },
) =>
  a.name !== b.name ||
  a.quantity !== b.quantity ||
  a.unit_cost !== b.unit_cost ||
  a.expense_category_id !== b.expense_category_id ||
  a.unit !== b.unit ||
  a.price_book_item_id !== b.price_book_item_id ||
  a.catalog_product_id !== b.catalog_product_id ||
  a.waste_percent !== b.waste_percent;

export function ProjectMaterialsView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const { data: sections = [], isLoading, isError, error } = useQuery({
    queryKey: ["materials", { project: id }],
    queryFn: () => listMaterials(id),
    refetchOnWindowFocus: false,
  });
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });
  const { data: priceBookItems = [] } = useQuery({
    queryKey: ["price-book"],
    queryFn: listPriceBookItems,
  });
  const { data: catalogItems = [] } = useQuery({
    queryKey: ["product-catalog"],
    queryFn: listProductCatalog,
  });
  const { data: priceOverrides = [] } = useQuery({
    queryKey: ["catalog-price-overrides"],
    queryFn: listCatalogPriceOverrides,
  });

  const [draft, setDraft] = useState<DraftSection[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const dirty = useRef(false);

  // Seed the draft from the server — but never clobber unsaved edits.
  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed(sections));
  }, [sections]);

  const markDirty = () => {
    dirty.current = true;
  };
  const edit = (fn: (d: DraftSection[]) => DraftSection[]) => {
    markDirty();
    setDraft((d) => fn(d));
  };

  const discard = () => {
    dirty.current = false;
    setDraft(seed(sections));
  };

  // --- local mutators -------------------------------------------------------
  const renameSection = (sid: string, name: string) =>
    edit((d) => d.map((s) => (s.id === sid ? { ...s, name } : s)));
  const deleteSection = (sid: string) => edit((d) => d.filter((s) => s.id !== sid));
  const addSection = () =>
    edit((d) => [...d, { id: tmpId(), name: "", items: [] }]);
  // Smart Calculator output lands as an ordinary new draft section — its
  // items are indistinguishable from manually-added ones from this point
  // on (no "generated" marker anywhere), so everything below (edit,
  // delete, add more rows, Save) treats it exactly the same.
  const addGeneratedSection = (name: string, items: GeneratedMaterialItem[]) =>
    edit((d) => [
      ...d,
      {
        id: tmpId(),
        name,
        items: items.map((i) => ({ id: tmpId(), ...i })),
      },
    ]);
  const addItem = (sid: string) =>
    edit((d) =>
      d.map((s) =>
        s.id === sid
          ? {
              ...s,
              items: [
                ...s.items,
                {
                  id: tmpId(),
                  name: "",
                  quantity: 0,
                  unit_cost: 0,
                  expense_category_id: null,
                  unit: "",
                  price_book_item_id: null,
                  catalog_product_id: null,
                  waste_percent: 0,
                  rememberPrice: false,
                },
              ],
            }
          : s,
      ),
    );
  const editItem = (sid: string, iid: string, patch: Partial<DraftItem>) =>
    edit((d) =>
      d.map((s) =>
        s.id === sid
          ? { ...s, items: s.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }
          : s,
      ),
    );
  const deleteItem = (sid: string, iid: string) =>
    edit((d) =>
      d.map((s) => (s.id === sid ? { ...s, items: s.items.filter((i) => i.id !== iid) } : s)),
    );

  // --- save (diff draft against the server data) --------------------------
  const saveMut = useMutation({
    mutationFn: async () => {
      const serverSections = new Map(sections.map((s) => [s.id, s]));
      const draftSectionIds = new Set(draft.map((s) => s.id));

      // 1. deletes — server sections no longer in the draft (cascades their items)
      for (const s of sections) {
        if (!draftSectionIds.has(s.id)) await deleteMaterialsSection(s.id);
      }

      // 2. per section: create / rename, then its items
      for (let si = 0; si < draft.length; si++) {
        const ds = draft[si];
        const name = ds.name.trim() || "New section";
        let sectionId = ds.id;
        const server = serverSections.get(ds.id);

        if (!server) {
          const created = await createMaterialsSection(id, { name, sort_order: si });
          sectionId = created.id;
        } else if (server.name !== name) {
          await updateMaterialsSection(server.id, { name });
        }

        const serverItems = new Map((server?.materials_items ?? []).map((i) => [i.id, i]));
        const draftItemIds = new Set(ds.items.filter((i) => !isTmp(i.id)).map((i) => i.id));

        // 2a. item deletes (skip if the section itself is new — nothing to delete)
        if (server) {
          for (const i of server.materials_items) {
            if (!draftItemIds.has(i.id)) await deleteMaterialsItem(i.id);
          }
        }

        // 2b. item creates / updates
        for (let ii = 0; ii < ds.items.length; ii++) {
          const di = ds.items[ii];
          const srv = serverItems.get(di.id);
          const unit = di.unit.trim() || null;
          if (!srv) {
            await addMaterialsItem(sectionId, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              sort_order: ii,
              expense_category_id: di.expense_category_id,
              unit,
              price_book_item_id: di.price_book_item_id,
              catalog_product_id: di.catalog_product_id,
              waste_percent: di.waste_percent,
            });
          } else if (
            itemChanged(di, {
              name: srv.name,
              quantity: Number(srv.quantity),
              unit_cost: Number(srv.unit_cost),
              expense_category_id: srv.expense_category_id ?? null,
              unit: srv.unit ?? "",
              price_book_item_id: srv.price_book_item_id ?? null,
              catalog_product_id: srv.catalog_product_id ?? null,
              waste_percent: Number(srv.waste_percent ?? 0),
            })
          ) {
            await updateMaterialsItem(srv.id, {
              name: di.name,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              expense_category_id: di.expense_category_id,
              unit,
              price_book_item_id: di.price_book_item_id,
              catalog_product_id: di.catalog_product_id,
              waste_percent: di.waste_percent,
            });
          }

          // "Remember this price for next time" — a draft-only toggle, saved
          // as a per-user override keyed to the catalog product, independent
          // of this specific materials_item row.
          if (di.rememberPrice && di.catalog_product_id) {
            await upsertCatalogPriceOverride(di.catalog_product_id, di.unit_cost);
          }
        }
      }
    },
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["materials", { project: id }] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["catalog-price-overrides"] });
      toast({ title: "Materials sheet saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const grandTotal = useMemo(
    () =>
      draft.reduce(
        (sum, s) => sum + s.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0),
        0,
      ),
    [draft],
  );

  const isDirty = dirty.current;

  return (
    <div className={cn("mx-auto max-w-4xl animate-fade-in space-y-5", isDirty && "pb-40 md:pb-28")}>
      <Link
        to={`/projects/${id}`}
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to project
      </Link>

      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Materials sheet</h1>
        <p className="mt-1 text-muted-foreground">{project?.name ?? " "}</p>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-background/55">
            Total cost
          </span>
          <span className="text-[26px] font-extrabold tracking-tight tabular-nums text-background">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading materials sheet…</p>}
      {isError && <p className="text-destructive">Failed to load materials: {(error as Error).message}</p>}

      {!isLoading && !isError && draft.length === 0 && (
        <div className="card-surface p-12 text-center text-muted-foreground">
          Add a section to get started.
        </div>
      )}

      {draft.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          expenseCategories={expenseCategories}
          priceBookItems={priceBookItems}
          catalogItems={catalogItems}
          priceOverrides={priceOverrides}
          onRename={(name) => renameSection(section.id, name)}
          onDelete={() => deleteSection(section.id)}
          onAddItem={() => addItem(section.id)}
          onEditItem={(iid, patch) => editItem(section.id, iid, patch)}
          onDeleteItem={(iid) => deleteItem(section.id, iid)}
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
          onClick={() => setCalculatorOpen(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-primary/30 bg-primary/5 text-[15px] font-bold text-primary transition-colors hover:border-primary hover:bg-primary/10"
        >
          <Sparkles className="h-4 w-4" />
          Use Smart Calculator
        </button>
      </div>

      <DraftSaveBar
        visible={isDirty}
        onDiscard={discard}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
      />

      <SmartCalculatorDialog
        open={calculatorOpen}
        onOpenChange={setCalculatorOpen}
        priceBookItems={priceBookItems}
        onGenerate={addGeneratedSection}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SectionCardProps {
  section: DraftSection;
  expenseCategories: ExpenseCategory[];
  priceBookItems: PriceBookItem[];
  catalogItems: ProductCatalogItem[];
  priceOverrides: CatalogPriceOverride[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onEditItem: (itemId: string, patch: Partial<DraftItem>) => void;
  onDeleteItem: (itemId: string) => void;
}

function SectionCard({
  section,
  expenseCategories,
  priceBookItems,
  catalogItems,
  priceOverrides,
  onRename,
  onDelete,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: SectionCardProps) {
  const subtotal = section.items.reduce((a, i) => a + i.quantity * i.unit_cost, 0);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
      {/* Slate section header — editable name + running subtotal */}
      <div className="flex items-center justify-between gap-5 bg-sidebar px-5 py-4">
        <input
          value={section.name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="New section"
          className="-ml-2.5 min-w-0 flex-1 rounded-lg border-none bg-transparent px-2.5 py-1 text-[19px] font-bold tracking-tight text-background outline-none transition placeholder:font-semibold placeholder:text-background/40 hover:bg-white/[0.08] focus:bg-white/[0.12] focus:ring-2 focus:ring-primary"
        />
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-background/55">{pluralize(section.items.length, "item")}</div>
          <div className="mt-0.5 text-[19px] font-extrabold tracking-tight tabular-nums text-background">
            {formatCurrency(subtotal)}
          </div>
        </div>
      </div>

      {/* Delete */}
      <div className="flex items-center justify-end border-b border-hairline px-5 py-2.5">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete section
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{section.name || "this section"}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {section.items.length > 0
                  ? `Removes ${section.items.length} item${section.items.length === 1 ? "" : "s"} totaling ${formatCurrency(subtotal)} from the sheet. Nothing is saved until you press Save changes.`
                  : "This section is empty."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-3 p-[18px]">
        {section.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            expenseCategories={expenseCategories}
            priceBookItems={priceBookItems}
            catalogItems={catalogItems}
            priceOverrides={priceOverrides}
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

const ITEM_FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";

interface ItemRowProps {
  item: DraftItem;
  expenseCategories: ExpenseCategory[];
  priceBookItems: PriceBookItem[];
  catalogItems: ProductCatalogItem[];
  priceOverrides: CatalogPriceOverride[];
  onEdit: (patch: Partial<DraftItem>) => void;
  onDelete: () => void;
}

/** package_coverage = coverage_per_unit × units_per_package, then round the
 * entered quantity up to the nearest whole multiple of that. Returns null
 * when the catalog product doesn't carry both specs, or the quantity is
 * already a clean multiple (nothing to nudge). */
function nextOrderableQuantity(
  quantity: number,
  specs: ProductCatalogItem["specs"] | undefined,
): number | null {
  const coverage = Number(specs?.coverage_per_unit);
  const perPackage = Number(specs?.units_per_package);
  if (!coverage || !perPackage || quantity <= 0) return null;
  const packageCoverage = coverage * perPackage;
  const packages = quantity / packageCoverage;
  if (Math.abs(packages - Math.round(packages)) < 1e-9) return null;
  return Math.ceil(packages) * packageCoverage;
}

function ItemRow({
  item,
  expenseCategories,
  priceBookItems,
  catalogItems,
  priceOverrides,
  onEdit,
  onDelete,
}: ItemRowProps) {
  // Local string state so a half-typed number ("1.", "0.0") isn't reformatted
  // out from under the cursor. Re-synced when the draft is reseeded.
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [costStr, setCostStr] = useState(String(item.unit_cost));
  const [wasteStr, setWasteStr] = useState(String(item.waste_percent));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  useEffect(() => setQtyStr(String(item.quantity)), [item.quantity]);
  useEffect(() => setCostStr(String(item.unit_cost)), [item.unit_cost]);
  useEffect(() => setWasteStr(String(item.waste_percent)), [item.waste_percent]);
  useEffect(() => setNudgeDismissed(false), [item.quantity, item.catalog_product_id]);

  const total = item.quantity * item.unit_cost;
  const linked = item.price_book_item_id != null;
  const catalogProduct = catalogItems.find((c) => c.id === item.catalog_product_id);
  const catalogLinked = catalogProduct != null;
  const linkedCategoryName =
    expenseCategories.find((c) => c.id === item.expense_category_id)?.name ?? "Uncategorized";

  const applyPick = (pbi: PriceBookItem) => {
    onEdit({
      name: pbi.name,
      unit: pbi.unit ?? "",
      unit_cost: Number(pbi.unit_price),
      expense_category_id: pbi.expense_category_id,
      price_book_item_id: pbi.id,
      catalog_product_id: null,
      rememberPrice: false,
    });
    setPickerOpen(false);
  };

  const applyCatalogPick = (product: ProductCatalogItem) => {
    const override = priceOverrides.find((o) => o.catalog_product_id === product.id);
    onEdit({
      name: product.name,
      unit: product.unit ?? "",
      unit_cost: override?.price ?? 0,
      price_book_item_id: null,
      catalog_product_id: product.id,
      rememberPrice: false,
    });
    setPickerOpen(false);
  };

  const orderableQty = catalogLinked
    ? nextOrderableQuantity(item.quantity, catalogProduct?.specs)
    : null;

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-hairline p-4 transition-shadow hover:border-input hover:shadow-card-hover">
      {/* Item name + price book picker + delete */}
      <div className="grid grid-cols-[minmax(0,1fr)_1.75rem_1.75rem] items-end gap-3">
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
          onClick={() => setPickerOpen(true)}
          className={cn(
            "mb-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors",
            linked || catalogLinked
              ? "bg-primary/15 text-primary hover:bg-primary/25"
              : "text-muted-subtle hover:bg-primary/10 hover:text-primary",
          )}
          aria-label="Pick from Price Book or Catalog"
        >
          <BookOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="mb-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Category — its own full-width row so the picked name is never
          truncated/clipped on mobile. Locked (read-only) once this line is
          linked to a Price Book item — that's what's meant to keep cost
          categorization consistent; unlink to edit it directly again. */}
      <div>
        <div className="flex items-center justify-between">
          <div className={ITEM_FIELD_LABEL}>Category</div>
          {linked && (
            <button
              type="button"
              onClick={() => onEdit({ price_book_item_id: null })}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Unlink
            </button>
          )}
        </div>
        {linked ? (
          <div className="mt-1 flex h-[42px] items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-subtle" />
            <span className="truncate">{linkedCategoryName}</span>
          </div>
        ) : (
          <Select
            value={item.expense_category_id ?? NONE}
            onValueChange={(v) => onEdit({ expense_category_id: v === NONE ? null : v })}
          >
            <SelectTrigger className="mt-1 h-[42px]" aria-label="Category">
              <SelectValue placeholder="Uncategorized" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Uncategorized</SelectItem>
              {expenseCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Qty · Unit · Waste % · Unit cost · Total — two-up on mobile, five-up from sm. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
          {orderableQty != null && !nudgeDismissed && (
            <div className="mt-1.5 flex items-start justify-between gap-1.5 rounded-md bg-warning/15 px-2 py-1.5 text-[11px] leading-snug text-warning">
              <span>
                {item.quantity} {item.unit || "units"} required · next orderable quantity:{" "}
                {orderableQty} {item.unit || "units"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setQtyStr(String(orderableQty));
                    onEdit({ quantity: orderableQty });
                  }}
                  className="font-bold text-primary hover:underline"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setNudgeDismissed(true)}
                  aria-label="Dismiss"
                  className="text-muted-subtle hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit</div>
          <Input
            value={item.unit}
            onChange={(e) => onEdit({ unit: e.target.value })}
            placeholder="sf, cy, bag…"
            className="mt-1 h-[42px]"
            aria-label="Unit"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Waste %</div>
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={wasteStr}
            onChange={(e) => {
              setWasteStr(e.target.value);
              onEdit({ waste_percent: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Waste percent"
          />
        </label>
        <label className="block">
          <div className={ITEM_FIELD_LABEL}>Unit cost</div>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={costStr}
            onChange={(e) => {
              setCostStr(e.target.value);
              onEdit({ unit_cost: parseFloat(e.target.value) || 0 });
            }}
            className="mt-1 h-[42px] tabular-nums"
            aria-label="Unit cost"
          />
          {catalogLinked && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Checkbox
                checked={item.rememberPrice}
                onCheckedChange={(v) => onEdit({ rememberPrice: v === true })}
              />
              Remember this price for next time
            </label>
          )}
        </label>
        <div>
          <div className={ITEM_FIELD_LABEL}>Total</div>
          <div className="mt-1 flex h-[42px] items-center justify-end rounded-md bg-primary/10 px-3 text-base font-extrabold tabular-nums text-success">
            {formatCurrency(total)}
          </div>
        </div>
      </div>

      <MaterialPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        priceBookItems={priceBookItems}
        expenseCategories={expenseCategories}
        catalogItems={catalogItems}
        onSelectPriceBook={applyPick}
        onSelectCatalog={applyCatalogPick}
      />
    </div>
  );
}

function MaterialPickerDialog({
  open,
  onOpenChange,
  priceBookItems,
  expenseCategories,
  catalogItems,
  onSelectPriceBook,
  onSelectCatalog,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceBookItems: PriceBookItem[];
  expenseCategories: ExpenseCategory[];
  catalogItems: ProductCatalogItem[];
  onSelectPriceBook: (item: PriceBookItem) => void;
  onSelectCatalog: (item: ProductCatalogItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Pick a material</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="price-book" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="price-book">Price Book</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>
          <TabsContent value="price-book" className="mt-2 min-h-0 flex-1 overflow-hidden">
            <PriceBookTabContent
              priceBookItems={priceBookItems}
              expenseCategories={expenseCategories}
              onSelect={onSelectPriceBook}
            />
          </TabsContent>
          <TabsContent value="catalog" className="mt-2 min-h-0 flex-1 overflow-hidden">
            <CatalogTabContent catalogItems={catalogItems} onSelect={onSelectCatalog} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PriceBookTabContent({
  priceBookItems,
  expenseCategories,
  onSelect,
}: {
  priceBookItems: PriceBookItem[];
  expenseCategories: ExpenseCategory[];
  onSelect: (item: PriceBookItem) => void;
}) {
  const [filter, setFilter] = useState("");

  const categoryName = (categoryId: string | null) =>
    expenseCategories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
  const filtered = priceBookItems.filter((i) =>
    i.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {priceBookItems.length > 0 && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search your saved materials…"
          autoFocus
        />
      )}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {priceBookItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Your Price Book is empty. Add items in Settings → Price Book, then pick them here
            instead of retyping them every job.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {filtered.map((pbi) => (
              <button
                key={pbi.id}
                type="button"
                onClick={() => onSelect(pbi)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{pbi.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {pbi.unit ? `${pbi.unit} · ` : ""}
                    {formatCurrency(pbi.unit_price)} · {categoryName(pbi.expense_category_id)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type CatalogDrillLevel =
  | { level: "brands" }
  | { level: "categories"; brand: string }
  | { level: "products"; brand: string; category: string };

function CatalogTabContent({
  catalogItems,
  onSelect,
}: {
  catalogItems: ProductCatalogItem[];
  onSelect: (item: ProductCatalogItem) => void;
}) {
  const [filter, setFilter] = useState("");
  const [drill, setDrill] = useState<CatalogDrillLevel>({ level: "brands" });

  const search = filter.trim().toLowerCase();
  const searchResults = search
    ? catalogItems.filter(
        (p) =>
          p.name.toLowerCase().includes(search) || (p.sku ?? "").toLowerCase().includes(search),
      )
    : null;

  const categoriesForBrand = (brand: string) =>
    Array.from(
      new Set(catalogItems.filter((p) => p.manufacturer === brand).map((p) => p.category)),
    ).sort();

  const productsFor = (brand: string, category: string) =>
    catalogItems.filter((p) => p.manufacturer === brand && p.category === category);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search catalog by name or SKU…"
        autoFocus
      />

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {searchResults.map((p) => (
                <CatalogProductRow key={p.id} product={p} onSelect={onSelect} />
              ))}
            </div>
          )
        ) : drill.level === "brands" ? (
          <div className="divide-y divide-hairline">
            {CATALOG_BRANDS.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => setDrill({ level: "categories", brand })}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold text-foreground">{brand}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
              </button>
            ))}
          </div>
        ) : drill.level === "categories" ? (
          <div className="flex flex-col gap-2">
            <BackRow label={drill.brand} onClick={() => setDrill({ level: "brands" })} />
            {categoriesForBrand(drill.brand).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No {drill.brand} products yet.
              </p>
            ) : (
              <div className="divide-y divide-hairline">
                {categoriesForBrand(drill.brand).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setDrill({ level: "products", brand: drill.brand, category })}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="text-sm font-semibold text-foreground">{category}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <BackRow
              label={drill.category}
              onClick={() => setDrill({ level: "categories", brand: drill.brand })}
            />
            <div className="divide-y divide-hairline">
              {productsFor(drill.brand, drill.category).map((p) => (
                <CatalogProductRow key={p.id} product={p} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 self-start text-xs font-bold text-primary hover:underline"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function CatalogProductRow({
  product,
  onSelect,
}: {
  product: ProductCatalogItem;
  onSelect: (item: ProductCatalogItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{product.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {product.manufacturer} · {product.category}
          {product.sku ? ` · SKU ${product.sku}` : ""}
        </div>
      </div>
    </button>
  );
}
