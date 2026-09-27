import type { Invoice, Payment, PaymentMethod } from "./api";

/**
 * Project money (0111) — the ONE place the payment / balance math lives.
 * Quote, change order / add-on, invoice, payment and receipt stay distinct:
 *
 *   contract value          original quote + approved add-ons + approved COs
 *                           (projectContractValue in api.ts — passed in)
 *   invoiced                Σ non-draft invoices
 *   received                Σ ACTIVE payments (applied + unallocated)
 *   applied                 Σ active payments' allocations to invoices
 *   unpaid invoice balance  Σ per invoice max(0, amount − applied to it)
 *   remaining balance       contract − received   (negative = overpaid)
 *   unallocated credit      Σ active payments' amount − their allocations
 *
 * Void payments are kept (crossed out in lists) but never count anywhere.
 */

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH / bank transfer" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "other", label: "Other" },
];

export const paymentMethodLabel = (m: PaymentMethod | string | null | undefined) =>
  PAYMENT_METHODS.find((x) => x.value === m)?.label ?? "Other";

const r2 = (v: number) => Math.round(v * 100) / 100;

type PaymentLike = Pick<Payment, "amount" | "status"> & { payment_allocations?: { invoice_id: string; amount: number }[] };

export const isActivePayment = (p: Pick<Payment, "status">) => p.status !== "void";

export const activePayments = <T extends Pick<Payment, "status">>(payments: T[]) => payments.filter(isActivePayment);

/** Σ this payment's allocations to invoices. */
export const paymentApplied = (p: PaymentLike) => r2((p.payment_allocations ?? []).reduce((s, a) => s + Number(a.amount), 0));

/** What's left of this payment as project credit. */
export const paymentUnallocated = (p: PaymentLike) => Math.max(0, r2(Number(p.amount) - paymentApplied(p)));

/** Active payments' applied amounts, per invoice id. */
export function appliedByInvoice(payments: PaymentLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) {
    if (!isActivePayment(p)) continue;
    for (const a of p.payment_allocations ?? []) m.set(a.invoice_id, r2((m.get(a.invoice_id) ?? 0) + Number(a.amount)));
  }
  return m;
}

/** What's been applied to an invoice — the trigger-synced amount_paid, or
 * (a pre-0111 row) the full amount when it's marked paid. */
export const invoicePaid = (inv: Pick<Invoice, "amount" | "status" | "amount_paid">) =>
  inv.amount_paid != null ? Number(inv.amount_paid) : inv.status === "paid" ? Number(inv.amount) : 0;

export const invoiceBalance = (inv: Pick<Invoice, "amount" | "status" | "amount_paid">) =>
  Math.max(0, r2(Number(inv.amount) - invoicePaid(inv)));

export type InvoicePaymentState = "draft" | "paid" | "partial" | "unpaid";

export function invoicePaymentState(inv: Pick<Invoice, "amount" | "status" | "amount_paid">): InvoicePaymentState {
  if (inv.status === "paid") return "paid";
  if (inv.status === "draft") return "draft";
  return invoicePaid(inv) > 0.004 ? "partial" : "unpaid";
}

/** Invoices that can still take a payment (sent / overdue, balance left). */
export const openInvoices = <T extends Pick<Invoice, "amount" | "status" | "amount_paid">>(invoices: T[]) =>
  invoices.filter((i) => (i.status === "sent" || i.status === "overdue") && invoiceBalance(i) > 0.004);

export interface ProjectMoneySummary {
  contractValue: number;
  invoiced: number;
  received: number;
  applied: number;
  unpaidInvoiceBalance: number;
  /** contract − received; negative when overpaid. */
  remaining: number;
  unallocatedCredit: number;
  /** received − contract, when > 0. */
  overpaid: number;
}

export function projectMoneySummary(input: {
  contractValue: number;
  invoices: Pick<Invoice, "id" | "amount" | "status" | "amount_paid">[];
  payments: PaymentLike[];
}): ProjectMoneySummary {
  const active = activePayments(input.payments);
  const received = r2(active.reduce((s, p) => s + Number(p.amount), 0));
  const applied = r2(active.reduce((s, p) => s + paymentApplied(p), 0));
  const real = input.invoices.filter((i) => i.status !== "draft");
  const invoiced = r2(real.reduce((s, i) => s + Number(i.amount), 0));
  const byInvoice = appliedByInvoice(active);
  const unpaidInvoiceBalance = r2(real.reduce((s, i) => s + Math.max(0, Number(i.amount) - (byInvoice.get(i.id) ?? 0)), 0));
  const remaining = r2(input.contractValue - received);
  return {
    contractValue: r2(input.contractValue),
    invoiced,
    received,
    applied,
    unpaidInvoiceBalance,
    remaining,
    unallocatedCredit: r2(active.reduce((s, p) => s + paymentUnallocated(p), 0)),
    overpaid: Math.max(0, -remaining),
  };
}

/** "INV-001 · INV-002" / "Applied to project balance" — what a payment went to. */
export function paymentAppliedToLabel(p: {
  amount: number;
  payment_allocations?: { invoice_id: string; amount: number; invoice?: { invoice_number: string | null } | null }[];
}): string {
  const parts = (p.payment_allocations ?? []).map((a) => a.invoice?.invoice_number ?? "Invoice");
  const rest = paymentUnallocated({ ...p, status: "active" });
  if (parts.length === 0) return "Applied to project balance";
  return rest > 0.004 ? `${parts.join(" · ")} + credit` : parts.join(" · ");
}

/** A payment's paid_on (a plain date) as a local Date at midnight. */
export const paidOnDate = (paidOn: string) => new Date(`${paidOn.slice(0, 10)}T00:00:00`);

/** Largest amount a new payment could apply to each open invoice, in order,
 * filling oldest invoice first — the "Apply" suggestion. */
export function suggestAllocations(amount: number, invoices: Pick<Invoice, "id" | "amount" | "status" | "amount_paid" | "created_at">[]) {
  let left = r2(amount);
  return [...openInvoices(invoices)]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((inv) => {
      const take = Math.max(0, Math.min(left, invoiceBalance(inv)));
      left = r2(left - take);
      return { invoice_id: inv.id, amount: r2(take) };
    })
    .filter((a) => a.amount > 0);
}
