import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ImagePlus, Plus, Trash2, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { StatusPill } from "@/components/common/StatusPill";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { PhotoGallery } from "@/components/common/PhotoGallery";
import { SupplierCombobox } from "@/components/common/SupplierCombobox";
import { MaterialsLinePicker } from "@/components/common/MaterialsLinePicker";
import { useToast } from "@/hooks/use-toast";
import { cn, pluralize, formatCurrency } from "@/lib/utils";
import {
  getProject,
  listMaterialOrders,
  createMaterialOrder,
  updateMaterialOrder,
  updateMaterialOrderItem,
  deleteMaterialOrder,
  addMaterialOrderImage,
  touchSupplierUsage,
  listMaterials,
  MATERIAL_ORDER_UNITS,
  materialOrderUnitLabel,
  type MaterialOrder,
  type MaterialOrderItem,
  type MaterialOrderStatus,
  type MaterialOrderUnit,
  type MaterialsSection,
} from "@/lib/api";
import { materialOrderStatusMeta } from "@/lib/statusMeta";
import { suggestMaterialsItemMatches, effectiveDeliveryStatus } from "@/lib/materialTracking";

interface DraftItem {
  description: string;
  quantity: string;
  unit: MaterialOrderUnit;
  materialsItemId: string | null;
  unitPrice: string;
}

const emptyItem = (): DraftItem => ({ description: "", quantity: "", unit: "each", materialsItemId: null, unitPrice: "" });

export function ProjectMaterialOrdersView() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: () => getProject(id) });
  const {
    data: orders = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["material-orders", { project: id }],
    queryFn: () => listMaterialOrders(id),
  });
  // Every sheet line on the project (not just tracked ones) — a delivery
  // can be logged before a project is even Won, so the match picker isn't
  // gated on tracking the way the sheet's own live rollups are.
  const { data: sections = [] } = useQuery({
    queryKey: ["materials", { project: id }],
    queryFn: () => listMaterials(id),
  });
  const allSheetLines = sections.flatMap((s) => s.materials_items);

  const [supplier, setSupplier] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  // Photos picked before the order exists yet — just local previews (same
  // File objects PhotoGallery's own uploader would compress/upload) until
  // the order is actually created, at which point they upload through the
  // exact same addMaterialOrderImage() the delivery card's gallery uses.
  const [stagedPhotos, setStagedPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const stagedPhotoInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["material-orders", { project: id }] });
    qc.invalidateQueries({ queryKey: ["material-orders"] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const addMut = useMutation({
    mutationFn: async () => {
      const order = await createMaterialOrder({
        project_id: id,
        supplier: supplier.trim() || null,
        expected_delivery_date: expectedDate || null,
        notes: notes.trim() || null,
        items: items
          .filter((it) => it.description.trim())
          .map((it) => ({
            description: it.description.trim(),
            quantity: parseFloat(it.quantity) || 0,
            unit: it.unit,
            materials_item_id: it.materialsItemId,
            unit_price: it.unitPrice.trim() ? parseFloat(it.unitPrice) : null,
          })),
      });
      for (let i = 0; i < stagedPhotos.length; i++) {
        await addMaterialOrderImage(order.id, stagedPhotos[i].file, { sort_order: i });
      }
      return order;
    },
    onSuccess: (order) => {
      invalidate();
      if (order.supplier) void touchSupplierUsage(order.supplier);
      setSupplier("");
      setExpectedDate("");
      setNotes("");
      setItems([emptyItem()]);
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setStagedPhotos([]);
    },
    onError,
  });

  const statusMut = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: MaterialOrderStatus }) =>
      updateMaterialOrder(orderId, { status }),
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (orderId: string) => deleteMaterialOrder(orderId),
    onSuccess: invalidate,
    onError,
  });

  const matchMut = useMutation({
    mutationFn: ({
      itemId,
      patch,
    }: {
      itemId: string;
      patch: { materials_item_id?: string | null; unit_price?: number | null; status?: MaterialOrderStatus | null };
    }) => updateMaterialOrderItem(itemId, patch),
    onSuccess: invalidate,
    onError,
  });

  const canSave = items.some((it) => it.description.trim().length > 0);

  const setItem = (i: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <div className="animate-fade-in max-w-4xl space-y-5">
      <MobilePageHeader title="Material orders" back={{ to: `/projects/${id}`, label: "Project" }} />

      <div className="hidden md:block">
        <Link
          to={`/projects/${id}`}
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to project
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Material orders</h1>
        <p className="mt-1 text-muted-foreground">{project?.name ?? " "}</p>
      </div>

      <section className="card-surface space-y-4 p-5">
        <h3 className="text-base font-bold text-foreground">Add order</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <SupplierCombobox value={supplier} onChange={setSupplier} placeholder="e.g. Techo-Bloc" />
          </div>
          <div className="space-y-1.5">
            <Label>Expected delivery date</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Line items</Label>
          {items.map((item, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-hairline p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                  onBlur={() => {
                    if (item.materialsItemId || !item.description.trim()) return;
                    const [top] = suggestMaterialsItemMatches(item.description, allSheetLines);
                    if (top) setItem(i, { materialsItemId: top.id });
                  }}
                  placeholder="e.g. Techo-Bloc Blu 60mm"
                  className="min-w-[180px] flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="w-24"
                />
                <Select value={item.unit} onValueChange={(v) => setItem(i, { unit: v as MaterialOrderUnit })}>
                  <SelectTrigger className="w-40" aria-label="Unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_ORDER_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.plural}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: e.target.value })}
                  placeholder="$/unit (optional)"
                  className="w-36"
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={items.length === 1}
                  className="text-muted-subtle transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {allSheetLines.length > 0 && (
                <MaterialsLinePicker
                  sections={sections}
                  value={item.materialsItemId}
                  onChange={(v) => setItem(i, { materialsItemId: v })}
                  suggested={item.description.trim() ? suggestMaterialsItemMatches(item.description, allSheetLines) : []}
                  className="h-8 text-xs"
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary/80"
          >
            <Plus className="h-3.5 w-3.5" />
            Add line item
          </button>
        </div>

        <div className="space-y-2">
          <Label>Photos (optional)</Label>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
            {stagedPhotos.map((p, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(p.previewUrl);
                    setStagedPhotos((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => stagedPhotoInputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-xl border-[1.5px] border-dashed border-border text-muted-subtle transition-colors hover:border-primary hover:text-primary"
              aria-label="Add photos"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <input
              ref={stagedPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                setStagedPhotos((prev) => [
                  ...prev,
                  ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
                ]);
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="PO #, contact, delivery instructions…" />
        </div>

        <Button onClick={() => addMut.mutate()} disabled={!canSave || addMut.isPending} className="font-bold">
          {addMut.isPending ? "Saving…" : "Add order"}
        </Button>
      </section>

      {isLoading && <p className="text-muted-foreground">Loading material orders…</p>}
      {isError && <p className="text-destructive">Failed to load material orders: {(error as Error).message}</p>}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="card-surface p-10 text-center text-muted-foreground">
          No material orders yet. Add the first one above.
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <MaterialOrderCard
              key={order.id}
              order={order}
              sections={sections}
              onStatusChange={(status) => statusMut.mutate({ orderId: order.id, status })}
              onDelete={() => deleteMut.mutate(order.id)}
              onLineChange={(itemId, patch) => matchMut.mutate({ itemId, patch })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialOrderCard({
  order,
  sections,
  onStatusChange,
  onDelete,
  onLineChange,
}: {
  order: MaterialOrder;
  sections: MaterialsSection[];
  onStatusChange: (status: MaterialOrderStatus) => void;
  onDelete: () => void;
  onLineChange: (itemId: string, patch: { materials_item_id?: string | null; unit_price?: number | null; status?: MaterialOrderStatus | null }) => void;
}) {
  const meta = materialOrderStatusMeta(order.status);
  const dateLabel = order.expected_delivery_date
    ? new Date(`${order.expected_delivery_date}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No date set";

  return (
    <section className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Truck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">{order.supplier || "Unnamed supplier"}</p>
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={order.status} onValueChange={(v) => onStatusChange(v as MaterialOrderStatus)}>
            <SelectTrigger className="h-8 w-32 rounded-full border-border bg-card text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
            </SelectContent>
          </Select>
          <StatusPill meta={meta} className="hidden sm:inline-flex" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-muted-subtle hover:text-destructive" aria-label="Delete order">
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this material order?</AlertDialogTitle>
                <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
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
        </div>
      </div>

      {order.material_order_items.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-hairline pt-3">
          {order.material_order_items.map((item) => (
            <DeliveryLineRow
              key={item.id}
              item={item}
              sections={sections}
              orderStatus={order.status}
              onChange={(patch) => onLineChange(item.id, patch)}
            />
          ))}
        </div>
      )}
      {order.notes && <p className="mt-2 text-xs text-muted-foreground">{order.notes}</p>}
      <p className="mt-2 text-[11px] text-muted-subtle">
        {pluralize(order.material_order_items.length, "line item")}
      </p>

      <div className="mt-3 border-t border-hairline pt-3">
        <PhotoGallery
          owner={{ type: "material_order", id: order.id }}
          title="Photos"
          emptyText="No photos yet — add proof of delivery, damaged items, or a packing slip."
          bare
        />
      </div>
    </section>
  );
}

/** One delivery line — read-only by default, click "Match" / the matched
 * line's name to open the picker + an actual-price field. Unmatched lines
 * read "Unplanned" (never hidden — Phase 2's "never drop them" rule; they
 * still count in actual cost via unplannedActualCost). */
function DeliveryLineRow({
  item,
  sections,
  orderStatus,
  onChange,
}: {
  item: MaterialOrderItem;
  sections: MaterialsSection[];
  orderStatus: MaterialOrderStatus;
  onChange: (patch: { materials_item_id?: string | null; unit_price?: number | null; status?: MaterialOrderStatus | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [priceStr, setPriceStr] = useState(item.unit_price != null ? String(item.unit_price) : "");
  const matched = sections.flatMap((s) => s.materials_items).find((mi) => mi.id === item.materials_item_id);
  const effectiveStatus = effectiveDeliveryStatus(item, orderStatus);

  return (
    <div className="rounded-lg bg-muted/40 p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground/80">
          {item.quantity} {materialOrderUnitLabel(item.unit, item.quantity)} — {item.description}
        </span>
        <div className="flex items-center gap-2">
          {item.unit_price != null && <span className="text-xs font-semibold text-muted-foreground">{formatCurrency(item.unit_price)}/unit</span>}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              matched ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {matched ? matched.name : "Unplanned"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MaterialsLinePicker
            sections={sections}
            value={item.materials_item_id}
            onChange={(v) => onChange({ materials_item_id: v })}
            className="h-8 min-w-[200px] flex-1 text-xs"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            onBlur={() => onChange({ unit_price: priceStr.trim() ? parseFloat(priceStr) : null })}
            placeholder="Actual $/unit"
            className="h-8 w-36 text-xs"
          />
          <Select
            value={item.status ?? "__inherit__"}
            onValueChange={(v) => onChange({ status: v === "__inherit__" ? null : (v as MaterialOrderStatus) })}
          >
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="This line's status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">Same as order ({materialOrderStatusMeta(orderStatus).label})</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {item.status != null && item.status !== orderStatus && (
        <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
          This line: {materialOrderStatusMeta(effectiveStatus).label} (partial delivery)
        </p>
      )}
    </div>
  );
}
