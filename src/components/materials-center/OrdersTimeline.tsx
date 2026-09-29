import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CloudRain, Mail, MoveRight, Pencil, Phone, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MaterialsLinePicker } from "@/components/common/MaterialsLinePicker";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { PhotoGallery } from "@/components/common/PhotoGallery";
import { useToast } from "@/hooks/use-toast";
import {
  DELIVERY_ISSUE_LABEL,
  deleteMaterialOrder,
  deleteMaterialOrderItem,
  materialOrderUnitLabel,
  touchSupplierUsage,
  updateMaterialOrder,
  updateMaterialOrderItem,
  type MaterialOrder,
  type MaterialOrderItem,
  type MaterialOrderStatus,
  type MaterialsSection,
  type Supplier,
} from "@/lib/api";
import { effectiveDeliveryStatus } from "@/lib/materialTracking";
import { ORDER_STATE_META, type OrderView } from "@/lib/materialsCenter";
import { cn, formatCurrency, formatDate, pluralize } from "@/lib/utils";

const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Orders and deliveries, in date order: status, dates, PO #, lines with
 * their delivery status and issues, amount, pallets, photos. Log delivery /
 * edit / resolve issues from here. */
export function OrdersTimeline({
  orders,
  suppliers,
  sections,
  rainDates,
  onLogDelivery,
}: {
  orders: OrderView[];
  suppliers: Supplier[];
  /** Cost plan sections — to match a line to a Cost plan line. */
  sections: MaterialsSection[];
  rainDates: Set<string>;
  onLogDelivery: (order: MaterialOrder) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MaterialOrder | null>(null);
  const [openPhotos, setOpenPhotos] = useState<Set<string>>(new Set());
  const supplierOf = (name: string | null) => (name ? suppliers.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined);

  const resolve = useMutation({
    mutationFn: (itemId: string) => updateMaterialOrderItem(itemId, { issue_resolved_at: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-orders"] });
      toast({ title: "Issue resolved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  if (orders.length === 0) return <p className="py-4 text-sm text-muted-foreground">No orders yet — pick lines under Still to order and create one.</p>;

  return (
    <>
      <ol className="space-y-3">
        {orders.map((ov) => {
          const o = ov.order;
          const meta = ORDER_STATE_META[ov.state];
          const sup = supplierOf(o.supplier);
          const pending = o.expected_delivery_date && ov.state !== "delivered";
          const rain = pending && rainDates.has(o.expected_delivery_date!);
          return (
            <li key={o.id} className="rounded-xl border border-border bg-card p-3 md:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0 text-muted-subtle" />
                    <span className="font-semibold text-foreground">{o.supplier ?? "No supplier"}</span>
                    <span className={meta.className}>{meta.label}</span>
                    {ov.openIssues.length > 0 && (
                      <span className="badge-status badge-overdue">
                        <AlertTriangle className="h-3 w-3" /> {pluralize(ov.openIssues.length, "issue")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.ordered_on ? `Ordered ${formatDate(o.ordered_on)}` : `Added ${formatDate(o.created_at)}`}
                    {ov.state === "delivered"
                      ? ` · delivered ${formatDate(o.delivered_on ?? o.expected_delivery_date)}`
                      : o.expected_delivery_date
                        ? ` · expected ${formatDate(o.expected_delivery_date)}`
                        : " · no delivery date yet"}
                    {o.delivered_on && ov.state === "partial" ? ` · part arrived ${formatDate(o.delivered_on)}` : ""}
                    {o.po_number ? ` · PO ${o.po_number}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {ov.afterStart && <span className="font-semibold text-warning-strong">Arrives after the start date</span>}
                    {rain && (
                      <span className="inline-flex items-center gap-1 font-semibold text-info">
                        <CloudRain className="h-3 w-3" /> Rain in the forecast that day
                      </span>
                    )}
                    {ov.movedByDelay && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        Moved by a rain delay: {formatDate(ov.movedByDelay.from)} <MoveRight className="h-3 w-3" /> {formatDate(ov.movedByDelay.to)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(ov.state === "delivered" ? ov.deliveredAmount : ov.orderAmount)}</div>
                  {ov.state === "partial" && <div className="text-[11px] text-muted-subtle">{formatCurrency(ov.deliveredAmount)} delivered</div>}
                </div>
              </div>

              <ul className="mt-2 divide-y divide-hairline rounded-lg border border-hairline text-sm">
                {o.material_order_items.map((i) => {
                  const st = effectiveDeliveryStatus(i, o.status);
                  const issueOpen = i.issue && !i.issue_resolved_at;
                  return (
                    <li key={i.id} className="px-3 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-foreground [overflow-wrap:anywhere]">
                          {i.description}
                          {!i.materials_item_id && <span className="ml-1.5 text-[11px] text-muted-subtle">(unplanned)</span>}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {Number(i.quantity)} {materialOrderUnitLabel(i.unit, Number(i.quantity))}
                          <span className={cn("ml-1.5 font-semibold", st === "delivered" ? "text-success" : st === "delayed" ? "text-destructive" : "text-muted-subtle")}>
                            {st === "delivered" ? "✓ delivered" : st === "delayed" ? "delayed" : "on order"}
                          </span>
                        </span>
                      </div>
                      {issueOpen && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="badge-status badge-overdue">{DELIVERY_ISSUE_LABEL[i.issue!]}</span>
                          {i.issue_note && <span className="text-muted-foreground">{i.issue_note}</span>}
                          {i.issue === "backordered" && i.issue_expected_on && <span className="text-muted-foreground">expected {formatDate(i.issue_expected_on)}</span>}
                          <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => resolve.mutate(i.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {(o.pallets_delivered || o.pallets_returned) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Pallets: {o.pallets_delivered ?? 0} dropped · {o.pallets_returned ?? 0} returned
                  {o.pallet_deposit_each ? ` · deposit ${formatCurrency(Number(o.pallet_deposit_each))} each (${formatCurrency(ov.palletCharge)} charged, ${formatCurrency(ov.palletCredit)} back)` : ""}
                </p>
              )}
              {o.notes && <p className="mt-1 text-xs text-muted-subtle [overflow-wrap:anywhere]">{o.notes}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {ov.openLines > 0 && (
                  <Button size="sm" className="font-semibold" onClick={() => onLogDelivery(o)}>
                    Log delivery
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenPhotos((s) => { const n = new Set(s); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })}
                >
                  Photos
                </Button>
                {sup?.phone && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={telOf(sup.phone)}><Phone className="mr-1 h-3.5 w-3.5" />Call</a>
                  </Button>
                )}
                {sup?.email && (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`mailto:${sup.email}?subject=${encodeURIComponent(`Order${o.po_number ? ` ${o.po_number}` : ""}`)}`}><Mail className="mr-1 h-3.5 w-3.5" />Email</a>
                  </Button>
                )}
              </div>
              {openPhotos.has(o.id) && (
                <div className="mt-2">
                  <PhotoGallery owner={{ type: "material_order", id: o.id }} title="Delivery photos" emptyText="Add a photo of where it was dropped — the crew sees it in the work order." bare />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <OrderEditDialog
        order={editing ? (orders.find((o) => o.order.id === editing.id)?.order ?? editing) : null}
        sections={sections}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </>
  );
}

function OrderEditDialog({
  order,
  sections,
  onOpenChange,
}: {
  order: MaterialOrder | null;
  sections: MaterialsSection[];
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["material-orders"] });
    qc.invalidateQueries({ queryKey: ["precon"] });
  };
  const onError = (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
  // Line changes (match / price / status / remove) save as you make them.
  const lineMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<MaterialOrderItem, "materials_item_id" | "unit_price" | "status">> }) =>
      updateMaterialOrderItem(id, patch),
    onSuccess: invalidate,
    onError,
  });
  const removeLine = useMutation({ mutationFn: (id: string) => deleteMaterialOrderItem(id), onSuccess: invalidate, onError });
  const statusMut = useMutation({
    mutationFn: (status: MaterialOrderStatus) => updateMaterialOrder(order!.id, { status }),
    onSuccess: invalidate,
    onError,
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteMaterialOrder(order!.id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(false);
      toast({ title: "Order deleted" });
      onOpenChange(false);
    },
    onError,
  });
  const open = !!order;
  const v = (k: string, fallback: string | number | null | undefined) => f[k] ?? (fallback == null ? "" : String(fallback));
  const save = useMutation({
    mutationFn: async () => {
      if (!order) return;
      const num = (k: string, fb: number | null | undefined) => {
        const s = v(k, fb).trim();
        return s === "" ? null : Math.max(0, Number(s) || 0);
      };
      const supplier = v("supplier", order.supplier).trim() || null;
      await updateMaterialOrder(order.id, {
        supplier,
        expected_delivery_date: v("expected", order.expected_delivery_date) || null,
        ordered_on: v("ordered", order.ordered_on) || null,
        po_number: v("po", order.po_number).trim() || null,
        notes: v("notes", order.notes).trim() || null,
        pallets_delivered: num("pd", order.pallets_delivered),
        pallets_returned: num("pr", order.pallets_returned),
        pallet_deposit_each: num("pe", order.pallet_deposit_each),
      });
      if (supplier) void touchSupplierUsage(supplier);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-orders"] });
      qc.invalidateQueries({ queryKey: ["precon"] });
      setF({});
      toast({ title: "Order updated" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setF({}); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <SupplierCombobox value={v("supplier", order.supplier)} onChange={(s) => setF((x) => ({ ...x, supplier: s }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="oe-ordered">Ordered on</Label>
                <Input id="oe-ordered" type="date" value={v("ordered", order.ordered_on)} onChange={(e) => setF((x) => ({ ...x, ordered: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oe-expected">Expected delivery</Label>
                <Input id="oe-expected" type="date" value={v("expected", order.expected_delivery_date)} onChange={(e) => setF((x) => ({ ...x, expected: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oe-po">Supplier PO / confirmation #</Label>
              <Input id="oe-po" value={v("po", order.po_number)} onChange={(e) => setF((x) => ({ ...x, po: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="oe-pd">Pallets dropped</Label>
                <Input id="oe-pd" inputMode="numeric" value={v("pd", order.pallets_delivered)} onChange={(e) => setF((x) => ({ ...x, pd: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oe-pr">Returned</Label>
                <Input id="oe-pr" inputMode="numeric" value={v("pr", order.pallets_returned)} onChange={(e) => setF((x) => ({ ...x, pr: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oe-pe">Deposit each</Label>
                <Input id="oe-pe" inputMode="decimal" value={v("pe", order.pallet_deposit_each)} onChange={(e) => setF((x) => ({ ...x, pe: e.target.value }))} placeholder="$" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oe-notes">Notes</Label>
              <Textarea id="oe-notes" rows={2} value={v("notes", order.notes)} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Order status</Label>
              <Select value={order.status} onValueChange={(s) => statusMut.mutate(s as MaterialOrderStatus)}>
                <SelectTrigger className="h-10" aria-label="Order status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                  <SelectItem value="delivered">Delivered (everything)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-subtle">To log what actually arrived (or part of it), use Log delivery.</p>
            </div>
            <div className="space-y-2">
              <Label>Lines</Label>
              <p className="text-[11px] text-muted-subtle">Match a line to its Cost plan line, fix the price paid, or set one line's status — each change saves right away.</p>
              {order.material_order_items.map((i) => (
                <LineEditor
                  key={i.id}
                  item={i}
                  sections={sections}
                  orderStatus={order.status}
                  onChange={(patch) => lineMut.mutate({ id: i.id, patch })}
                  onRemove={order.material_order_items.length > 1 ? () => removeLine.mutate(i.id) : undefined}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete order
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button className="font-bold" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
              </div>
            </div>
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {order.supplier ?? "This order"} and its {pluralize(order.material_order_items.length, "line")} and photos are deleted — what's ordered and delivered on the
                    Cost plan goes down with it. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteMut.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      deleteMut.mutate();
                    }}
                  >
                    {deleteMut.isPending ? "Deleting…" : "Delete order"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One order line: its Cost plan match, the price paid, its own status. */
function LineEditor({
  item,
  sections,
  orderStatus,
  onChange,
  onRemove,
}: {
  item: MaterialOrderItem;
  sections: MaterialsSection[];
  orderStatus: MaterialOrderStatus;
  onChange: (patch: Partial<Pick<MaterialOrderItem, "materials_item_id" | "unit_price" | "status">>) => void;
  onRemove?: () => void;
}) {
  const [price, setPrice] = useState(item.unit_price != null ? String(item.unit_price) : "");
  return (
    <div className="space-y-2 rounded-lg border border-hairline p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-foreground [overflow-wrap:anywhere]">
          {Number(item.quantity)} {materialOrderUnitLabel(item.unit, Number(item.quantity))} — {item.description}
        </span>
        {onRemove && (
          <button type="button" aria-label="Remove line" className="shrink-0 text-muted-subtle hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <MaterialsLinePicker sections={sections} value={item.materials_item_id} onChange={(v) => onChange({ materials_item_id: v })} className="h-8 w-full text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => onChange({ unit_price: price.trim() ? Number(price) : null })}
          placeholder="Actual $/unit"
          className="h-8 text-xs"
          aria-label="Actual price per unit"
        />
        <Select value={item.status ?? "__inherit__"} onValueChange={(v) => onChange({ status: v === "__inherit__" ? null : (v as MaterialOrderStatus) })}>
          <SelectTrigger className="h-8 text-xs" aria-label="This line's status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit__">Same as order ({orderStatus})</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="delayed">Delayed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
