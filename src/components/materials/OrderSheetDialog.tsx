import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileDown, Mail, Phone } from "lucide-react";
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
  listSuppliers,
  touchSupplierUsage,
  type MaterialsItem,
  type MaterialsSection,
  type PriceBookItem,
  type ProductCatalogItem,
  listMaterialCategories,
} from "@/lib/api";
import {
  combineOrderLines,
  groupByCategory,
  guessMaterialOrderUnit,
  orderCategoryGroup,
  lineCategoryName,
  resolveOrderLine,
  guessOrderCategory,
  UNCATEGORIZED_LABEL,
  type ResolvedOrderLine,
} from "@/lib/orderSheet";
import { downloadOrderSheetPdf, orderSheetPdfForEmail } from "@/lib/orderSheetPdf";
import { defaultOrderEmail } from "@/lib/orderSheetEmail";
import { EmailOrderSheetStep, type OrderSheetPdf } from "./EmailOrderSheetStep";
import { materialLineLabel, unitFor } from "@/lib/materialsMath";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

interface OrderSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  deliveryAddress: string | null;
  sections: MaterialsSection[];
  catalogItems: ProductCatalogItem[];
  priceBookItems: PriceBookItem[];
  /** Lines to start with selected (e.g. "Still to order" → Create order). */
  initialSelectedIds?: string[];
  /** Quantity still to order per line, in the line's unit (waste included) —
   * the sheet orders only what's left instead of the whole plan. */
  quantityOverrides?: Map<string, number>;
  /** After the order is recorded. */
  onOrdered?: () => void;
}

interface FlatItem {
  item: MaterialsItem;
  sectionName: string;
  category: string;
  /** What goes on the sheet by default: waste-adjusted, rounded up to the package. */
  orderQuantity: number;
  orderUnit: string | null;
  /** Still to order, in the order unit (before package rounding). */
  remaining: number;
}

const fmtQty = (v: number) => String(Math.round(v * 100) / 100);
/** A typed order quantity, or null when it isn't a number above 0. */
const parseQty = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return raw != null && raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * "Request supplier quote" (0168) — picks a subset of a Materials Sheet's
 * lines, generates a supplier-facing PDF, and optionally marks the picked
 * lines as ordered (a real material_orders row, since Ordered is always
 * derived from material_order_items — see materialTracking.ts — never a
 * stored field on the sheet line itself). Two-step internal state, same
 * dialog: "select" -> "confirmOrdered".
 */
function OrderSheetDialogInner({
  open,
  onOpenChange,
  projectId,
  projectName,
  deliveryAddress,
  sections,
  catalogItems,
  priceBookItems,
  initialSelectedIds,
  quantityOverrides,
  onOrdered,
}: OrderSheetDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: businessProfile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });

  const [step, setStep] = useState<"select" | "email" | "confirmOrdered">("select");
  // "Email to supplier": the built PDF (preview blob URL + base64), and who it went to.
  const [emailPdf, setEmailPdf] = useState<OrderSheetPdf | null>(null);
  const [emailDefaults, setEmailDefaults] = useState<{ subject: string; message: string } | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobName, setJobName] = useState(projectName);
  const [address, setAddress] = useState(deliveryAddress ?? "");
  // The dialog mounts before the project loads — fill the job name and
  // address each time it opens, not just from the first render's props.
  useEffect(() => {
    if (!open) return;
    setJobName(projectName);
    setAddress(deliveryAddress ?? "");
    if (initialSelectedIds?.length) setSelectedIds(new Set(initialSelectedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const [poNumber, setPoNumber] = useState("");
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });
  const [supplier, setSupplier] = useState("");
  const supplierRow = suppliers.find((s) => s.name.trim().toLowerCase() === supplier.trim().toLowerCase());
  const [dateNeeded, setDateNeeded] = useState("");
  const [notes, setNotes] = useState("");
  // 0162 — print line descriptions (on by default).
  const [includeDescriptions, setIncludeDescriptions] = useState(true);
  const [pendingLines, setPendingLines] = useState<ResolvedOrderLine[]>([]);
  // "Order qty" per line — any amount above 0; prefilled with what's left.
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  const catalogById = useMemo(() => new Map(catalogItems.map((c) => [c.id, c])), [catalogItems]);
  const { data: materialCategories = [] } = useQuery({ queryKey: ["material-categories"], queryFn: listMaterialCategories });
  const materialCategoryNameById = useMemo(
    () => new Map(materialCategories.map((c) => [c.id, c.name])),
    [materialCategories],
  );
  // Categories that ask for a color (0162).
  const colorCategoryIds = useMemo(() => new Set(materialCategories.filter((c) => c.needs_color).map((c) => c.id)), [materialCategories]);
  const priceBookById = useMemo(() => new Map(priceBookItems.map((p) => [p.id, p])), [priceBookItems]);

  const flatItems: FlatItem[] = useMemo(
    () =>
      sections.flatMap((s) =>
        s.materials_items
          // Nothing to order on a 0-quantity line.
          .filter((item) => Number(item.quantity) > 0)
          // Only what's left to order: a copy of the line at the remaining
          // quantity (waste already in it), so packages still round up.
          .map((item) => {
            const left = quantityOverrides?.get(item.id);
            return left != null ? ({ ...item, quantity: left, waste_percent: 0 } as MaterialsItem) : item;
          })
          // Fully ordered already — nothing left to put on a sheet.
          .filter((item) => Number(item.quantity) > 0)
          .map((item) => {
            const catalogProduct = item.catalog_product_id ? catalogById.get(item.catalog_product_id) : undefined;
            const priceBookItem = item.price_book_item_id ? priceBookById.get(item.price_book_item_id) : undefined;
            const category = orderCategoryGroup(
              lineCategoryName(item, materialCategoryNameById) ?? catalogProduct?.category ?? priceBookItem?.category ?? guessOrderCategory(item.name),
            );
            const order = resolveOrderLine(item, catalogById, priceBookById, materialCategoryNameById);
            const remaining = Number(item.quantity) * (1 + (Number(item.waste_percent) || 0) / 100);
            return { item, sectionName: s.name, category, orderQuantity: order.quantity, orderUnit: order.unit, remaining };
          }),
      ),
    [sections, catalogById, priceBookById, materialCategoryNameById, quantityOverrides],
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
    setPoNumber("");
    setPendingLines([]);
    setQtyById({});
    if (emailPdf) URL.revokeObjectURL(emailPdf.url);
    setEmailPdf(null);
    setEmailDefaults(null);
    setEmailedTo(null);
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

  const qtyRaw = (f: FlatItem) => qtyById[f.item.id] ?? fmtQty(f.orderQuantity);
  const selectedFlat = flatItems.filter((f) => selectedIds.has(f.item.id));
  const badQty = selectedFlat.some((f) => parseQty(qtyRaw(f)) == null);
  // Only the entered quantity goes on the sheet, the email and the order.
  const selectedLines = () =>
    selectedFlat.map((f) => ({
      ...resolveOrderLine(f.item, catalogById, priceBookById, materialCategoryNameById, colorCategoryIds),
      quantity: parseQty(qtyRaw(f)) ?? f.orderQuantity,
    }));
  const missingColorCount = selectedLines().filter((l) => l.missingColor).length;
  const sheetHeader = () => ({
    includeDescriptions,
    missingColorCount,
    companyName: businessProfile?.company_name ?? null,
    projectName: jobName.trim() || projectName,
    deliveryAddress: address.trim() || null,
    supplier: supplier.trim() || null,
    dateNeeded: dateNeeded || null,
    notes: notes.trim() || null,
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      const lines = selectedLines();
      downloadOrderSheetPdf(sheetHeader(), groupByCategory(combineOrderLines(lines)));
      return lines;
    },
    onSuccess: (lines) => {
      setPendingLines(lines);
      setStep("confirmOrdered");
    },
    onError: (err: Error) => toast({ title: "Couldn't generate the order sheet", description: err.message, variant: "destructive" }),
  });

  // Same PDF, previewed and emailed instead of downloaded.
  const startEmail = () => {
    try {
      const lines = selectedLines();
      const built = orderSheetPdfForEmail(sheetHeader(), groupByCategory(combineOrderLines(lines)));
      if (emailPdf) URL.revokeObjectURL(emailPdf.url);
      setEmailPdf({ filename: built.filename, base64: built.base64, url: URL.createObjectURL(built.blob) });
      setEmailDefaults(
        defaultOrderEmail({ supplier, jobName: jobName.trim() || projectName, company: businessProfile?.company_name ?? null, dateNeeded, address }),
      );
      setPendingLines(lines);
      setStep("email");
    } catch (err) {
      toast({ title: "Couldn't build the order sheet", description: (err as Error).message, variant: "destructive" });
    }
  };

  const markOrderedMut = useMutation({
    mutationFn: () =>
      createMaterialOrder({
        project_id: projectId,
        supplier: supplier.trim() || null,
        expected_delivery_date: dateNeeded || null,
        notes: notes.trim() || null,
        po_number: poNumber.trim() || null,
        // A request, not a purchase yet — Mark paid when the supplier's quote is paid.
        payment_status: "quote_requested",
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
      toast({ title: "Quote request saved", description: "Mark it paid in Materials when you pay the supplier." });
      onOrdered?.();
      close();
    },
    onError: (err: Error) => toast({ title: "Couldn't save the quote request", description: err.message, variant: "destructive" }),
  });

  /** The order as plain text — for Copy and the mail-app draft. */
  const orderText = () => {
    const email = defaultOrderEmail({ supplier, jobName: jobName.trim() || projectName, company: businessProfile?.company_name ?? null, dateNeeded, address });
    const lines = combineOrderLines(pendingLines).map((l) => `• ${l.title}${l.detail ? ` (${l.detail})` : ""} — ${l.quantity} ${l.unit ?? ""}`.trimEnd());
    const body = email.message.replace("Attached is the material list", "Here's the material list").replace("\nCould", `\n\n${lines.join("\n")}\n\nCould`);
    return { subject: email.subject, body: `${body}\n\n(Order sheet PDF attached.)` };
  };
  const mailtoOrder = () => {
    const t = orderText();
    return `mailto:${encodeURIComponent(supplierRow?.email ?? "")}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
  };
  const copyOrder = async () => {
    const t = orderText();
    try {
      await navigator.clipboard.writeText(`${t.subject}\n\n${t.body}`);
      toast({ title: "Order copied", description: "Paste it into a text or email." });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className={cn("flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0", step === "email" ? "max-w-2xl" : "max-w-lg")}>
        {step === "select" ? (
          <>
            <DialogHeader className="border-b border-hairline px-5 py-4">
              <DialogTitle>Request a supplier quote</DialogTitle>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {flatItems.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Select all that apply</span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold text-muted-foreground">{selectedIds.size} selected</span>
                    {flatItems.length > 5 && (
                      <>
                        <button type="button" onClick={() => setSelectedIds(new Set(flatItems.map((f) => f.item.id)))} className="font-semibold text-primary hover:underline">
                          Select all
                        </button>
                        <button type="button" onClick={() => setSelectedIds(new Set())} className="font-semibold text-muted-foreground hover:text-foreground hover:underline">
                          Clear
                        </button>
                      </>
                    )}
                  </span>
                </div>
              )}
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
                      {(itemsByCategory.get(category) ?? []).map((f) => {
                        const { item, sectionName, orderQuantity, orderUnit, remaining } = f;
                        const on = selectedIds.has(item.id);
                        const raw = qtyRaw(f);
                        const entered = parseQty(raw);
                        const over = entered != null ? entered - remaining : 0;
                        return (
                          <div key={item.id} className="rounded-lg hover:bg-muted/50">
                            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-2 py-2 sm:min-h-0">
                              <Checkbox checked={on} onCheckedChange={() => toggleItem(item.id)} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-foreground">{materialLineLabel(item) || "Untitled item"}</span>
                                {/* Which feature — several sections can have a "Wall Block". */}
                                <span className="block truncate text-xs text-muted-foreground">{sectionName}</span>
                              </span>
                              {!on && (
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {orderQuantity} {orderUnit || ""}
                                </span>
                              )}
                            </label>
                            {/* Order part of it now, the rest later. */}
                            {on && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 pl-9 pr-2">
                                <Label htmlFor={`os-qty-${item.id}`} className="text-xs font-semibold text-muted-foreground">
                                  Order qty
                                </Label>
                                <Input
                                  id={`os-qty-${item.id}`}
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  value={raw}
                                  onChange={(e) => setQtyById((m) => ({ ...m, [item.id]: e.target.value }))}
                                  className={cn("h-10 w-24 tabular-nums", entered == null && "border-destructive")}
                                  aria-describedby={`os-qty-hint-${item.id}`}
                                />
                                <span id={`os-qty-hint-${item.id}`} className="text-xs text-muted-foreground">
                                  of {fmtQty(remaining)} {unitFor(remaining, orderUnit)} remaining
                                  {entered == null
                                    ? " · enter an amount above 0"
                                    : over > 0.005
                                      ? ` · ${fmtQty(over)} more than planned`
                                      : ""}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={includeDescriptions} onCheckedChange={(v) => setIncludeDescriptions(v === true)} />
                  Include descriptions
                </label>
                {missingColorCount > 0 && (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning-strong">
                    {pluralize(missingColorCount, "item")} missing a color — the sheet will flag it. Add colors in the Cost plan first if you can.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4">
              <span className="text-xs text-muted-foreground">
                {selectedIds.size > 0 ? pluralize(selectedIds.size, "item") + " selected" : "Nothing selected yet"}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={startEmail} disabled={selectedIds.size === 0 || badQty || generateMut.isPending}>
                  <Mail className="mr-1.5 h-4 w-4" />
                  Email to supplier
                </Button>
                <Button
                  onClick={() => generateMut.mutate()}
                  disabled={selectedIds.size === 0 || badQty || generateMut.isPending}
                  className="font-bold"
                >
                  <FileDown className="mr-1.5 h-4 w-4" />
                  {generateMut.isPending ? "Building…" : "Download PDF"}
                </Button>
              </div>
            </div>
          </>
        ) : step === "email" && emailPdf && emailDefaults ? (
          <EmailOrderSheetStep
            projectId={projectId}
            pdf={emailPdf}
            supplier={supplier}
            onSupplierChange={setSupplier}
            defaults={emailDefaults}
            onBack={() => setStep("select")}
            onSent={(to) => {
              setEmailedTo(to);
              setStep("confirmOrdered");
            }}
          />
        ) : (
          <>
            <DialogHeader className="px-5 pt-5">
              <DialogTitle>Save this quote request?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                {emailedTo ? `The list was emailed to ${emailedTo}.` : "The list downloaded."} Saving it adds a purchase
                {supplier.trim() ? ` from ${supplier.trim()}` : ""} in "Quote requested" with these {pluralize(pendingLines.length, "item")} — mark it
                paid when you pay the supplier's quote.
              </p>
              {!emailedTo && (
                <div className="flex flex-wrap gap-2">
                  {/* No in-app email set up (or not wanted): the PDF is downloaded — attach it. */}
                  <Button asChild variant="outline" size="sm">
                    <a href={mailtoOrder()}>
                      <Mail className="mr-1.5 h-4 w-4" /> Email in your mail app
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void copyOrder()}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy order
                  </Button>
                  {supplierRow?.phone && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`tel:${supplierRow.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="mr-1.5 h-4 w-4" /> Call {supplierRow.name}
                      </a>
                    </Button>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="os-po">Supplier PO / confirmation # (optional)</Label>
                <Input id="os-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. SO-48213" />
              </div>
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
                {markOrderedMut.isPending ? "Saving…" : "Save quote request"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const OrderSheetDialog = withErrorBoundary(OrderSheetDialogInner, "OrderSheetDialog");
