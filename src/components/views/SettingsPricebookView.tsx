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
  type PriceBookItem,
  type ExpenseCategory,
} from "@/lib/api";

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
      patch: Partial<Pick<PriceBookItem, "name" | "unit" | "unit_price" | "expense_category_id">>;
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
  }) => void;
  onUpdate: (
    patch: Partial<Pick<PriceBookItem, "name" | "unit" | "unit_price" | "expense_category_id">>,
  ) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  // Re-seed the form whenever a different item is opened (or the dialog
  // opens fresh for a new one).
  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setUnit(item?.unit ?? "");
    setPriceStr(item ? String(item.unit_price) : "");
    setCategoryId(item?.expense_category_id ?? null);
  }, [open, item]);

  const canSave = name.trim().length > 0 && categoryId != null;

  const handleSave = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      unit: unit.trim() || null,
      unit_price: parseFloat(priceStr) || 0,
      expense_category_id: categoryId,
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
