import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Minus, Plus, ScanLine } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import {
  addMaterialOrderImage,
  DELIVERY_ISSUE_LABEL,
  logDelivery,
  materialOrderUnitLabel,
  updateMaterialOrder,
  type DeliveryIssueKind,
  type MaterialOrder,
} from "@/lib/api";
import { extractReceipt } from "@/lib/assistant";
import { effectiveDeliveryStatus } from "@/lib/materialTracking";
import { matchReceiptToOrderLines } from "@/lib/materialsCenter";
import { isoDate } from "@/lib/weatherRisk";
import { cn, formatCurrency, pluralize } from "@/lib/utils";

const NO_ISSUE = "__none";

interface Row {
  itemId: string;
  description: string;
  unit: string;
  ordered: number;
  received: string;
  unitPrice: string;
  issue: DeliveryIssueKind | null;
  issueNote: string;
  issueExpectedOn: string;
}

/**
 * Log a delivery against an order: confirm what arrived per line (defaults
 * to what was ordered; steppers on phones), or scan the receipt (same
 * extraction as before) to fill quantities / prices for review. Partial →
 * the rest stays on order. Issues per line; drop-off photos go on the
 * delivery (the crew sees them in the work order).
 */
export function LogDeliverySheet({
  order,
  open,
  onOpenChange,
  showPrices,
}: {
  order: MaterialOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showPrices: boolean;
}) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [deliveredOn, setDeliveredOn] = useState(() => isoDate(new Date()));
  const [pallets, setPallets] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !order) return;
    setRows(
      order.material_order_items
        .filter((i) => effectiveDeliveryStatus(i, order.status) !== "delivered")
        .map((i) => ({
          itemId: i.id,
          description: i.description,
          unit: materialOrderUnitLabel(i.unit, Number(i.quantity)),
          ordered: Number(i.quantity),
          received: String(Number(i.quantity)),
          unitPrice: i.unit_price != null ? String(i.unit_price) : "",
          issue: null,
          issueNote: "",
          issueExpectedOn: "",
        })),
    );
    setDeliveredOn(isoDate(new Date()));
    setPallets(order.pallets_delivered != null ? String(order.pallets_delivered) : "");
    setPhotos([]);
    setScanNote(null);
  }, [open, order]);

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.itemId === id ? { ...r, ...patch } : r)));
  const step = (r: Row, delta: number) => setRow(r.itemId, { received: String(Math.max(0, Math.min(r.ordered, (Number(r.received) || 0) + delta))) });

  const scan = async (file: File) => {
    if (!order) return;
    setScanning(true);
    setScanNote(null);
    if (file.type.startsWith("image/")) setPhotos((p) => [...p, file]);
    try {
      const receipt = await extractReceipt(file);
      if (receipt.date) setDeliveredOn(receipt.date);
      const matches = matchReceiptToOrderLines(receipt.lines, rows.map((r) => ({ id: r.itemId, description: r.description })));
      setRows((rs) =>
        rs.map((r) => {
          const m = matches.get(r.itemId);
          if (!m) return r;
          const qty = m.quantity != null ? Math.min(r.ordered, Number(m.quantity)) : r.ordered;
          return {
            ...r,
            received: String(qty),
            unitPrice: m.unit_price != null ? String(m.unit_price) : r.unitPrice,
            ...(m.quantity != null && Number(m.quantity) < r.ordered ? { issue: "short" as const } : {}),
          };
        }),
      );
      setScanNote(
        matches.size
          ? `Matched ${pluralize(matches.size, "line")} from the receipt — check the quantities before saving.`
          : "Couldn't match the receipt to these lines — enter what arrived by hand.",
      );
    } catch (e) {
      setScanNote(`Couldn't read that receipt (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setScanning(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!order) return;
      await logDelivery({
        order,
        deliveredOn,
        lines: rows.map((r) => ({
          itemId: r.itemId,
          received: Number(r.received) || 0,
          unitPrice: r.unitPrice.trim() ? Number(r.unitPrice) : null,
          issue: r.issue,
          issueNote: r.issueNote,
          issueExpectedOn: r.issue === "backordered" ? r.issueExpectedOn || null : null,
        })),
      });
      if (pallets.trim() !== "") await updateMaterialOrder(order.id, { pallets_delivered: Math.max(0, Math.round(Number(pallets) || 0)) });
      for (const [i, f] of photos.entries()) await addMaterialOrderImage(order.id, f, { sort_order: 100 + i });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-orders"] });
      qc.invalidateQueries({ queryKey: ["photo-gallery"] });
      qc.invalidateQueries({ queryKey: ["precon"] });
      const partial = rows.some((r) => (Number(r.received) || 0) < r.ordered);
      toast({ title: partial ? "Partial delivery logged" : "Delivery logged", description: partial ? "The rest stays on order." : undefined });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't log the delivery", description: e.message, variant: "destructive" }),
  });

  const total = rows.reduce((s, r) => s + (Number(r.received) || 0) * (Number(r.unitPrice) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[92dvh] rounded-t-2xl px-4 pb-6 pt-5" : "w-full sm:max-w-lg")}>
        <SheetHeader className="text-left">
          <SheetTitle>Log delivery{order?.supplier ? ` · ${order.supplier}` : ""}</SheetTitle>
          <SheetDescription>Confirm what arrived. Anything short stays on order.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => scanInput.current?.click()} disabled={scanning} className="font-semibold">
              {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1.5 h-4 w-4" />}
              {scanning ? "Reading…" : "Scan receipt"}
            </Button>
            <Button type="button" variant="outline" onClick={() => photoInput.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" /> Drop-off photo{photos.length ? ` (${photos.length})` : ""}
            </Button>
            <input ref={scanInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scan(f); }} />
            <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; setPhotos((p) => [...p, ...fs]); }} />
          </div>
          {scanNote && <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-foreground">{scanNote}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ld-date">Delivered on</Label>
              <Input id="ld-date" type="date" value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ld-pallets">Pallets dropped</Label>
              <Input id="ld-pallets" inputMode="numeric" value={pallets} onChange={(e) => setPallets(e.target.value)} placeholder="optional" />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything on this order is already delivered.</p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((r) => {
                const received = Number(r.received) || 0;
                return (
                  <li key={r.itemId} className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{r.description}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">ordered {r.ordered} {r.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Less" onClick={() => step(r, -1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        inputMode="decimal"
                        value={r.received}
                        onChange={(e) => setRow(r.itemId, { received: e.target.value })}
                        className="h-10 text-center font-semibold tabular-nums"
                        aria-label={`Received — ${r.description}`}
                      />
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="More" onClick={() => step(r, 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <span className="w-14 shrink-0 text-xs text-muted-foreground">{r.unit}</span>
                    </div>
                    {received < r.ordered && (
                      <p className="text-[11px] text-warning-strong">{Math.round((r.ordered - received) * 1000) / 1000} {r.unit} stays on order</p>
                    )}
                    <div className={cn("grid gap-2", showPrices ? "grid-cols-2" : "grid-cols-1")}>
                      <Select value={r.issue ?? NO_ISSUE} onValueChange={(v) => setRow(r.itemId, { issue: v === NO_ISSUE ? null : (v as DeliveryIssueKind) })}>
                        <SelectTrigger className="h-9" aria-label="Issue">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ISSUE}>No issue</SelectItem>
                          {(Object.keys(DELIVERY_ISSUE_LABEL) as DeliveryIssueKind[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {DELIVERY_ISSUE_LABEL[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showPrices && (
                        <Input inputMode="decimal" value={r.unitPrice} onChange={(e) => setRow(r.itemId, { unitPrice: e.target.value })} placeholder="$ / unit paid" className="h-9" aria-label="Unit price" />
                      )}
                    </div>
                    {r.issue && (
                      <div className={cn("grid gap-2", r.issue === "backordered" ? "grid-cols-2" : "grid-cols-1")}>
                        <Input value={r.issueNote} onChange={(e) => setRow(r.itemId, { issueNote: e.target.value })} placeholder="What happened?" className="h-9" />
                        {r.issue === "backordered" && (
                          <Input type="date" value={r.issueExpectedOn} onChange={(e) => setRow(r.itemId, { issueExpectedOn: e.target.value })} className="h-9" aria-label="Expected date" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {showPrices && total > 0 && <p className="text-right text-sm text-muted-foreground">Delivered at the prices entered: <span className="font-bold text-foreground">{formatCurrency(total)}</span></p>}

          <div className="sticky bottom-0 flex gap-2 bg-background pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1 font-bold" disabled={save.isPending || scanning || rows.length === 0} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Log delivery"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
