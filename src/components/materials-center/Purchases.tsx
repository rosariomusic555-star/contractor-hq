import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileUp, Loader2, MoreHorizontal, PackageCheck, Plus, ScanLine, ShoppingBag, Trash2, Truck } from "lucide-react";
import {
  addMaterialOrderImage,
  addMaterialOrderItem,
  createMaterialOrder,
  deleteMaterialOrderItem,
  getSignedImageUrls,
  listExpenses,
  listMaterialReturns,
  touchSupplierUsage,
  updateMaterialOrder,
  updateMaterialOrderItem,
  uploadPurchaseAttachment,
  MATERIAL_ORDER_UNITS,
  type MaterialCategory,
  type MaterialOrder,
  type MaterialOrderUnit,
  type MaterialReturn,
  type MaterialsItem,
  type MaterialsSection,
  type PurchaseFulfillment,
  type PurchasePaymentStatus,
} from "@/lib/api";
import { extractReceipt } from "@/lib/assistant";
import { matchReceiptToOrderLines } from "@/lib/materialsCenter";
import { materialLineLabel, unitFor } from "@/lib/materialsMath";
import { guessMaterialOrderUnit } from "@/lib/orderSheet";
import {
  deletePurchase,
  fulfillmentOf,
  isOnSite,
  isPaid,
  linesIndex,
  localToday,
  logPickup,
  purchaseTitle,
  purchaseTotal,
  recordReturn,
  syncPurchaseExpense,
} from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResponsiveModal } from "@/components/common/ResponsiveModal";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, pluralize } from "@/lib/utils";

const today = () => localToday();
const shortDate = (iso: string | null | undefined) =>
  // A date ("2026-10-07") is a calendar day; a timestamp is shown in local time.
  iso ? new Date(iso.length > 10 ? iso : `${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const qty = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");
const num = (s: string) => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const BIG = "h-12 text-base sm:h-10 sm:text-sm";
/** "486 sq ft", "32 tons", "1 pallet" — an order line's unit in words. */
const SHORT_UNIT: Record<string, [string, string]> = {
  square_foot: ["sq ft", "sq ft"],
  linear_foot: ["ft", "ft"],
  cubic_yard: ["cu yd", "cu yd"],
  each: ["", ""],
};
const unitWords = (q: number, unit: string | null | undefined) => {
  const u = unit ?? "";
  if (SHORT_UNIT[u]) return SHORT_UNIT[u][Math.abs(q - 1) < 1e-9 ? 0 : 1];
  const m = MATERIAL_ORDER_UNITS.find((x) => x.value === u);
  return m ? (Math.abs(q - 1) < 1e-9 ? m.label.toLowerCase() : m.plural) : unitFor(q, u);
};

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useInvalidate(projectId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["material-orders"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["material-returns", projectId] });
    qc.invalidateQueries({ queryKey: ["materials-center"] });
    qc.invalidateQueries({ queryKey: ["precon", projectId] });
  };
}

// --- The list -----------------------------------------------------------------

/**
 * A job's supplier purchases — a short list: who, what, how much, paid or
 * just requested, Delivery or Pickup, and on site yet. The next step is the
 * big button (Mark paid / Mark delivered / Mark picked up); the rest is in ⋯.
 */
export function PurchasesSection({
  projectId,
  orders,
  sections,
  materialCategories,
}: {
  projectId: string;
  orders: MaterialOrder[];
  sections: MaterialsSection[];
  materialCategories: MaterialCategory[];
}) {
  const { toast } = useToast();
  const invalidate = useInvalidate(projectId);
  const { data: returns = [] } = useQuery({ queryKey: ["material-returns", projectId], queryFn: () => listMaterialReturns(projectId) });
  const lines = useMemo(() => linesIndex(sections), [sections]);
  const lineCost = useMemo(() => new Map([...lines.entries()].map(([id, l]) => [id, l.unit_cost])), [lines]);
  const returnable = useMemo(() => new Set(materialCategories.filter((c) => c.returnable).map((c) => c.id)), [materialCategories]);
  const [editing, setEditing] = useState<MaterialOrder | "new" | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [paying, setPaying] = useState<MaterialOrder | null>(null);
  const [receiving, setReceiving] = useState<MaterialOrder | null>(null);
  const [returning, setReturning] = useState<MaterialOrder | null>(null);
  const [linking, setLinking] = useState<MaterialOrder | null>(null);

  const sorted = [...orders].sort((a, b) => (b.paid_on ?? b.created_at).localeCompare(a.paid_on ?? a.created_at));
  const delMut = useMutation({
    mutationFn: (o: MaterialOrder) => deletePurchase(o, returns.filter((r) => r.material_order_id === o.id && r.expense_id).map((r) => r.expense_id!)),
    onSuccess: () => {
      invalidate();
      toast({ title: "Purchase deleted" });
    },
    onError: (err: Error) => toast({ title: "Couldn't delete", description: err.message, variant: "destructive" }),
  });
  const openAttachment = async (path: string) => {
    const urls = await getSignedImageUrls([path]);
    if (urls[path]) window.open(urls[path], "_blank", "noopener");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button className={cn("flex-1 font-bold sm:flex-none", BIG)} onClick={() => setPickupOpen(true)}>
          <ShoppingBag className="mr-1.5 h-4 w-4" /> Log pickup
        </Button>
        <Button variant="outline" className={cn("flex-1 sm:flex-none", BIG)} onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 h-4 w-4" /> Add purchase
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchases yet — request a supplier quote from Still to purchase, or log a pickup.</p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((o) => {
            const total = purchaseTotal(o, lineCost);
            const paid = isPaid(o);
            const onSite = isOnSite(o);
            const method = fulfillmentOf(o);
            const myReturns = returns.filter((r) => r.material_order_id === o.id);
            const canReturn =
              onSite && (o.material_order_items ?? []).some((i) => i.materials_item_id && returnable.has(lines.get(i.materials_item_id)?.line.material_category_id ?? ""));
            const items = o.material_order_items ?? [];
            const PurchaseMenu = () => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`More for ${purchaseTitle(o)}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(o)}>Edit</DropdownMenuItem>
                  {o.attachment_path && <DropdownMenuItem onSelect={() => void openAttachment(o.attachment_path!)}>Supplier quote / invoice</DropdownMenuItem>}
                  {paid && !o.expense_id && <DropdownMenuItem onSelect={() => setLinking(o)}>Add to Expenses…</DropdownMenuItem>}
                  {canReturn && <DropdownMenuItem onSelect={() => setReturning(o)}>Return to supplier (credit)</DropdownMenuItem>}
                  <DropdownMenuItem className="text-destructive" onSelect={() => delMut.mutate(o)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
            return (
              <li key={o.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">{purchaseTitle(o)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", paid ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                        {paid ? "Paid" : "Quote requested"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {method === "pickup" ? <ShoppingBag className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                        {method === "pickup" ? "Pickup" : "Delivery"}
                      </span>
                      {onSite && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          On site{o.delivered_on ? ` ${shortDate(o.delivered_on)}` : ""}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {items.length === 0
                        ? "No lines"
                        : items
                            .slice(0, 3)
                            .map((i) => `${i.description} ${qty(Number(i.quantity))} ${unitWords(Number(i.quantity), i.unit)}`.trim())
                            .join(" · ") + (items.length > 3 ? ` · +${items.length - 3} more` : "")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {paid ? (o.paid_on ? `Paid ${shortDate(o.paid_on)}` : "Paid") : `Requested ${shortDate(o.created_at)}`}
                      {!onSite && method === "delivery" && o.expected_delivery_date ? ` · arriving ${shortDate(o.expected_delivery_date)}` : ""}
                      {o.picked_up_by ? ` · picked up by ${o.picked_up_by}` : ""}
                      {paid && !o.expense_id && total ? " · not in Expenses yet" : ""}
                    </p>
                    {o.notes && <p className="mt-1 whitespace-pre-line text-xs text-foreground/80">{o.notes}</p>}
                    {myReturns.map((r) => (
                      <p key={r.id} className="mt-1 text-xs text-muted-foreground">
                        Returned {qty(Number(r.quantity))} {unitWords(Number(r.quantity), r.unit)} {r.description} · {formatCurrency(Number(r.credit))} credit
                      </p>
                    ))}
                    {(o.pallets_delivered ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pallets: {o.pallets_delivered} delivered · {o.pallets_returned ?? 0} returned
                        {o.pallet_deposit_each ? ` · ${formatCurrency(Number(o.pallet_deposit_each))} deposit each` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-start gap-1">
                    <p className="pt-2.5 text-sm font-bold tabular-nums text-foreground">{total != null ? formatCurrency(total) : "—"}</p>
                    <PurchaseMenu />
                  </div>
                </div>
                {(!paid || !onSite || (paid && !o.expense_id && total)) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {!paid && (
                    <Button className={cn("flex-1 font-bold sm:flex-none", BIG)} onClick={() => setPaying(o)}>
                      Mark paid
                    </Button>
                  )}
                  {paid && !onSite && (
                    <Button className={cn("flex-1 font-bold sm:flex-none", BIG)} onClick={() => setReceiving(o)}>
                      <PackageCheck className="mr-1.5 h-4 w-4" /> {method === "pickup" ? "Mark picked up" : "Mark delivered"}
                    </Button>
                  )}
                  {paid && !o.expense_id && !!total && (
                    <Button variant="outline" className={cn("flex-1 sm:flex-none", BIG)} onClick={() => setLinking(o)}>
                      Add to Expenses
                    </Button>
                  )}
                </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <PurchaseSheet projectId={projectId} purchase={editing === "new" ? null : editing} sections={sections} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}
      {pickupOpen && <LogPickupSheet projectId={projectId} sections={sections} materialCategories={materialCategories} onClose={() => setPickupOpen(false)} onSaved={invalidate} />}
      {paying && <MarkPaidSheet purchase={paying} sections={sections} lineCost={lineCost} onClose={() => setPaying(null)} onSaved={invalidate} />}
      {receiving && <MarkReceivedSheet purchase={receiving} onClose={() => setReceiving(null)} onSaved={invalidate} />}
      {returning && (
        <ReturnSheet purchase={returning} lines={lines} returnable={returnable} returns={returns} onClose={() => setReturning(null)} onSaved={invalidate} />
      )}
      {linking && <LinkExpenseSheet projectId={projectId} purchase={linking} sections={sections} orders={orders} onClose={() => setLinking(null)} onSaved={invalidate} />}
    </div>
  );
}

// --- Mark paid ------------------------------------------------------------------

function MarkPaidSheet({
  purchase,
  sections,
  lineCost,
  onClose,
  onSaved,
}: {
  purchase: MaterialOrder;
  sections: MaterialsSection[];
  lineCost: Map<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(() => {
    const t = purchaseTotal(purchase, lineCost);
    return t != null ? String(t) : "";
  });
  const [date, setDate] = useState(today());
  const mut = useMutation({
    mutationFn: async () => {
      const patch = { payment_status: "paid" as const, amount_paid: num(amount), paid_on: date };
      await updateMaterialOrder(purchase.id, patch);
      await syncPurchaseExpense({ ...purchase, ...patch }, sections);
    },
    onSuccess: () => {
      onSaved();
      toast({ title: "Marked paid", description: num(amount) ? "Added to the job's expenses." : "Add the amount to put it in Expenses." });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title="Mark paid" description={`${purchaseTitle(purchase)} — paid online or by card over the phone.`}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Amount paid</Label>
          <Input id="pay-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={BIG} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-date">Paid on</Label>
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={BIG} />
        </div>
        <p className="text-xs text-muted-foreground">The amount goes into the job's Expenses as material cost — no need to enter it again.</p>
        <Button className={cn("w-full font-bold", BIG)} disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : "Mark paid"}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

// --- Mark delivered / picked up --------------------------------------------------------

function MarkReceivedSheet({ purchase, onClose, onSaved }: { purchase: MaterialOrder; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const pickup = fulfillmentOf(purchase) === "pickup";
  const [date, setDate] = useState(today());
  const [by, setBy] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const mut = useMutation({
    mutationFn: async () => {
      await updateMaterialOrder(purchase.id, { status: "delivered", delivered_on: date, ...(pickup && by.trim() ? { picked_up_by: by.trim() } : {}) });
      // Every line arrives with it (no per-line partial statuses any more).
      for (const i of purchase.material_order_items ?? []) if (i.status) await updateMaterialOrderItem(i.id, { status: null });
      if (photo) await addMaterialOrderImage(purchase.id, photo, { caption: pickup ? "Picked up" : "Where it was dropped" });
    },
    onSuccess: () => {
      onSaved();
      toast({ title: pickup ? "Marked picked up" : "Marked delivered" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={pickup ? "Mark picked up" : "Mark delivered"} description={purchaseTitle(purchase)}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rcv-date">{pickup ? "Picked up on" : "Delivered on"}</Label>
          <Input id="rcv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={BIG} />
        </div>
        {pickup ? (
          <div className="space-y-1.5">
            <Label htmlFor="rcv-by">Who picked it up (optional)</Label>
            <Input id="rcv-by" value={by} onChange={(e) => setBy(e.target.value)} className={BIG} />
          </div>
        ) : (
          <div>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" className={cn("w-full", BIG)} onClick={() => camera.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" /> {photo ? "Photo added — retake" : "Photo of where it was dropped (optional)"}
            </Button>
          </div>
        )}
        <Button className={cn("w-full font-bold", BIG)} disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : pickup ? "Picked up" : "Delivered"}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

// --- Log pickup -------------------------------------------------------------------

function LogPickupSheet({
  projectId,
  sections,
  materialCategories,
  onClose,
  onSaved,
}: {
  projectId: string;
  sections: MaterialsSection[];
  materialCategories: MaterialCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // Bulk material first (what's usually picked up during the job).
  const returnable = new Set(materialCategories.filter((c) => c.returnable).map((c) => c.id));
  const lineOptions = sections
    .flatMap((s) => (s.materials_items ?? []).filter((i) => (i.cost_type ?? "material") === "material").map((i) => ({ line: i, section: s.name })))
    .sort((a, b) => Number(returnable.has(a.line.material_category_id ?? "")) - Number(returnable.has(b.line.material_category_id ?? "")));
  const [supplier, setSupplier] = useState("");
  const [lineId, setLineId] = useState<string>(lineOptions[0]?.line.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [receipt, setReceipt] = useState<File | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const line = lineOptions.find((o) => o.line.id === lineId)?.line;
  const q = num(quantity);
  const mut = useMutation({
    mutationFn: async () => {
      const attachmentPath = receipt ? await uploadPurchaseAttachment(projectId, receipt) : null;
      await logPickup({ projectId, supplier: supplier.trim() || null, line: line!, quantity: q!, amount: num(amount), date, attachmentPath, sections });
      if (supplier.trim()) void touchSupplierUsage(supplier.trim());
    },
    onSuccess: () => {
      onSaved();
      toast({ title: "Pickup logged", description: num(amount) ? "Added to the job's expenses." : undefined });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't log the pickup", description: err.message, variant: "destructive" }),
  });
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title="Log pickup" description="Bought and loaded at the yard — counts as purchased and on site.">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Material</Label>
          <Select value={lineId} onValueChange={setLineId}>
            <SelectTrigger className={BIG}>
              <SelectValue placeholder="Pick a Cost plan line" />
            </SelectTrigger>
            <SelectContent>
              {lineOptions.map((o) => (
                <SelectItem key={o.line.id} value={o.line.id}>
                  {materialLineLabel(o.line)} <span className="text-muted-foreground">· {o.section}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pk-qty">Quantity{line?.unit ? ` (${line.unit})` : ""}</Label>
            <Input id="pk-qty" type="number" inputMode="decimal" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={BIG} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pk-amount">Amount paid</Label>
            <Input id="pk-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={BIG} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <SupplierCombobox value={supplier} onChange={setSupplier} placeholder="Choose supplier…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pk-date">Date</Label>
          <Input id="pk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={BIG} />
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
        <Button type="button" variant="outline" className={cn("w-full", BIG)} onClick={() => camera.current?.click()}>
          <Camera className="mr-1.5 h-4 w-4" /> {receipt ? "Receipt added — retake" : "Photo of the receipt (optional)"}
        </Button>
        <Button className={cn("w-full font-bold", BIG)} disabled={!line || !q || q <= 0 || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : "Log pickup"}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

// --- Return to supplier ----------------------------------------------------------

function ReturnSheet({
  purchase,
  lines,
  returnable,
  returns,
  onClose,
  onSaved,
}: {
  purchase: MaterialOrder;
  lines: ReturnType<typeof linesIndex>;
  returnable: Set<string>;
  returns: MaterialReturn[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const rows = (purchase.material_order_items ?? []).filter(
    (i) => i.materials_item_id && returnable.has(lines.get(i.materials_item_id)?.line.material_category_id ?? ""),
  );
  const [vals, setVals] = useState<Record<string, { qty: string; credit: string }>>({});
  const [date, setDate] = useState(today());
  const mut = useMutation({
    mutationFn: async () => {
      for (const i of rows) {
        const v = vals[i.id];
        const q = num(v?.qty ?? "");
        if (!q || q <= 0) continue;
        const l = lines.get(i.materials_item_id!);
        await recordReturn({
          order: purchase,
          line: { id: i.materials_item_id, name: i.description, unit: i.unit, feature_id: l?.feature_id ?? null },
          quantity: q,
          credit: num(v?.credit ?? "") ?? 0,
          date,
        });
      }
    },
    onSuccess: () => {
      onSaved();
      toast({ title: "Return recorded", description: "The credit is in the job's expenses." });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't record the return", description: err.message, variant: "destructive" }),
  });
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title="Return to supplier" description="Leftover pavers, wall block, caps… back for credit.">
      <div className="space-y-3">
        {rows.map((i) => {
          const already = returns.filter((r) => r.material_order_id === purchase.id && r.materials_item_id === i.materials_item_id).reduce((s, r) => s + Number(r.quantity), 0);
          return (
            <div key={i.id} className="rounded-lg border border-hairline p-2.5">
              <p className="text-sm font-semibold text-foreground">{i.description}</p>
              <p className="text-xs text-muted-foreground">
                Bought {qty(Number(i.quantity))} {unitWords(Number(i.quantity), i.unit)}
                {already > 0 ? ` · ${qty(already)} returned already` : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={`Qty (${i.unit})`}
                  aria-label={`Quantity of ${i.description} returned`}
                  value={vals[i.id]?.qty ?? ""}
                  onChange={(e) => setVals((m) => ({ ...m, [i.id]: { qty: e.target.value, credit: m[i.id]?.credit ?? "" } }))}
                  className={BIG}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="Credit $"
                  aria-label={`Credit for ${i.description}`}
                  value={vals[i.id]?.credit ?? ""}
                  onChange={(e) => setVals((m) => ({ ...m, [i.id]: { qty: m[i.id]?.qty ?? "", credit: e.target.value } }))}
                  className={BIG}
                />
              </div>
            </div>
          );
        })}
        <div className="space-y-1.5">
          <Label htmlFor="ret-date">Returned on</Label>
          <Input id="ret-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={BIG} />
        </div>
        <Button className={cn("w-full font-bold", BIG)} disabled={mut.isPending || !rows.some((i) => (num(vals[i.id]?.qty ?? "") ?? 0) > 0)} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : "Record return"}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

// --- Add to Expenses (link or create) ----------------------------------------------

function LinkExpenseSheet({
  projectId,
  purchase,
  sections,
  orders,
  onClose,
  onSaved,
}: {
  projectId: string;
  purchase: MaterialOrder;
  sections: MaterialsSection[];
  orders: MaterialOrder[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", { project: projectId }], queryFn: () => listExpenses(projectId) });
  const taken = new Set(orders.map((o) => o.expense_id).filter(Boolean));
  const candidates = expenses.filter((e) => !taken.has(e.id) && Number(e.amount) > 0);
  const mut = useMutation({
    mutationFn: async (expenseId: string | null) => {
      if (expenseId) {
        const e = expenses.find((x) => x.id === expenseId)!;
        // The bill was already logged by hand: link it (the purchase's amount follows it if unset).
        const amount = purchase.amount_paid ?? Number(e.amount);
        await updateMaterialOrder(purchase.id, { expense_id: expenseId, amount_paid: amount });
        await syncPurchaseExpense({ ...purchase, expense_id: expenseId, amount_paid: amount }, sections);
      } else {
        await syncPurchaseExpense(purchase, sections);
      }
    },
    onSuccess: () => {
      onSaved();
      toast({ title: "In Expenses now" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title="Add to Expenses" description="Already logged this supplier bill as an expense? Link it so it isn't counted twice.">
      <div className="space-y-2">
        {candidates.length > 0 && <p className="text-xs font-semibold text-muted-foreground">Link an existing expense</p>}
        {candidates.slice(0, 12).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => mut.mutate(e.id)}
            disabled={mut.isPending}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-hairline px-3 text-left text-sm hover:bg-muted/40"
          >
            <span className="min-w-0 truncate">
              {e.name || "Expense"} <span className="text-muted-foreground">· {e.date ? shortDate(e.date) : ""}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(Number(e.amount))}</span>
          </button>
        ))}
        <Button className={cn("mt-2 w-full", BIG)} variant="outline" disabled={mut.isPending || purchase.amount_paid == null} onClick={() => mut.mutate(null)}>
          {purchase.amount_paid == null ? "Add the amount paid first (Edit)" : `Create an expense for ${formatCurrency(Number(purchase.amount_paid))}`}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

// --- Add / edit purchase ------------------------------------------------------------

interface DraftLine {
  key: string;
  materialsItemId: string | null;
  description: string;
  quantity: string;
  unit: MaterialOrderUnit;
  unitPrice: string;
}

/**
 * One supplier purchase: supplier, quote / invoice #, Quote requested or
 * Paid (amount, date), Delivery (expected date) or Pickup, the lines it
 * covers (Cost plan lines, partial quantities, or something not on the
 * plan), a note, the supplier quote / invoice (scan it to fill the lines and
 * amount — reviewed here before saving), and an optional pallet deposit.
 */
function PurchaseSheet({
  projectId,
  purchase,
  sections,
  onClose,
  onSaved,
}: {
  projectId: string;
  purchase: MaterialOrder | null;
  sections: MaterialsSection[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const planLines: (MaterialsItem & { section: string })[] = sections.flatMap((s) =>
    (s.materials_items ?? []).filter((i) => (i.cost_type ?? "material") === "material").map((i) => ({ ...i, section: s.name })),
  );
  const [supplier, setSupplier] = useState(purchase?.supplier ?? "");
  const [quoteNo, setQuoteNo] = useState(purchase?.po_number ?? "");
  const [status, setStatus] = useState<PurchasePaymentStatus>(purchase?.payment_status ?? "paid");
  const [amount, setAmount] = useState(purchase?.amount_paid != null ? String(purchase.amount_paid) : "");
  const [paidOn, setPaidOn] = useState(purchase?.paid_on ?? today());
  const [method, setMethod] = useState<PurchaseFulfillment>(purchase?.fulfillment ?? "delivery");
  const [expected, setExpected] = useState(purchase?.expected_delivery_date ?? "");
  const [note, setNote] = useState(purchase?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    (purchase?.material_order_items ?? []).map((i) => ({
      key: i.id,
      materialsItemId: i.materials_item_id,
      description: i.description,
      quantity: String(i.quantity),
      unit: i.unit,
      unitPrice: i.unit_price != null ? String(i.unit_price) : "",
    })),
  );
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [pallets, setPallets] = useState({
    open: (purchase?.pallets_delivered ?? 0) > 0,
    delivered: purchase?.pallets_delivered != null ? String(purchase.pallets_delivered) : "",
    returned: purchase?.pallets_returned != null ? String(purchase.pallets_returned) : "",
    each: purchase?.pallet_deposit_each != null ? String(purchase.pallet_deposit_each) : "",
  });
  const fileInput = useRef<HTMLInputElement>(null);

  const addPlanLine = (id: string) => {
    const l = planLines.find((x) => x.id === id);
    if (!l) return;
    setLines((ls) => [
      ...ls,
      { key: crypto.randomUUID(), materialsItemId: l.id, description: materialLineLabel(l), quantity: "", unit: guessMaterialOrderUnit(l.unit), unitPrice: "" },
    ]);
  };

  const scan = async (f: File) => {
    setFile(f);
    setScanning(true);
    setScanNote(null);
    try {
      const r = await extractReceipt(f);
      if (r.supplier && !supplier.trim()) setSupplier(r.supplier);
      if (r.date) setPaidOn(r.date);
      if (r.total != null) setAmount(String(r.total));
      if (r.lines.length) {
        // Match each line to a Cost plan line by its words; the rest stay "not on the plan".
        const matches = matchReceiptToOrderLines(r.lines, planLines.map((l) => ({ id: l.id, description: materialLineLabel(l) })));
        const byIdx = new Map<number, string>();
        for (const [id, rl] of matches) byIdx.set(r.lines.indexOf(rl), id);
        setLines(
          r.lines.map((rl, idx) => {
            const id = byIdx.get(idx) ?? null;
            const pl = id ? planLines.find((x) => x.id === id) : undefined;
            return {
              key: crypto.randomUUID(),
              materialsItemId: id,
              description: pl ? materialLineLabel(pl) : rl.description,
              quantity: rl.quantity != null ? String(rl.quantity) : "",
              unit: guessMaterialOrderUnit(rl.unit ?? pl?.unit),
              unitPrice: rl.unit_price != null ? String(rl.unit_price) : "",
            };
          }),
        );
        setScanNote(`Read ${pluralize(r.lines.length, "line")} — check them below before saving.`);
      } else setScanNote("Couldn't find line items — the amount and date are filled in.");
    } catch (err) {
      toast({ title: "Couldn't read it", description: (err as Error).message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const mut = useMutation({
    mutationFn: async () => {
      const attachmentPath = file ? await uploadPurchaseAttachment(projectId, file) : (purchase?.attachment_path ?? null);
      const fields = {
        supplier: supplier.trim() || null,
        po_number: quoteNo.trim() || null,
        payment_status: status,
        amount_paid: num(amount),
        paid_on: status === "paid" ? paidOn : null,
        fulfillment: method,
        expected_delivery_date: method === "delivery" ? expected || null : null,
        notes: note.trim() || null,
        attachment_path: attachmentPath,
        pallets_delivered: pallets.open ? num(pallets.delivered) : null,
        pallets_returned: pallets.open ? num(pallets.returned) : null,
        pallet_deposit_each: pallets.open ? num(pallets.each) : null,
      };
      const items = lines
        .filter((l) => l.description.trim() && (num(l.quantity) ?? 0) > 0)
        .map((l) => ({ description: l.description.trim(), quantity: num(l.quantity)!, unit: l.unit, materials_item_id: l.materialsItemId, unit_price: num(l.unitPrice) }));
      let order: MaterialOrder;
      if (purchase) {
        await updateMaterialOrder(purchase.id, fields);
        for (const i of purchase.material_order_items ?? []) await deleteMaterialOrderItem(i.id);
        for (let n = 0; n < items.length; n++) await addMaterialOrderItem(purchase.id, { ...items[n], sort_order: n });
        order = { ...purchase, ...fields, material_order_items: items.map((it, n) => ({ ...it, id: `tmp-${n}`, material_order_id: purchase.id, sort_order: n, status: null, source: "manual", ticket_photo_path: null, materials_item_id: it.materials_item_id ?? null, unit_price: it.unit_price ?? null })) } as MaterialOrder;
      } else {
        order = await createMaterialOrder({
          project_id: projectId,
          ...fields,
          paid_on: fields.paid_on,
          supplier: fields.supplier,
          status: "ordered",
          items,
        });
        await updateMaterialOrder(order.id, { pallets_delivered: fields.pallets_delivered, pallets_returned: fields.pallets_returned, pallet_deposit_each: fields.pallet_deposit_each });
      }
      await syncPurchaseExpense(order, sections);
      if (fields.supplier) void touchSupplierUsage(fields.supplier);
    },
    onSuccess: () => {
      onSaved();
      toast({ title: purchase ? "Purchase saved" : "Purchase added" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={purchase ? "Edit purchase" : "Add purchase"} description="One supplier quote / order for this job.">
      <div className="space-y-3.5">
        {/* Supplier quote / invoice: attach, and scan to fill. */}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void scan(f);
            }}
          />
          <Button type="button" variant="outline" className={cn("flex-1", BIG)} disabled={scanning} onClick={() => fileInput.current?.click()}>
            {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1.5 h-4 w-4" />}
            {file || purchase?.attachment_path ? "Replace quote / invoice" : "Scan supplier quote / invoice"}
          </Button>
        </div>
        {scanNote && <p className="text-xs text-muted-foreground">{scanNote}</p>}

        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <SupplierCombobox value={supplier} onChange={setSupplier} placeholder="Choose supplier…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu-no">Quote / invoice # (optional)</Label>
          <Input id="pu-no" value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} className={BIG} />
        </div>

        <Segmented<PurchasePaymentStatus> value={status} onChange={setStatus} options={[{ value: "quote_requested", label: "Quote requested" }, { value: "paid", label: "Paid" }]} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pu-amount">{status === "paid" ? "Amount paid" : "Quoted amount"}</Label>
            <Input id="pu-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={BIG} />
          </div>
          {status === "paid" && (
            <div className="space-y-1.5">
              <Label htmlFor="pu-paid">Paid on</Label>
              <Input id="pu-paid" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={BIG} />
            </div>
          )}
        </div>

        <Segmented<PurchaseFulfillment> value={method} onChange={setMethod} options={[{ value: "delivery", label: "Delivery" }, { value: "pickup", label: "Pickup" }]} />
        {method === "delivery" && (
          <div className="space-y-1.5">
            <Label htmlFor="pu-exp">Expected delivery (optional)</Label>
            <Input id="pu-exp" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className={BIG} />
          </div>
        )}

        {/* Lines */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">What it covers</p>
          {lines.map((l, idx) => (
            <div key={l.key} className="rounded-lg border border-hairline p-2.5">
              <div className="flex items-start justify-between gap-2">
                {l.materialsItemId ? (
                  <p className="min-w-0 text-sm font-semibold text-foreground">{l.description}</p>
                ) : (
                  <Input
                    value={l.description}
                    onChange={(e) => setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
                    placeholder="Not on the plan — describe it"
                    aria-label="Line description"
                    className="h-10"
                  />
                )}
                <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} className="shrink-0 rounded-md p-2 text-muted-subtle hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={`Qty (${l.unit.replace(/_/g, " ")})`}
                  aria-label={`Quantity of ${l.description}`}
                  value={l.quantity}
                  onChange={(e) => setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                  className={BIG}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="Unit price (optional)"
                  aria-label={`Unit price of ${l.description}`}
                  value={l.unitPrice}
                  onChange={(e) => setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, unitPrice: e.target.value } : x)))}
                  className={BIG}
                />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Select value="" onValueChange={addPlanLine}>
              <SelectTrigger className={cn("flex-1", BIG)} aria-label="Add a Cost plan line">
                <SelectValue placeholder="+ Add a Cost plan line" />
              </SelectTrigger>
              <SelectContent>
                {planLines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {materialLineLabel(l)} <span className="text-muted-foreground">· {l.section}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              className={BIG}
              onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), materialsItemId: null, description: "", quantity: "", unit: "each", unitPrice: "" }])}
            >
              <FileUp className="mr-1.5 h-4 w-4" /> Not on the plan
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pu-note">Note (optional)</Label>
          <Textarea id="pu-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 pallets backordered, coming Friday" />
        </div>

        {pallets.open ? (
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" inputMode="numeric" min="0" placeholder="Pallets" aria-label="Pallets delivered" value={pallets.delivered} onChange={(e) => setPallets((p) => ({ ...p, delivered: e.target.value }))} className={BIG} />
            <Input type="number" inputMode="decimal" min="0" step="any" placeholder="Deposit $ each" aria-label="Pallet deposit each" value={pallets.each} onChange={(e) => setPallets((p) => ({ ...p, each: e.target.value }))} className={BIG} />
            <Input type="number" inputMode="numeric" min="0" placeholder="Returned" aria-label="Pallets returned" value={pallets.returned} onChange={(e) => setPallets((p) => ({ ...p, returned: e.target.value }))} className={BIG} />
          </div>
        ) : (
          <button type="button" onClick={() => setPallets((p) => ({ ...p, open: true }))} className="min-h-9 text-sm font-semibold text-primary hover:underline">
            + Pallet deposit
          </button>
        )}

        <Button className={cn("w-full font-bold", BIG)} disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Saving…" : purchase ? "Save purchase" : "Add purchase"}
        </Button>
      </div>
    </ResponsiveModal>
  );
}
