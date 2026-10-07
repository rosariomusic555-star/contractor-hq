import { pluralize, formatCurrency } from "./utils";
import { reviewNeedsYouItems, type ReviewNeedsYouInput, type ReviewSettingsLike } from "./reviews";
import { headlineDepositDue, quoteTotal, type Appointment, type Invoice, type Opportunity, type Quote } from "./api";
import { coldLabel, coldState } from "./quoteActivity";
import { invoiceDaysLate } from "./financials";
import { overdueSiteVisitsByOpportunity, siteVisitDateLabel } from "./siteVisitCheck";

// Thresholds — confirmed 2026-09-09. Overdue invoices flag once 3+ days
// past due; shared quotes flag once 3+ days old with no response.
const OVERDUE_DAYS_THRESHOLD = 3;
const FOLLOWUP_DAYS_THRESHOLD = 3;
const DAY = 86_400_000;

export type NeedsYouTone = "red" | "grey" | "green";

/** Filter chips on the Dashboard: All / Jobs / Money / Clients / Crew. */
export type NeedsYouCategory = "jobs" | "money" | "clients" | "crew";
export const NEEDS_YOU_CATEGORIES: { key: NeedsYouCategory; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "money", label: "Money" },
  { key: "clients", label: "Clients" },
  { key: "crew", label: "Crew" },
];

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
  /** Set by the builders; items from other modules get one from their key prefix (categoryOf). */
  category?: NeedsYouCategory;
}

const PREFIX_CATEGORY: [string, NeedsYouCategory][] = [
  ["precon", "jobs"],
  ["heads-up", "jobs"],
  ["insights", "jobs"],
  ["maint", "clients"],
  ["review", "clients"],
  ["quote", "clients"],
  ["site-visit", "clients"],
  ["change-request", "clients"],
  ["co-", "clients"],
  ["task", "clients"],
  ["invoice", "money"],
  ["deposit", "money"],
  ["credit", "money"],
  ["progress", "crew"],
  ["timesheet", "crew"],
];

export function categoryOf(item: Pick<NeedsYouItem, "key" | "category">): NeedsYouCategory {
  return item.category ?? PREFIX_CATEGORY.find(([p]) => item.key.startsWith(p))?.[1] ?? "jobs";
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
function quoteFollowUpItems(quotes: Quote[], now: Date, cold?: ColdSettings | null): NeedsYouItem[] {
  return quotes
    .filter((q) => q.status === "sent")
    .map((q) => ({ quote: q, since: daysSince(q.updated_at, now), cold: cold ? coldState(q, cold, now) : null }))
    .filter(({ since, cold: c }) => since >= FOLLOWUP_DAYS_THRESHOLD || !!c)
    .sort((a, b) => b.since - a.since)
    .map(({ quote, since, cold: c }) => ({
      // Going cold (0117) replaces the plain follow-up for the same quote.
      key: `quote-followup-${quote.id}`,
      tone: c ? ("red" as const) : ("grey" as const),
      title: c ? coldLabel(c) : `Quote shared ${pluralize(since, "day")} ago`,
      subtitle: `${quote.project?.name ?? "Standalone quote"} · ${formatCurrency(quoteTotal(quote.quote_sections))}`,
      action: "Follow up",
      href: `/quotes/${quote.id}`,
      sortValue: Math.max(since, c?.days ?? 0),
      category: "clients" as const,
    }));
}

type ColdSettings = { cold_unopened_days: number; cold_unsigned_days: number };

/** Everything else the Dashboard queue pulls in — each list already loaded elsewhere. */
export interface NeedsYouMore {
  coldSettings?: ColdSettings | null;
  /** Client change requests on approved selections (0115), status open. */
  changeRequests?: { id: string; project_id: string | null; note: string | null; created_at: string; requested_by: string | null; project?: { name: string } | null }[];
  /** Change orders sent to the client, no answer yet. */
  changeOrders?: { id: string; project_id: string; status: string; title?: string | null; updated_at: string; project?: { name: string } | null }[];
  /** Payments with money not yet applied to an invoice. */
  credits?: { id: string; unallocated: number; paid_on: string; project_id: string | null; project?: { name: string } | null }[];
  /** CRM tasks (overdue / due today). */
  tasks?: { id: string; title: string; due_at: string | null; completed: boolean }[];
  progressPending?: { id: string; project_id: string; project?: { name: string } | null; author_name?: string | null; created_at: string }[];
  timesheetsSubmitted?: { id: string; employee?: { name: string } | null; period_start: string; submitted_at: string | null }[];
  headsUps?: { id: string; project_id: string; project?: { name: string } | null; created_at: string }[];
  insightsOpen?: number;
}

function moreItems(m: NeedsYouMore, now: Date): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  const today = now.toISOString().slice(0, 10);
  for (const r of m.changeRequests ?? []) {
    out.push({
      key: `change-request-${r.id}`,
      tone: "red",
      title: `Change request${r.requested_by ? ` from ${r.requested_by}` : ""}`,
      subtitle: `${r.project?.name ?? "Project"}${r.note ? ` · “${r.note}”` : ""}`,
      action: "Review",
      href: `/projects/${r.project_id}`,
      sortValue: Math.max(daysSince(r.created_at, now), 1) + 2,
      category: "clients",
    });
  }
  for (const c of m.changeOrders ?? []) {
    const since = daysSince(c.updated_at, now);
    if (c.status !== "sent" || since < FOLLOWUP_DAYS_THRESHOLD) continue;
    out.push({
      key: `co-${c.id}`,
      tone: "grey",
      title: `Change order waiting ${pluralize(since, "day")}`,
      subtitle: `${c.project?.name ?? "Project"}${c.title ? ` · ${c.title}` : ""}`,
      action: "Follow up",
      href: `/projects/${c.project_id}/change-orders/${c.id}`,
      sortValue: since,
      category: "clients",
    });
  }
  for (const p of m.credits ?? []) {
    if (p.unallocated < 0.01) continue;
    out.push({
      key: `credit-${p.id}`,
      tone: "green",
      title: `${formatCurrency(p.unallocated)} unapplied credit`,
      subtitle: `${p.project?.name ?? "Payment"} · received ${p.paid_on}`,
      action: "Apply",
      href: p.project_id ? `/projects/${p.project_id}` : "/invoices",
      sortValue: Math.max(daysSince(p.paid_on, now), 1),
      category: "money",
    });
  }
  const due = (m.tasks ?? []).filter((t) => !t.completed && t.due_at && t.due_at.slice(0, 10) <= today);
  for (const t of due) {
    const late = daysSince(t.due_at!, now);
    out.push({
      key: `task-${t.id}`,
      tone: late > 0 ? "red" : "grey",
      title: t.title,
      subtitle: late > 0 ? `Task · ${pluralize(late, "day")} overdue` : "Task · due today",
      action: "Open",
      href: "/tasks",
      sortValue: Math.max(late, 0) + 1,
      category: "clients",
    });
  }
  const prog = m.progressPending ?? [];
  if (prog.length) {
    out.push({
      key: "progress-pending",
      tone: "grey",
      title: `${pluralize(prog.length, "crew update")} to review`,
      subtitle: [...new Set(prog.map((p) => p.project?.name).filter(Boolean))].join(", ") || "Progress updates",
      action: "Review",
      href: "/dashboard#crew",
      sortValue: Math.max(...prog.map((p) => daysSince(p.created_at, now)), 1),
      category: "crew",
    });
  }
  const ts = m.timesheetsSubmitted ?? [];
  if (ts.length) {
    out.push({
      key: "timesheets-waiting",
      tone: "grey",
      title: `${pluralize(ts.length, "timesheet")} waiting for approval`,
      subtitle: ts.map((t) => t.employee?.name).filter(Boolean).join(", "),
      action: "Review",
      href: "/timesheets",
      sortValue: Math.max(...ts.map((t) => (t.submitted_at ? daysSince(t.submitted_at, now) : 0)), 1),
      category: "crew",
    });
  }
  for (const h of m.headsUps ?? []) {
    out.push({
      key: `heads-up-${h.id}`,
      tone: "red",
      title: "Let the client know about the schedule change",
      subtitle: h.project?.name ?? "Schedule change",
      action: "Send",
      href: `/projects/${h.project_id}`,
      sortValue: Math.max(daysSince(h.created_at, now), 1) + 1,
      category: "jobs",
    });
  }
  if (m.insightsOpen) {
    out.push({
      key: "insights-open",
      tone: "grey",
      title: `${pluralize(m.insightsOpen, "estimating insight")} to review`,
      subtitle: "From your closed-out jobs",
      action: "Review",
      href: "/settings/estimating-insights",
      sortValue: 0,
      category: "jobs",
    });
  }
  return out;
}

/**
 * Deposit prompts: approved quotes with no invoice logged yet, either
 * directly (invoice.quote_id) or via the shared project (an invoice created
 * without an explicit quote_id still counts as billing that project).
 * `updated_at` is the best available proxy for "days since approved" —
 * same reasoning/caveat as quoteFollowUpItems' "days since shared".
 */
export function depositItems(quotes: Quote[], invoices: Invoice[], now: Date): NeedsYouItem[] {
  const billed = new Set<string>();
  for (const inv of invoices) {
    if (inv.quote_id) billed.add(`quote:${inv.quote_id}`);
    if (inv.project_id) billed.add(`project:${inv.project_id}`);
  }
  return quotes
    // A standalone one can't be billed until it's a project — that's
    // standaloneApprovedItems' job.
    .filter((q) => q.status === "approved" && q.project_id != null)
    .filter((q) => !billed.has(`quote:${q.id}`) && !(q.project_id && billed.has(`project:${q.project_id}`)))
    // No deposit to ask for ($0 quote or 0%) → nothing to bill.
    .filter((q) => headlineDepositDue(q) > 0)
    .map((quote) => ({
      key: `deposit-${quote.id}`,
      tone: "green" as const,
      title: "Quote approved — needs deposit",
      subtitle: `${quote.project?.name ?? "Standalone quote"} · ${formatCurrency(headlineDepositDue(quote))} (${quote.deposit_percentage}%)`,
      action: "Bill",
      href: `/quotes/${quote.id}`,
      sortValue: daysSince(quote.updated_at, now),
    }));
}

/**
 * Approved standalone quotes (0166) — a dead end until they're a project:
 * top of the list (red, ahead of anything counted in days) until converted.
 * Opens the quote's Create project modal.
 */
export function standaloneApprovedItems(quotes: Quote[], now: Date): NeedsYouItem[] {
  return quotes
    .filter((q) => q.status === "approved" && q.project_id == null)
    .map((quote) => {
      const who = quote.client?.name ?? quote.signed_by ?? "Your client";
      return {
        key: `quote-standalone-${quote.id}`,
        tone: "red" as const,
        title: `${who} approved a standalone quote`,
        subtitle: `${formatCurrency(quoteTotal(quote.quote_sections ?? []))} · Create the project to invoice and schedule it`,
        action: "Create project",
        href: `/quotes/${quote.id}?convert=1`,
        sortValue: 10_000 + daysSince(quote.signed_at ?? quote.updated_at, now),
      };
    });
}

/**
 * Site visits to confirm: a site visit / estimate appointment whose date
 * has passed but was never checked off or cancelled, on a lead still early
 * enough that confirming it moves the stage (see overdueSiteVisit). Links
 * to the opportunity, whose StageBanner asks the same question with
 * "Yes, mark completed" / "Reschedule".
 */
function siteVisitConfirmItems(opportunities: Opportunity[], appointments: Appointment[], now: Date): NeedsYouItem[] {
  const byOpp = new Map(opportunities.map((o) => [o.id, o]));
  return [...overdueSiteVisitsByOpportunity(opportunities, appointments, now)].map(([oppId, visit]) => {
    const opportunity = byOpp.get(oppId)!;
    return {
      key: `site-visit-${visit.id}`,
      tone: "red" as const,
      title: `Confirm site visit: ${opportunity.title}`,
      subtitle: `${siteVisitDateLabel(visit)}${opportunity.client?.name ? ` · ${opportunity.client.name}` : ""}`,
      action: "Confirm",
      href: `/pipeline/${oppId}`,
      sortValue: Math.max(daysSince(visit.date_time, now), 1),
    };
  });
}

/**
 * The full "Needs you" action queue — site visits to confirm, overdue
 * chases, deposit prompts, quote follow-ups, review requests (0122) — combined and sorted most-urgent-first (highest raw day
 * count, regardless of category). Single source of truth for both the
 * Dashboard card (NeedsYou.tsx, capped to 5) and the full list (/needs-you,
 * NeedsYouView.tsx, uncapped) so the two can never disagree on contents or
 * order.
 */
export function buildNeedsYouItems(
  quotes: Quote[],
  invoices: Invoice[],
  now: Date = new Date(),
  siteVisits: { opportunities: Opportunity[]; appointments: Appointment[] } = { opportunities: [], appointments: [] },
  reviews: { requests: ReviewNeedsYouInput[]; settings: ReviewSettingsLike | null } = { requests: [], settings: null },
  extra: NeedsYouItem[] = [],
  more: NeedsYouMore = {},
): NeedsYouItem[] {
  return [
    // Pre-construction (0124) and anything else computed elsewhere.
    ...extra,
    ...reviewNeedsYouItems(reviews.requests, reviews.settings, now),
    ...siteVisitConfirmItems(siteVisits.opportunities, siteVisits.appointments, now),
    ...overdueInvoiceItems(invoices, now),
    ...standaloneApprovedItems(quotes, now),
    ...depositItems(quotes, invoices, now),
    ...quoteFollowUpItems(quotes, now, more.coldSettings),
    ...moreItems(more, now),
  ]
    .map((i) => ({ ...i, category: categoryOf(i) }))
    .sort((a, b) => b.sortValue - a.sortValue);
}
