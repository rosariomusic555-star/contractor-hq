/* =============================================================================
 * A project's Invoices and Change orders pages — the per-row wording and the
 * summary numbers. Pure; money math stays in projectMoney.ts / api.ts
 * (projectContractValue, approvedChangeOrderTotal) — this only labels and
 * groups what they compute.
 * ========================================================================== */

import type { ChangeOrder, Invoice, Quote } from "./api";
import { DEPOSIT_INVOICE_NOTE } from "./api";
import { invoiceDaysLate } from "./financials";
import { invoiceBalance, invoicePaid } from "./projectMoney";
import { activityLine } from "./quoteActivity";

export type Tone = "muted" | "good" | "warn" | "bad";

const r2 = (n: number) => Math.round(n * 100) / 100;
const shortDate = (iso: string) =>
  new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "CO-001", "CO-002"… in creation order (display-only, same as the old list). */
export function changeOrderNumbers(changeOrders: Pick<ChangeOrder, "id" | "created_at">[]): Map<string, string> {
  return new Map(
    [...changeOrders]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((co, i) => [co.id, `CO-${String(i + 1).padStart(3, "0")}`]),
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/** What the invoice bills: the deposit, a change order, or the job (progress / balance). */
export function invoiceKindLabel(inv: Pick<Invoice, "notes" | "change_order_id">, coNumbers: Map<string, string>): string {
  if (inv.change_order_id) return `Change order${coNumbers.get(inv.change_order_id) ? ` ${coNumbers.get(inv.change_order_id)}` : ""}`;
  if (inv.notes === DEPOSIT_INVOICE_NOTE) return "Deposit";
  return "Progress / balance";
}

/** When it's due, relative to today — "Due in 5 days", "12 days late", "Paid Oct 2, 2026". */
export function invoiceTiming(inv: Pick<Invoice, "status" | "due_date" | "paid_at" | "amount" | "amount_paid">, now: Date = new Date()): { text: string; tone: Tone } {
  if (inv.status === "draft") return { text: "Not sent yet", tone: "muted" };
  if (inv.status === "paid" || invoiceBalance(inv) <= 0.004) return { text: inv.paid_at ? `Paid ${shortDate(inv.paid_at)}` : "Paid", tone: "good" };
  if (!inv.due_date) return { text: "No due date", tone: "muted" };
  const late = invoiceDaysLate(inv, now);
  if (late > 0) return { text: `${late} day${late === 1 ? "" : "s"} late`, tone: "bad" };
  if (late === 0) return { text: "Due today", tone: "warn" };
  const inDays = -late;
  return { text: `Due in ${inDays} day${inDays === 1 ? "" : "s"}`, tone: inDays <= 3 ? "warn" : "muted" };
}

/** Where the client is with it: Draft → Sent → Viewed → Partially paid → Paid. */
export function invoiceClientStep(inv: Pick<Invoice, "status" | "viewed_at" | "amount" | "amount_paid">): { label: string; tone: Tone } {
  if (inv.status === "draft") return { label: "Draft", tone: "muted" };
  if (inv.status === "paid" || (Number(inv.amount) > 0 && invoiceBalance(inv) <= 0.004)) return { label: "Paid", tone: "good" };
  if (invoicePaid(inv) > 0.004) return { label: "Partially paid", tone: "warn" };
  if (inv.viewed_at) return { label: "Viewed", tone: "muted" };
  return { label: "Sent · not opened", tone: "muted" };
}

export interface InvoiceAttention {
  overdue: Invoice[];
  notOpened: Invoice[];
  viewedUnpaid: Invoice[];
}

/** The "Needs attention" band: late ones, sent but never opened, opened but unpaid. */
export function invoicesNeedingAttention(invoices: Invoice[], now: Date = new Date()): InvoiceAttention {
  const open = invoices.filter((i) => i.status !== "draft" && i.status !== "paid" && invoiceBalance(i) > 0.004);
  const overdue = open.filter((i) => invoiceDaysLate(i, now) > 0);
  const rest = open.filter((i) => !overdue.includes(i));
  return {
    overdue,
    notOpened: rest.filter((i) => !i.viewed_at),
    viewedUnpaid: rest.filter((i) => !!i.viewed_at),
  };
}

/** "2 of 4 paid" — among sent (non-draft) invoices. */
export function invoicesPaidLine(invoices: Pick<Invoice, "status" | "amount" | "amount_paid">[]): string | null {
  const real = invoices.filter((i) => i.status !== "draft");
  if (real.length === 0) return null;
  const paid = real.filter((i) => i.status === "paid" || invoiceBalance(i) <= 0.004).length;
  return `${paid} of ${real.length} paid`;
}

// ---------------------------------------------------------------------------
// Change orders
// ---------------------------------------------------------------------------

export interface ChangeOrderSummary {
  /** The contract before any change order (contract value − approved changes). */
  original: number;
  approvedChanges: number;
  current: number;
  pending: { count: number; total: number };
  /** Working days approved change orders add (net). */
  scheduleDays: number;
}

export function changeOrderSummary(changeOrders: Pick<ChangeOrder, "status" | "amount" | "schedule_impact_days">[], contractValue: number): ChangeOrderSummary {
  const approved = changeOrders.filter((co) => co.status === "approved");
  const approvedChanges = r2(approved.reduce((s, co) => s + Number(co.amount), 0));
  const pending = changeOrders.filter((co) => co.status === "sent");
  return {
    original: r2(contractValue - approvedChanges),
    approvedChanges,
    current: r2(contractValue),
    pending: { count: pending.length, total: r2(pending.reduce((s, co) => s + Number(co.amount), 0)) },
    scheduleDays: approved.reduce((s, co) => s + Number(co.schedule_impact_days ?? 0), 0),
  };
}

/** How it was decided — "Approved Oct 2 by Greg (client)", "Approved on paper by Greg — recorded by Rosa". */
export function changeOrderDecisionLine(
  co: Pick<ChangeOrder, "status" | "approved_at" | "approved_by" | "signed_by" | "approved_manually_by" | "approval_method" | "declined_at" | "decline_comment" | "created_at">,
): string {
  if (co.status === "approved") {
    const when = co.approved_at ? ` ${shortDate(co.approved_at)}` : "";
    const who = co.signed_by || co.approved_by;
    if (co.approved_manually_by) {
      const how = co.approval_method === "in_person" ? " in person" : co.approval_method === "paper" ? " on paper" : "";
      return `Approved${how}${when}${who ? ` by ${who}` : ""} — recorded by ${co.approved_manually_by}`;
    }
    return `Approved${when}${who ? ` by ${who}` : ""}`;
  }
  if (co.status === "declined") return `Declined${co.declined_at ? ` ${shortDate(co.declined_at)}` : ""}${co.decline_comment ? ` — "${co.decline_comment}"` : ""}`;
  if (co.status === "sent") return "Waiting on the client";
  return `Draft · started ${shortDate(co.created_at)}`;
}

/** Invoices billing each change order, by change order id. */
export function invoicesByChangeOrder<T extends Pick<Invoice, "change_order_id">>(invoices: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const i of invoices) {
    if (!i.change_order_id) continue;
    const list = out.get(i.change_order_id);
    if (list) list.push(i);
    else out.set(i.change_order_id, [i]);
  }
  return out;
}

export const signedMoney = (n: number, fmt: (v: number) => string) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : fmt(0));

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

type QuoteLike = Pick<Quote, "id" | "kind" | "status">;

/** "Add-on #2", "Original quote" (the signed one), "Option / revision"
 * (another original while there's more than one), else "Quote". */
export function quoteKindLabel(q: QuoteLike, all: QuoteLike[], addonNumbers: Map<string, number>): string {
  if (q.kind === "addon") return `Add-on${addonNumbers.get(q.id) ? ` #${addonNumbers.get(q.id)}` : ""}`;
  if (q.status === "approved") return "Original quote";
  const originals = all.filter((x) => x.kind !== "addon");
  return originals.length > 1 ? "Option / revision" : "Quote";
}

/** Where it stands with the client — who signed and how, the decline
 * comment, the view activity while it's out, or when the draft was touched. */
export function quoteDecisionLine(
  q: Pick<Quote, "status" | "signed_at" | "signed_by" | "approved_manually_by" | "approval_method" | "declined_at" | "decline_comment" | "updated_at" | "sent_at" | "view_count" | "first_viewed_at" | "last_viewed_at" | "last_view_device" | "selections_changed_at">,
  now: Date = new Date(),
): string {
  if (q.status === "approved") {
    const when = q.signed_at ? ` ${shortDate(q.signed_at)}` : "";
    if (q.approved_manually_by) {
      const how = q.approval_method === "in_person" ? " in person" : q.approval_method === "paper" ? " on paper" : "";
      return `Approved${how}${when}${q.signed_by ? ` by ${q.signed_by}` : ""} — recorded by ${q.approved_manually_by}`;
    }
    return `Signed${when}${q.signed_by ? ` by ${q.signed_by}` : ""} online`;
  }
  if (q.status === "declined") return `Declined${q.declined_at ? ` ${shortDate(q.declined_at)}` : ""}${q.decline_comment ? ` — "${q.decline_comment}"` : ""}`;
  if (q.status === "sent") return activityLine(q, now) ?? "Sent to the client";
  return `Draft · last edited ${shortDate(q.updated_at)}`;
}

export interface QuoteSummary {
  sent: { count: number; total: number };
  drafts: { count: number; total: number };
  declined: number;
}

/** Totals by state; `totalOf` is the quote's price (quoteTotal). */
export function quoteSummary<T extends Pick<Quote, "status">>(quotes: T[], totalOf: (q: T) => number): QuoteSummary {
  const sum = (xs: T[]) => r2(xs.reduce((s, q) => s + totalOf(q), 0));
  const sent = quotes.filter((q) => q.status === "sent");
  const drafts = quotes.filter((q) => q.status === "draft");
  return {
    sent: { count: sent.length, total: sum(sent) },
    drafts: { count: drafts.length, total: sum(drafts) },
    declined: quotes.filter((q) => q.status === "declined").length,
  };
}


/** Can this change order get an invoice now? Only an approved, positive one
 * (a credit comes off the balance) that isn't billed yet — so it's never
 * invoiced twice. `existing` = the invoices already billing it. */
export function changeOrderInvoiceable(
  co: Pick<ChangeOrder, "status" | "amount">,
  existing: Pick<Invoice, "id">[],
): { ok: true } | { ok: false; reason: "not_approved" | "credit" | "already_invoiced" } {
  if (co.status !== "approved") return { ok: false, reason: "not_approved" };
  if (!(Number(co.amount) > 0)) return { ok: false, reason: "credit" };
  if (existing.length > 0) return { ok: false, reason: "already_invoiced" };
  return { ok: true };
}
