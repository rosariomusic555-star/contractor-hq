import { useEffect, useMemo, useState, type ReactNode, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveModal } from "@/components/common/ResponsiveModal";
import { useToast } from "@/hooks/use-toast";
import { useInvalidateMoney } from "@/hooks/use-invalidate-money";
import { cn, formatCurrency } from "@/lib/utils";
import {
  createPayment,
  setPaymentAllocations,
  updatePayment,
  type Invoice,
  type Payment,
  type PaymentMethod,
} from "@/lib/api";
import { PAYMENT_METHODS, invoiceBalance, suggestAllocations } from "@/lib/projectMoney";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const num = (v: string) => {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const money = (v: number) => (v ? String(Math.round(v * 100) / 100) : "");

/**
 * Record (or edit) a payment (0111) — amount, date, method, reference,
 * note, and optionally apply it to one or more open invoices in partial
 * amounts. Whatever isn't applied stays project credit. Default: no
 * allocation, unless opened from an invoice (`defaultInvoiceId`).
 */
function RecordPaymentSheetInner({
  open,
  onOpenChange,
  projectId,
  invoices,
  payment,
  defaultInvoiceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string | null;
  /** The invoices it could be applied to (the project's, or just this one). */
  invoices: Invoice[];
  /** Edit mode. */
  payment?: Payment | null;
  /** Opened from an invoice — pre-applies the payment to it, amount = its balance. */
  defaultInvoiceId?: string | null;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const invalidateMoney = useInvalidateMoney();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayYmd());
  const [method, setMethod] = useState<PaymentMethod>("check");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [applyOn, setApplyOn] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  // This payment's own existing allocations count as available again on edit.
  const ownAlloc = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of payment?.payment_allocations ?? []) m.set(a.invoice_id, Number(a.amount));
    return m;
  }, [payment]);

  const candidates = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== "draft")
        .map((inv) => ({ inv, available: Math.round((invoiceBalance(inv) + (ownAlloc.get(inv.id) ?? 0)) * 100) / 100 }))
        .filter((c) => c.available > 0.004 || ownAlloc.has(c.inv.id))
        .sort((a, b) => a.inv.created_at.localeCompare(b.inv.created_at)),
    [invoices, ownAlloc],
  );

  // Until the contractor edits an allocation by hand, the "apply to
  // invoices" amounts follow the payment amount (oldest first) — typing a
  // partial payment no longer leaves the full balance applied (and the save
  // blocked with "Applied … is more than the payment").
  const allocTouched = useRef(false);
  useEffect(() => {
    if (!open) return;
    allocTouched.current = !!payment;
    if (payment) {
      setAmount(money(Number(payment.amount)));
      setPaidOn(payment.paid_on);
      setMethod(payment.method);
      setReference(payment.reference ?? "");
      setNote(payment.note ?? "");
      const a: Record<string, string> = {};
      for (const x of payment.payment_allocations ?? []) a[x.invoice_id] = money(Number(x.amount));
      setAlloc(a);
      setApplyOn(Object.keys(a).length > 0);
    } else {
      const target = defaultInvoiceId ? invoices.find((i) => i.id === defaultInvoiceId) : undefined;
      const bal = target ? invoiceBalance(target) : 0;
      setAmount(money(bal));
      setPaidOn(todayYmd());
      setMethod("check");
      setReference("");
      setNote("");
      setAlloc(target ? { [target.id]: money(bal) } : {});
      setApplyOn(!!target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?.id, defaultInvoiceId]);

  const total = num(amount);
  const allocations = applyOn
    ? Object.entries(alloc)
        .map(([invoice_id, v]) => ({ invoice_id, amount: num(v) }))
        .filter((a) => a.amount > 0)
    : [];
  const appliedSum = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const credit = Math.round((total - appliedSum) * 100) / 100;
  const overInvoice = allocations.find((a) => a.amount > (candidates.find((c) => c.inv.id === a.invoice_id)?.available ?? 0) + 0.004);
  const error =
    total <= 0
      ? "Enter an amount"
      : !paidOn
        ? "Pick a date"
        : credit < -0.004
          ? `Applied ${formatCurrency(appliedSum)} is more than the payment`
          : overInvoice
            ? "An amount is more than that invoice's balance"
            : null;

  const save = useMutation({
    mutationFn: async () => {
      if (payment) {
        const patch: Parameters<typeof updatePayment>[1] = {};
        if (total !== Number(payment.amount)) patch.amount = total;
        if (paidOn !== payment.paid_on) patch.paid_on = paidOn;
        if (method !== payment.method) patch.method = method;
        if ((reference.trim() || null) !== payment.reference) patch.reference = reference;
        if ((note.trim() || null) !== payment.note) patch.note = note;
        // Shrinking the amount below what's applied: drop allocations first.
        const reduceFirst = total < Number(payment.amount);
        if (reduceFirst) await setPaymentAllocations(payment.id, allocations);
        if (Object.keys(patch).length) await updatePayment(payment.id, patch);
        if (!reduceFirst) await setPaymentAllocations(payment.id, allocations);
        return;
      }
      await createPayment({ project_id: projectId, amount: total, paid_on: paidOn, method, reference, note }, allocations);
    },
    onSuccess: () => {
      invalidateMoney();
      toast({ title: payment ? "Payment updated" : "Payment recorded", description: payment ? undefined : "Receipt created" });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err: Error) => toast({ title: "Couldn't save payment", description: err.message, variant: "destructive" }),
  });

  const suggested = (forTotal: number) => {
    const next: Record<string, string> = {};
    for (const s of suggestAllocations(
      forTotal,
      candidates.map((c) => ({ ...c.inv, amount_paid: Number(c.inv.amount) - c.available })),
    ))
      next[s.invoice_id] = money(s.amount);
    return next;
  };
  const fill = () => {
    allocTouched.current = true;
    setAlloc(suggested(total));
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={payment ? `Edit payment ${payment.receipt_number ?? ""}`.trim() : "Record payment"}
      description={payment ? "Changes are kept in the payment's history." : "Money received — a receipt is created automatically."}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                id="pay-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className="pl-6 text-base font-bold tabular-nums"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (!allocTouched.current && applyOn) setAlloc(suggested(num(e.target.value)));
                }}
                autoFocus={!payment}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Date received</Label>
            <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="text-base" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Method</Label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  method === m.value
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pay-ref">{method === "check" ? "Check #" : "Reference"}</Label>
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === "check" ? "1042" : "Confirmation / transaction #"}
            inputMode={method === "check" ? "numeric" : undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pay-note">Note</Label>
          <Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal — not on the receipt" />
        </div>

        <div className="rounded-xl border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
            <Checkbox checked={applyOn} onCheckedChange={(v) => setApplyOn(!!v)} disabled={candidates.length === 0} />
            Apply to invoice
            {candidates.length === 0 && <span className="text-xs font-normal text-muted-foreground">· no open invoices</span>}
          </label>
          {applyOn && candidates.length > 0 && (
            <div className="mt-3 space-y-2">
              {candidates.map(({ inv, available }) => (
                <div key={inv.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{inv.invoice_number ?? "Invoice"}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(available)} open</div>
                  </div>
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      aria-label={`Apply to ${inv.invoice_number ?? "invoice"}`}
                      inputMode="decimal"
                      className="h-9 pl-5 text-right tabular-nums"
                      placeholder="0"
                      value={alloc[inv.id] ?? ""}
                      onChange={(e) => {
                        allocTouched.current = true;
                        setAlloc((a) => ({ ...a, [inv.id]: e.target.value }));
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 text-xs">
                <button type="button" onClick={fill} className="font-semibold text-primary hover:underline" disabled={total <= 0}>
                  Fill oldest first
                </button>
                <span className={cn("font-semibold", credit < -0.004 ? "text-destructive" : "text-muted-foreground")}>
                  {credit >= 0 ? `${formatCurrency(credit)} stays as project credit` : `${formatCurrency(-credit)} over`}
                </span>
              </div>
            </div>
          )}
          {!applyOn && total > 0 && projectId && (
            <p className="mt-2 text-xs text-muted-foreground">Not applied — {formatCurrency(total)} stays as project credit.</p>
          )}
        </div>

        {error && total > 0 && <p className="text-sm font-semibold text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={!!error || save.isPending}>
            {save.isPending ? "Saving…" : payment ? "Save changes" : `Record ${total > 0 ? formatCurrency(total) : "payment"}`}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const RecordPaymentSheet = withErrorBoundary(RecordPaymentSheetInner, "RecordPaymentSheet");
