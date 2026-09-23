import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, BookOpen, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
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
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, pluralize } from "@/lib/utils";
import {
  listPriceBookItems,
  createPriceBookItem,
  updatePriceBookItem,
  deletePriceBookItem,
  listExpenseCategories,
  MATERIAL_TYPES,
  materialTypeLabel,
  ORDER_SHEET_CATEGORIES,
  type PriceBookItem,
  type PriceBookItemSpecs,
  type ExpenseCategory,
} from "@/lib/api";

const NONE = "__none__";

/**
 * Real, persisted CRUD list (price_book table, 0027) — a user's own saved
 * materials, picked from the Materials Sheet to auto-fill a line instead of
 * retyping it every job (see ProjectMaterialsView's PriceBookPicker).
 * Deliberately starts empty for every user — never seeded, since these are
 * specific to each contractor's own suppliers and pricing.
 */
export function SettingsPricebookView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceBookItem | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["price-book"],
    queryFn: listPriceBookItems,
  });
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["price-book"] });
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const createMut = useMutation({
    mutationFn: (input: {
      name: string;
      unit: string | null;
      unit_price: number;
      expense_category_id: string | null;
      material_type: string | null;
      category: string | null;
      specs: PriceBookItemSpecs;
    }) => createPriceBookItem(input),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Item added" });
    },
    onError,
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          PriceBookItem,
          "name" | "unit" | "unit_price" | "expense_category_id" | "material_type" | "category" | "specs"
        >
      >;
    }) => updatePriceBookItem(id, patch),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Item saved" });
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePriceBookItem(id),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Item deleted" });
    },
    onError,
  });

  const categoryName = (id: string | null) =>
    expenseCategories.find((c) => c.id === id)?.name ?? "Uncategorized";

  const openCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };
  const openEdit = (item: PriceBookItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Price Book" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Price Book</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center justify-between bg-sidebar px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-bold text-background">Your saved materials</span>
          </div>
          {items.length > 0 && (
            <span className="text-xs font-semibold text-background/70">
              {pluralize(items.length, "item")}
            </span>
          )}
        </div>

        <div className="bg-card p-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Save the materials you buy most — pavers, base, sand — once, and pick them on any
                job's Materials Sheet instead of retyping them every time. Picking one also fills
                in its cost category automatically.
              </p>
              <Button onClick={openCreate} className="mt-4 h-11 rounded-xl font-bold">
                <Plus className="h-4 w-4" />
                Add your first item
              </Button>
            </div>
          ) : (
            <>
              <div className="-mx-5 divide-y divide-hairline">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openEdit(item)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {item.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.unit ? `${item.unit} · ` : ""}
                        {formatCurrency(item.unit_price)} · {categoryName(item.expense_category_id)}
                        {item.material_type && ` · ${materialTypeLabel(item.material_type)}`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
                  </button>
                ))}
              </div>
              <Button
                onClick={openCreate}
                variant="outline"
                className="mt-5 h-11 w-full rounded-xl font-bold"
              >
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            </>
          )}
        </div>
      </div>

      <PriceBookItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
        expenseCategories={expenseCategories}
        saving={createMut.isPending || updateMut.isPending}
        deleting={deleteMut.isPending}
        onCreate={(input) => createMut.mutate(input)}
        onUpdate={(patch) => editingItem && updateMut.mutate({ id: editingItem.id, patch })}
        onDelete={() => editingItem && deleteMut.mutate(editingItem.id)}
      />
    </div>
  );
}

function PriceBookItemDialog({
  open,
  onOpenChange,
  item,
  expenseCategories,
  saving,
  deleting,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PriceBookItem | null;
  expenseCategories: ExpenseCategory[];
  saving: boolean;
  deleting: boolean;
  onCreate: (input: {
    name: string;
    unit: string | null;
    unit_price: number;
    expense_category_id: string | null;
    material_type: string | null;
    category: string | null;
    specs: PriceBookItemSpecs;
  }) => void;
  onUpdate: (
    patch: Partial<
      Pick<PriceBookItem, "name" | "unit" | "unit_price" | "expense_category_id" | "material_type" | "category" | "specs">
    >,
  ) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [materialType, setMaterialType] = useState<string | null>(null);
  const [orderCategory, setOrderCategory] = useState<string | null>(null);
  const [specStr, setSpecStr] = useState<Record<keyof PriceBookItemSpecs, string>>({
    coverage_per_pallet_sqft: "",
    units_per_pallet: "",
    length_in: "",
    width_in: "",
    thickness_in: "",
    joint_width_in: "",
    coverage_per_bag_sqft: "",
  });

  // Re-seed the form whenever a different item is opened (or the dialog
  // opens fresh for a new one).
  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setUnit(item?.unit ?? "");
    setPriceStr(item ? String(item.unit_price) : "");
    setCategoryId(item?.expense_category_id ?? null);
    setMaterialType(item?.material_type ?? null);
    setOrderCategory(item?.category ?? null);
    setSpecStr({
      coverage_per_pallet_sqft: item?.specs?.coverage_per_pallet_sqft?.toString() ?? "",
      units_per_pallet: item?.specs?.units_per_pallet?.toString() ?? "",
      length_in: item?.specs?.length_in?.toString() ?? "",
      width_in: item?.specs?.width_in?.toString() ?? "",
      thickness_in: item?.specs?.thickness_in?.toString() ?? "",
      joint_width_in: item?.specs?.joint_width_in?.toString() ?? "",
      coverage_per_bag_sqft: item?.specs?.coverage_per_bag_sqft?.toString() ?? "",
    });
  }, [open, item]);

  const canSave = name.trim().length > 0 && categoryId != null;

  const handleSave = () => {
    if (!canSave) return;
    const specs: PriceBookItemSpecs = {};
    for (const [key, value] of Object.entries(specStr) as [keyof PriceBookItemSpecs, string][]) {
      const parsed = parseFloat(value);
      if (value.trim() && !Number.isNaN(parsed)) specs[key] = parsed;
    }
    const payload = {
      name: name.trim(),
      unit: unit.trim() || null,
      unit_price: parseFloat(priceStr) || 0,
      expense_category_id: categoryId,
      material_type: materialType,
      category: orderCategory,
      specs,
    };
    if (item) onUpdate(payload);
    else onCreate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pb-name">Name</Label>
            <Input
              id="pb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Techo-Bloc Blu 60mm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pb-unit">Unit</Label>
              <Input
                id="pb-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="sf, cy, bag…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-price">Unit price</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="pb-price"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  placeholder="0.00"
                  className="pl-6"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pb-category">Category</Label>
            <Select value={categoryId ?? ""} onValueChange={(v) => setCategoryId(v)}>
              <SelectTrigger id="pb-category" aria-label="Category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-subtle">
              Required — used to lock in consistent cost tracking when this item is picked on a
              job.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pb-material-type">Material type (optional)</Label>
            <Select
              value={materialType ?? NONE}
              onValueChange={(v) => setMaterialType(v === NONE ? null : v)}
            >
              <SelectTrigger id="pb-material-type" aria-label="Material type">
                <SelectValue placeholder="Not calculator-relevant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not calculator-relevant</SelectItem>
                {MATERIAL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-subtle">
              Lets the Materials Sheet's Smart Calculator find and use this specific product.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pb-order-category">Material category (optional)</Label>
            <Select
              value={orderCategory ?? NONE}
              onValueChange={(v) => setOrderCategory(v === NONE ? null : v)}
            >
              <SelectTrigger id="pb-order-category" aria-label="Material category">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorized</SelectItem>
                {ORDER_SHEET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-subtle">
              Prefills the category on a Materials Sheet line when this item is picked — used to
              group a generated Order Sheet.
            </p>
          </div>

          {materialType && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
              <p className="text-xs font-semibold text-foreground">
                Product specs — used for calculator order-quantity math, all optional
              </p>
              <div className="grid grid-cols-2 gap-3">
                <SpecField
                  label="Coverage / pallet"
                  suffix="sq ft"
                  value={specStr.coverage_per_pallet_sqft}
                  onChange={(v) => setSpecStr((s) => ({ ...s, coverage_per_pallet_sqft: v }))}
                />
                <SpecField
                  label="Units / pallet"
                  suffix="ea"
                  value={specStr.units_per_pallet}
                  onChange={(v) => setSpecStr((s) => ({ ...s, units_per_pallet: v }))}
                />
                <SpecField
                  label="Length"
                  suffix="in"
                  value={specStr.length_in}
                  onChange={(v) => setSpecStr((s) => ({ ...s, length_in: v }))}
                />
                <SpecField
                  label="Width"
                  suffix="in"
                  value={specStr.width_in}
                  onChange={(v) => setSpecStr((s) => ({ ...s, width_in: v }))}
                />
                <SpecField
                  label="Thickness"
                  suffix="in"
                  value={specStr.thickness_in}
                  onChange={(v) => setSpecStr((s) => ({ ...s, thickness_in: v }))}
                />
                <SpecField
                  label="Joint width"
                  suffix="in"
                  value={specStr.joint_width_in}
                  onChange={(v) => setSpecStr((s) => ({ ...s, joint_width_in: v }))}
                />
                <SpecField
                  label="Coverage / bag"
                  suffix="sq ft"
                  value={specStr.coverage_per_bag_sqft}
                  onChange={(v) => setSpecStr((s) => ({ ...s, coverage_per_bag_sqft: v }))}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {item ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Materials Sheet lines picked from this item keep their current values — they
                    just become editable again instead of being locked to this entry.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={!canSave || saving} className="font-bold">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpecField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 pr-10 text-sm"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}
