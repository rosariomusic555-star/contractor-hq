import { pluralize, formatCurrency } from "./utils";
import { quoteTotal, type Invoice, type Quote } from "./api";
import { invoiceDaysLate } from "./aging";

// Thresholds — confirmed 2026-09-09. Overdue invoices flag once 3+ days
// past due; shared quotes flag once 3+ days old with no response.
const OVERDUE_DAYS_THRESHOLD = 3;
const FOLLOWUP_DAYS_THRESHOLD = 3;
const DAY = 86_400_000;

export type NeedsYouTone = "red" | "grey" | "green";

export interface NeedsYouItem {
  key: string;
  tone: NeedsYouTone;
  title: string;
  subtitle: string;
  action: string;
  href: string;
  /** Raw day count (late / days-since) — bigger is more urgent. Comparable
   * across categories on purpose, so the combined feed is genuinely
   * "most overdue first" rather than grouped by category first. */
  sortValue: number;
}

const daysSince = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);

/**
 * Overdue-invoice reminders: unpaid invoices (sent/overdue) more than
 * OVERDUE_DAYS_THRESHOLD days past their due date.
 */
function overdueInvoiceItems(invoices: Invoice[], now: Date): NeedsYouItem[] {
  return invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .map((i) => ({ invoice: i, late: invoiceDaysLate(i, now) }))
    .filter(({ late }) => late >= OVERDUE_DAYS_THRESHOLD)
    .sort((a, b) => b.late - a.late)
    .map(({ invoice, late }) => ({
      key: `invoice-${invoice.id}`,
      tone: "red" as const,
      title: `Invoice ${pluralize(late, "day")} late`,
      subtitle: `${invoice.project?.name ?? "Standalone"} · ${formatCurrency(Number(invoice.amount))}`,
      action: "Remind",
      href: `/invoices/${invoice.id}`,
      sortValue: late,
    }));
}

/**
 * Quote follow-ups: shared quotes (status 'sent') with no response for more
 * than FOLLOWUP_DAYS_THRESHOLD days. `updated_at` is the best available
 * proxy for "days since shared" — there's no dedicated sent_at column, so a
 * quote edited after sharing (still unread by the client) would reset the
 * clock. Good enough for a nudge threshold.
 */
function quoteFollowUpItems(quotes: Quote[], now: Date): NeedsYouItem[] {
  return quotes
    .filter((q) => q.status === "sent")
    .map((q) => ({ quote: q, since: daysSince(q.updated_at, now) }))
    .filter(({ since }) => since >= FOLLOWUP_DAYS_THRESHOLD)
    .sort((a, b) => b.since - a.since)
    .map(({ quote, since }) => ({
      key: `quote-followup-${quote.id}`,
      tone: "grey" as const,
      title: `Quote shared ${pluralize(since, "day")} ago`,
      subtitle: `${quote.project?.name ?? "Standalone quote"} · ${formatCurrency(quoteTotal(quote.quote_sections))}`,
      action: "Follow up",
      href: `/quotes/${quote.id}`,
      sortValue: since,
    }));
}

/**
 * Deposit prompts: approved quotes with no invoice logged yet, either
 * directly (invoice.quote_id) or via the shared project (an invoice created
 * without an explicit quote_id still counts as billing that project).
 * `updated_at` is the best available proxy for "days since approved" —
 * same reasoning/caveat as quoteFollowUpItems' "days since shared".
 */
function depositItems(quotes: Quote[], invoices: Invoice[], now: Date): NeedsYouItem[] {
  const billed = new Set<string>();
  for (const inv of invoices) {
    if (inv.quote_id) billed.add(`quote:${inv.quote_id}`);
    if (inv.project_id) billed.add(`project:${inv.project_id}`);
  }
  return quotes
    .filter((q) => q.status === "approved")
    .filter((q) => !billed.has(`quote:${q.id}`) && !(q.project_id && billed.has(`project:${q.project_id}`)))
    .map((quote) => ({
      key: `deposit-${quote.id}`,
      tone: "green" as const,
      title: "Quote approved — needs deposit",
      subtitle: `${quote.project?.name ?? "Standalone quote"} · ${quote.deposit_percentage}% of ${formatCurrency(
        quoteTotal(quote.quote_sections),
      )}`,
      action: "Bill",
      href: `/quotes/${quote.id}`,
      sortValue: daysSince(quote.updated_at, now),
    }));
}

/**
 * The full "Needs you" action queue — overdue chases, deposit prompts,
 * quote follow-ups — combined and sorted most-urgent-first (highest raw day
 * count, regardless of category). Single source of truth for both the
 * Dashboard card (NeedsYou.tsx, capped to 5) and the full list (/needs-you,
 * NeedsYouView.tsx, uncapped) so the two can never disagree on contents or
 * order.
 */
export function buildNeedsYouItems(quotes: Quote[], invoices: Invoice[], now: Date = new Date()): NeedsYouItem[] {
  return [
    ...overdueInvoiceItems(invoices, now),
    ...depositItems(quotes, invoices, now),
    ...quoteFollowUpItems(quotes, now),
  ].sort((a, b) => b.sortValue - a.sortValue);
}
