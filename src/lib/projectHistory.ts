import type {
  PortalChangeOrder,
  PortalDocType,
  PortalInvoice,
  PortalPayment,
  PortalProjectDetail,
  PortalQuote,
  PortalVersion,
} from "./portalApi";
import { contractBreakdown, invoiceBalance, invoicePaid, invoicePaymentState, paymentMethodLabel, projectMoneySummary } from "./projectMoney";

/**
 * The Client Hub's project history (0113) — the client-facing financial
 * timeline (quotes and their revisions, add-ons, change orders, invoices,
 * payments), plus the money blocks. Pure: the Hub, the contractor's Client
 * view and the project summary PDF all build from the same client-safe
 * payload through here.
 */

export type HistoryKind = "quote" | "revision" | "addon" | "change_order" | "invoice" | "payment";
export type HistoryTone = "green" | "amber" | "red" | "blue" | "grey";

export interface HistoryEntry {
  key: string;
  kind: HistoryKind;
  /** ISO date/time the entry is sorted by. */
  date: string;
  title: string;
  status: { label: string; tone: HistoryTone };
  /** Signed; null when there's no amount. */
  amount: number | null;
  /** Counted in the contract / balances. */
  counted: boolean;
  /** "Superseded by v2" / "Not included in totals" / … */
  note?: string;
  /** Detail lines shown when the entry is expanded. */
  details: { label: string; value: string }[];
  /** In-app route (relative to the documents base) or an absolute receipt URL. */
  href: { doc: { kind: "quote" | "change-order" | "invoice"; id: string; version?: number } } | { receipt: string };
  struck?: boolean;
}

const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const historyDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

/** When a version went out. The 0113 baseline was taken on migration day,
 * so a baseline v1 dates from the document itself. */
export const versionDate = (v: Pick<PortalVersion, "event" | "created_at">, docDate: string | null | undefined) =>
  v.event === "baseline" && docDate ? docDate : v.created_at;

export function versionsOf(detail: Pick<PortalProjectDetail, "versions">, type: PortalDocType, id: string): PortalVersion[] {
  return (detail.versions ?? []).filter((v) => v.doc_type === type && v.doc_id === id).sort((a, b) => a.version - b.version);
}

const decision = (status: string, approval: { name?: string | null; at?: string | null } | null | undefined) =>
  status === "approved" && approval?.at
    ? [{ label: "Approved", value: `${approval.name ? `${approval.name}, ` : ""}${historyDate(approval.at)}` }]
    : status === "declined" && approval?.at
      ? [{ label: "Declined", value: historyDate(approval.at) }]
      : [];

function quoteEntries(detail: PortalProjectDetail, headlineId: string | undefined): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const q of detail.quotes) {
    const isAddon = q.kind === "addon";
    const vs = versionsOf(detail, "quote", q.id);
    const rows: { n: number; date: string; state: string; total: number; content: PortalQuote; approval: PortalVersion["approval"] }[] =
      vs.length > 0
        ? vs.map((v) => ({ n: v.version, date: versionDate(v, q.created_at), state: v.state, total: Number(v.total ?? 0), content: v.content as PortalQuote, approval: v.approval }))
        : [{ n: 1, date: q.created_at ?? q.updated_at ?? "", state: q.status, total: Number(q.total ?? 0), content: q, approval: q.approval ?? null }];
    const latest = rows[rows.length - 1].n;
    for (const r of rows) {
      const superseded = r.n < latest;
      const current = !superseded;
      const status = current ? q.status : r.state;
      const base = isAddon ? `Add-on quote${q.addon_number ? ` #${q.addon_number}` : ""}` : r.n > 1 ? "Revised quote" : "Original quote";
      const title = rows.length > 1 || r.n > 1 ? `${base} v${r.n}` : base;
      const counted = current && status === "approved" && (isAddon || q.id === headlineId);
      const note = superseded
        ? `Superseded by v${latest}`
        : status === "declined"
          ? "Declined — not included in totals"
          : status === "sent"
            ? "Awaiting approval — not included in totals yet"
            : !counted && status === "approved"
              ? "Not the current contract"
              : undefined;
      out.push({
        key: `quote-${q.id}-v${r.n}`,
        kind: isAddon ? "addon" : r.n > 1 ? "revision" : "quote",
        date: r.date,
        title,
        status: superseded ? { label: "Superseded", tone: "grey" } : quoteStatus(status),
        amount: r.total,
        counted,
        note,
        struck: superseded,
        details: [{ label: "Sent", value: historyDate(r.date) }, ...decision(r.state, r.approval ?? r.content.approval)],
        href: { doc: { kind: "quote", id: q.id, version: superseded ? r.n : undefined } },
      });
    }
  }
  return out;
}

const quoteStatus = (s: string): HistoryEntry["status"] =>
  s === "approved" ? { label: "Approved", tone: "green" } : s === "declined" ? { label: "Declined", tone: "red" } : { label: "Sent", tone: "amber" };

function changeOrderEntries(detail: PortalProjectDetail): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const co of detail.change_orders) {
    const vs = versionsOf(detail, "change_order", co.id);
    const rows = vs.length
      ? vs.map((v) => ({ n: v.version, date: versionDate(v, co.created_at), state: v.state, total: Number(v.total ?? 0), content: v.content as PortalChangeOrder, approval: v.approval }))
      : [{ n: 1, date: co.created_at, state: co.status, total: Number(co.total ?? co.amount), content: co, approval: co.approval ?? null }];
    const latest = rows[rows.length - 1].n;
    for (const r of rows) {
      const superseded = r.n < latest;
      const status = superseded ? r.state : co.status;
      const counted = !superseded && status === "approved";
      out.push({
        key: `co-${co.id}-v${r.n}`,
        kind: "change_order",
        date: r.date,
        title: `Change order${co.number ? ` #${co.number}` : ""} · ${co.title}${rows.length > 1 ? ` v${r.n}` : ""}`,
        status: superseded ? { label: "Superseded", tone: "grey" } : quoteStatus(status),
        amount: r.total,
        counted,
        struck: superseded,
        note: superseded
          ? `Superseded by v${latest}`
          : status === "declined"
            ? "Declined — not included in totals"
            : status === "sent"
              ? "Pending your approval — not included in totals yet"
              : r.total < 0
                ? "Credit"
                : undefined,
        details: [{ label: "Sent", value: historyDate(r.date) }, ...decision(r.state, r.approval ?? r.content.approval)],
        href: { doc: { kind: "change-order", id: co.id, version: superseded ? r.n : undefined } },
      });
    }
  }
  return out;
}

export function invoiceStatusLabel(inv: Pick<PortalInvoice, "amount" | "status" | "amount_paid">): HistoryEntry["status"] {
  const state = invoicePaymentState({ ...inv, status: inv.status as "sent" });
  if (state === "paid") return { label: "Paid", tone: "green" };
  if (state === "partial") return { label: "Partially paid", tone: inv.status === "overdue" ? "red" : "amber" };
  if (inv.status === "overdue") return { label: "Overdue", tone: "red" };
  return { label: "Unpaid", tone: "blue" };
}

function invoiceEntries(detail: PortalProjectDetail): HistoryEntry[] {
  return detail.invoices.map((inv) => {
    const vs = versionsOf(detail, "invoice", inv.id);
    const sent = vs[0] ? versionDate(vs[0], inv.created_at) : inv.created_at;
    const paid = invoicePaid({ ...inv, status: inv.status as "sent" });
    return {
      key: `inv-${inv.id}`,
      kind: "invoice" as const,
      date: sent,
      title: `Invoice ${inv.invoice_number ?? ""}`.trim(),
      status: invoiceStatusLabel(inv),
      amount: Number(inv.amount),
      counted: true,
      note: vs.length > 1 ? `Revised — v${vs[vs.length - 1].version}` : undefined,
      details: [
        { label: "Issued", value: historyDate(sent) },
        ...(inv.due_date ? [{ label: "Due", value: historyDate(inv.due_date) }] : []),
        { label: "Paid", value: usd(paid) },
        { label: "Balance", value: usd(invoiceBalance({ ...inv, status: inv.status as "sent" })) },
      ],
      href: { doc: { kind: "invoice" as const, id: inv.id } },
    };
  });
}

export const paymentAppliedText = (p: Pick<PortalPayment, "amount" | "applied_to">) => {
  const applied = p.applied_to ?? [];
  if (applied.length === 0) return "Applied to project balance";
  const rest = Number(p.amount) - applied.reduce((s, a) => s + Number(a.amount), 0);
  const parts = applied.map((a) => `${a.invoice_number ?? "Invoice"} (${usd(Number(a.amount))})`);
  return rest > 0.004 ? `${parts.join(", ")} + ${usd(rest)} to project balance` : parts.join(", ");
};

function paymentEntries(detail: PortalProjectDetail): HistoryEntry[] {
  return (detail.payments ?? []).map((p) => {
    const isVoid = p.status === "void";
    return {
      key: `pay-${p.token}`,
      kind: "payment" as const,
      date: p.paid_on,
      title: `Payment received${p.receipt_number ? ` · ${p.receipt_number}` : ""}`,
      status: isVoid ? { label: "Void", tone: "grey" as const } : { label: "Received", tone: "green" as const },
      amount: Number(p.amount),
      counted: !isVoid,
      struck: isVoid,
      note: isVoid ? "Voided — not counted" : undefined,
      details: [
        { label: "Date", value: historyDate(p.paid_on) },
        { label: "Method", value: `${paymentMethodLabel(p.method)}${p.reference ? ` · #${p.reference}` : ""}` },
        { label: "Applied to", value: paymentAppliedText(p) },
      ],
      href: { receipt: p.token },
    };
  });
}

/** Newest first by default. Ties keep a stable, logical order. */
export function buildProjectHistory(detail: PortalProjectDetail, order: "newest" | "oldest" = "newest"): HistoryEntry[] {
  const headline = contractBreakdown(detail.quotes, detail.change_orders).lines.find((l) => l.kind === "original")?.id;
  const all = [...quoteEntries(detail, headline), ...changeOrderEntries(detail), ...invoiceEntries(detail), ...paymentEntries(detail)];
  const t = (e: HistoryEntry) => new Date(e.date.length <= 10 ? `${e.date}T12:00:00` : e.date).getTime() || 0;
  all.sort((a, b) => t(a) - t(b) || a.key.localeCompare(b.key));
  return order === "newest" ? all.reverse() : all;
}

/** The Hub / PDF money blocks, from Feature 2's shared summary. */
export function clientProjectMoney(detail: PortalProjectDetail) {
  const breakdown = contractBreakdown(detail.quotes, detail.change_orders);
  const summary = projectMoneySummary({
    contractValue: breakdown.total,
    invoices: detail.invoices.map((i) => ({ ...i, status: i.status as "sent" })),
    payments: (detail.payments ?? []).map((p) => ({
      amount: Number(p.amount),
      status: p.status,
      payment_allocations: p.applied_to.map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) })),
    })),
  });
  const unpaidInvoices = detail.invoices.filter((i) => i.status !== "paid" && invoiceBalance({ ...i, status: i.status as "sent" }) > 0.004);
  return { breakdown, summary, unpaidInvoices };
}
