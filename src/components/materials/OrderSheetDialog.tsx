import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize } from "@/lib/utils";
import {
  createMaterialOrder,
  getBusinessProfile,
  touchSupplierUsage,
  type MaterialsItem,
  type MaterialsSection,
  type PriceBookItem,
  type ProductCatalogItem,
} from "@/lib/api";
import {
  combineOrderLines,
  groupByCategory,
  guessMaterialOrderUnit,
  orderCategoryGroup,
  resolveOrderLine,
  UNCATEGORIZED_LABEL,
  type ResolvedOrderLine,
} from "@/lib/orderSheet";
import { downloadOrderSheetPdf } from "@/lib/orderSheetPdf";
import { materialLineLabel } from "@/lib/materialsMath";

interface OrderSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  deliveryAddress: string | null;
  sections: MaterialsSection[];
  catalogItems: ProductCatalogItem[];
  priceBookItems: PriceBookItem[];
}

interface FlatItem {
  item: MaterialsItem;
  sectionName: string;
  category: string;
}

/**
 * "What do you want to order?" — picks a subset of a Materials Sheet's
 * lines, generates a supplier-facing PDF, and optionally marks the picked
 * lines as ordered (a real material_orders row, since Ordered is always
 * derived from material_order_items — see materialTracking.ts — never a
 * stored field on the sheet line itself). Two-step internal state, same
 * dialog: "select" -> "confirmOrdered".
 */
export function OrderSheetDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  deliveryAddress,
  sections,
  catalogItems,
  priceBookItems,
}: OrderSheetDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });

  const [step, setStep] = useState<"select" | "confirmOrdered">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobName, setJobName] = useState(projectName);
  const [address, setAddress] = useState(deliveryAddress ?? "");
  const [supplier, setSupplier] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingLines, setPendingLines] = useState<ResolvedOrderLine[]>([]);

  const catalogById = useMemo(() => new Map(catalogItems.map((c) => [c.id, c])), [catalogItems]);
  const priceBookById = useMemo(() => new Map(priceBookItems.map((p) => [p.id, p])), [priceBookItems]);

  const flatItems: FlatItem[] = useMemo(
    () =>
      sections.flatMap((s) =>
        s.materials_items.map((item) => {
          const catalogProduct = item.catalog_product_id ? catalogById.get(item.catalog_product_id) : undefined;
          const priceBookItem = item.price_book_item_id ? priceBookById.get(item.price_book_item_id) : undefined;
          const category = orderCategoryGroup(item.category ?? catalogProduct?.category ?? priceBookItem?.category ?? null);
          return { item, sectionName: s.name, category };
        }),
      ),
    [sections, catalogById, priceBookById],
  );

  const categories = useMemo(() => {
    const set = new Set(flatItems.map((f) => f.category));
    return [...set].sort((a, b) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b);
    });
  }, [flatItems]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, FlatItem[]>();
    for (const f of flatItems) {
      const list = map.get(f.category);
      if (list) list.push(f);
      else map.set(f.category, [f]);
    }
    return map;
  }, [flatItems]);

  const reset = () => {
    setStep("select");
    setSelectedIds(new Set());
    setJobName(projectName);
    setAddress(deliveryAddress ?? "");
    setSupplier("");
    setDateNeeded("");
    setNotes("");
    setPendingLines([]);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    const items = itemsByCategory.get(category) ?? [];
    const allSelected = items.every((f) => selectedIds.has(f.item.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const f of items) {
        if (allSelected) next.delete(f.item.id);
        else next.add(f.item.id);
      }
      return next;
    });
  };

  const generateMut = useMutation({
    mutationFn: async () => {
      const lines = flatItems
        .filter((f) => selectedIds.has(f.item.id))
        .map((f) => resolveOrderLine(f.item, catalogById, priceBookById));
      const groups = groupByCategory(combineOrderLines(lines));
      downloadOrderSheetPdf(
        {
          companyName: businessProfile?.company_name ?? null,
          projectName: jobName.trim() || projectName,
          deliveryAddress: address.trim() || null,
          supplier: supplier.trim() || null,
          dateNeeded: dateNeeded || null,
          notes: notes.trim() || null,
        },
        groups,
      );
      return lines;
    },
    onSuccess: (lines) => {
      setPendingLines(lines);
      setStep("confirmOrdered");
    },
    onError: (err: Error) => toast({ title: "Couldn't generate the order sheet", description: err.message, variant: "destructive" }),
  });

  const markOrderedMut = useMutation({
    mutationFn: () =>
      createMaterialOrder({
        project_id: projectId,
        supplier: supplier.trim() || null,
        expected_delivery_date: dateNeeded || null,
        notes: notes.trim() || null,
        items: pendingLines.map((l) => ({
          description: l.detail ? `${l.title} — ${l.detail}` : l.title,
          quantity: l.quantity,
          unit: guessMaterialOrderUnit(l.unit),
          materials_item_id: l.materialsItemId,
        })),
      }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ["material-orders", { project: projectId }] });
      qc.invalidateQueries({ queryKey: ["material-orders"] });
      if (order.supplier) void touchSupplierUsage(order.supplier);
      toast({ title: "Marked as ordered" });
      close();
    },
    onError: (err: Error) => toast({ title: "Couldn't mark as ordered", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        {step === "select" ? (
          <>
            <DialogHeader className="border-b border-hairline px-5 py-4">
              <DialogTitle>What do you want to order?</DialogTitle>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {categories.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => {
                    const items = itemsByCategory.get(category) ?? [];
                    const allSelected = items.length > 0 && items.every((f) => selectedIds.has(f.item.id));
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={cn(
                          "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors",
                          allSelected ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground",
                        )}
                      >
                        {allSelected && <Check className="h-3 w-3" />}
                        {category}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-4">
                {categories.map((category) => (
                  <div key={category}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{category}</p>
                    <div className="space-y-0.5">
                      {(itemsByCategory.get(category) ?? []).map(({ item }) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                        >
                          <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleItem(item.id)} />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{materialLineLabel(item) || "Untitled item"}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {item.quantity} {item.unit || ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {flatItems.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No line items on this sheet yet.</p>
                )}
              </div>

              <div className="space-y-3 border-t border-hairline pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="os-job-name">Project / job name</Label>
                  <Input id="os-job-name" value={jobName} onChange={(e) => setJobName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="os-address">Delivery address</Label>
                  <Textarea id="os-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Site address" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Supplier (optional)</Label>
                    <SupplierCombobox value={supplier} onChange={setSupplier} placeholder="Choose supplier…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="os-date">Date needed (optional)</Label>
                    <Input id="os-date" type="date" value={dateNeeded} onChange={(e) => setDateNeeded(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="os-notes">Notes (optional)</Label>
                  <Textarea
                    id="os-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Call before delivery, drop in driveway"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-4">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size > 0 ? pluralize(selectedIds.size, "item") + " selected" : "Nothing selected yet"}
              </span>
              <Button
                onClick={() => generateMut.mutate()}
                disabled={selectedIds.size === 0 || generateMut.isPending}
                className="font-bold"
              >
                <FileDown className="mr-1.5 h-4 w-4" />
                {generateMut.isPending ? "Generating…" : "Generate"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="px-5 pt-5">
              <DialogTitle>Mark these items as ordered?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                The order sheet downloaded. Marking these {pluralize(pendingLines.length, "item")} as ordered
                {supplier.trim() ? ` creates a pending delivery from ${supplier.trim()}` : " logs them as ordered"} and
                updates the Material Tracker.
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-hairline p-3 text-sm">
                {pendingLines.map((l) => (
                  <li key={l.materialsItemId} className="flex items-center justify-between gap-3 text-foreground">
                    <span className="min-w-0 truncate">{l.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {l.quantity} {l.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-4">
              <Button variant="outline" onClick={close} disabled={markOrderedMut.isPending}>
                Not now
              </Button>
              <Button onClick={() => markOrderedMut.mutate()} disabled={markOrderedMut.isPending} className="font-bold">
                {markOrderedMut.isPending ? "Saving…" : "Yes, mark as ordered"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
