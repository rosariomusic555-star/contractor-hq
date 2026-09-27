/* =============================================================================
 * Maintenance reminders (0127) — the one place the due-date math lives.
 *
 * Next due = the base date (completion, or the last time it was done) +
 * the interval; with a "remind in <month>", it snaps to that month in the
 * season nearest the anniversary (so a 2-year reseal from a Sept install
 * lands in April of year 2, not September). "As needed" items never come
 * due — they're care info only.
 * ========================================================================== */

import { buildTypeForCategoryName } from "@/lib/measurements";

export interface MaintenanceTemplateLike {
  id: string;
  build_type: string;
  label: string;
  description: string | null;
  interval_months: number | null;
  interval_months_max: number | null;
  as_needed: boolean;
  remind_month: number | null;
  active: boolean;
}

export interface MaintenanceItemLike {
  id: string;
  project_id: string;
  feature_id: string | null;
  label: string;
  interval_months: number | null;
  as_needed: boolean;
  remind_month: number | null;
  next_due: string | null;
  snoozed_until: string | null;
  status: "active" | "stopped";
  last_done_on: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function addMonthsISO(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(ny, nm, 0).getDate();
  return iso(ny, nm, Math.min(d, last));
}

/** Next due date from a base date, snapped to the reminder month if set. */
export function nextDueDate(base: string, intervalMonths: number | null, remindMonth: number | null, asNeeded = false): string | null {
  if (asNeeded || !intervalMonths) return null;
  const anniversary = addMonthsISO(base, intervalMonths);
  if (!remindMonth) return anniversary;
  const ay = Number(anniversary.slice(0, 4));
  const candidates = [ay - 1, ay, ay + 1].map((y) => iso(y, remindMonth, 1));
  const dist = (c: string) => Math.abs(Date.parse(`${c}T00:00:00`) - Date.parse(`${anniversary}T00:00:00`));
  // Nearest season to the anniversary, but never before the base date.
  return candidates.filter((c) => c > base.slice(0, 10)).sort((a, b) => dist(a) - dist(b))[0] ?? anniversary;
}

/** "Every 2–3 years", "Every year", "As needed". */
export function intervalLabel(t: Pick<MaintenanceTemplateLike, "interval_months" | "interval_months_max" | "as_needed">): string {
  if (t.as_needed || !t.interval_months) return "As needed";
  const yr = (m: number) => (m % 12 === 0 ? `${m / 12}` : `${Math.round((m / 12) * 10) / 10}`);
  if (t.interval_months_max && t.interval_months_max > t.interval_months) {
    return t.interval_months % 12 === 0 && t.interval_months_max % 12 === 0
      ? `Every ${yr(t.interval_months)}–${yr(t.interval_months_max)} years`
      : `Every ${t.interval_months}–${t.interval_months_max} months`;
  }
  if (t.interval_months === 12) return "Every year";
  return t.interval_months % 12 === 0 ? `Every ${yr(t.interval_months)} years` : `Every ${t.interval_months} months`;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthYear(isoDate: string | null): string {
  if (!isoDate) return "As needed";
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export interface ProposedItem {
  key: string;
  feature_id: string | null;
  feature_label: string;
  template_id: string;
  label: string;
  description: string | null;
  interval_months: number | null;
  as_needed: boolean;
  remind_month: number | null;
  next_due: string | null;
}

/** The completion step's prefill: every active template for each feature's
 * build type, with its first due date from the completion date. */
export function proposeItems(
  features: { id: string; label: string; category: string | null }[],
  templates: MaintenanceTemplateLike[],
  completedOn: string,
): ProposedItem[] {
  const out: ProposedItem[] = [];
  for (const f of features) {
    const bt = f.category ? buildTypeForCategoryName(f.category)?.id : null;
    if (!bt) continue;
    for (const t of templates.filter((x) => x.active && x.build_type === bt)) {
      out.push({
        key: `${f.id}:${t.id}`,
        feature_id: f.id,
        feature_label: f.label,
        template_id: t.id,
        label: t.label,
        description: t.description,
        interval_months: t.interval_months,
        as_needed: t.as_needed,
        remind_month: t.remind_month,
        next_due: nextDueDate(completedOn, t.interval_months, t.remind_month, t.as_needed),
      });
    }
  }
  return out;
}

/** Warranty end per feature from the completion date. */
export function warrantyEnd(completedOn: string, years: number | null | undefined): string | null {
  return years && years > 0 ? addMonthsISO(completedOn, Math.round(years * 12)) : null;
}

/** An item that was just done (or whose maintenance job completed): the next date. */
export function rescheduleAfterDone(item: Pick<MaintenanceItemLike, "interval_months" | "remind_month" | "as_needed">, doneOn: string): string | null {
  return nextDueDate(doneOn, item.interval_months, item.remind_month, item.as_needed);
}

const DAY = 86_400_000;

/** Needs you: "Greg Gray: paver patio reseal due in April (installed Sep 2026)". */
export function maintenanceNeedsYou(
  items: (MaintenanceItemLike & { projectName: string; clientName: string | null; optedOut: boolean; completedAt: string | null; hasOpportunity: boolean })[],
  leadDays: number,
  today: string,
) {
  const out: { key: string; tone: "grey" | "red"; title: string; subtitle: string; action: string; href: string; sortValue: number }[] = [];
  for (const i of items) {
    if (i.status !== "active" || !i.next_due || i.optedOut || i.hasOpportunity) continue;
    if (i.snoozed_until && i.snoozed_until > today) continue;
    const days = Math.round((Date.parse(`${i.next_due}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / DAY);
    if (days > leadDays) continue;
    const installed = i.completedAt ? ` (installed ${monthYear(i.completedAt.slice(0, 10)).replace(/^(\w{3})\w*/, "$1")})` : "";
    out.push({
      key: `maint-${i.id}`,
      tone: days < 0 ? "red" : "grey",
      title: `${i.clientName ?? i.projectName}: ${i.label.toLowerCase()} ${days < 0 ? "overdue since" : "due in"} ${monthYear(i.next_due).split(" ")[0]}`,
      subtitle: `${i.projectName}${installed}`,
      action: "Reach out",
      href: `/projects/${i.project_id}?maintenance=${i.id}`,
      sortValue: Math.max(1, leadDays - days),
    });
  }
  return out;
}

/** Dashboard "Maintenance due": this month / next month. */
export function dueBuckets<T extends Pick<MaintenanceItemLike, "next_due" | "status">>(items: T[], today: string): { thisMonth: T[]; nextMonth: T[]; overdue: T[] } {
  const ym = today.slice(0, 7);
  const next = addMonthsISO(`${ym}-01`, 1).slice(0, 7);
  const active = items.filter((i) => i.status === "active" && i.next_due);
  return {
    overdue: active.filter((i) => (i.next_due as string) < today && (i.next_due as string).slice(0, 7) < ym),
    thisMonth: active.filter((i) => (i.next_due as string).slice(0, 7) === ym),
    nextMonth: active.filter((i) => (i.next_due as string).slice(0, 7) === next),
  };
}

/** The reach-out text. */
export function maintenanceMessage(opts: { clientName: string | null; companyName: string | null; featureLabel: string | null; itemLabel: string; installedOn: string | null; today: string }): string {
  const first = (opts.clientName ?? "").trim().split(/\s+/)[0] || "there";
  const years = opts.installedOn ? Math.max(1, Math.round((Date.parse(opts.today) - Date.parse(opts.installedOn)) / (365.25 * DAY))) : null;
  const what = (opts.featureLabel ?? "project").toLowerCase();
  const since = years ? `it's been about ${years} year${years === 1 ? "" : "s"} since we installed your ${what}` : `it's been a while since we worked on your ${what}`;
  return `Hi ${first}, it's ${opts.companyName?.trim() || "your contractor"}. ${since.charAt(0).toUpperCase() + since.slice(1)}. It's a great time for a ${opts.itemLabel.toLowerCase()} to keep it looking new. Want us to get you on the schedule?`;
}

export const MAINTENANCE_LEAD_SOURCE = "Maintenance / Past client";

/** The completion step: a finished job (≥ 1 day ago, so it doesn't land on
 * top of the review request) with no reminders yet, not dismissed, and
 * recent — older jobs go through Settings' one-time bulk setup instead. */
export function needsMaintenanceSetup(
  p: { status: string; completed_at?: string | null; maintenance_dismissed?: boolean; client_id: string | null },
  itemCount: number,
  today: string,
  withinDays = 60,
): boolean {
  if (p.status !== "complete" || !p.completed_at || p.maintenance_dismissed || !p.client_id || itemCount > 0) return false;
  const days = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${p.completed_at.slice(0, 10)}T00:00:00`)) / DAY);
  return days >= 1 && days <= withinDays;
}

/** Reporting: due this year, reached out, converted to jobs, revenue. */
export function maintenanceStats(
  items: (Pick<MaintenanceItemLike, "next_due" | "status"> & { events?: { kind: string; created_at: string }[] })[],
  opportunities: { id: string; stage: string; source_project_id?: string | null; project_id: string | null }[],
  revenueForProject: (projectId: string) => number,
  today: string,
) {
  const year = today.slice(0, 4);
  const inYear = (d: string | null | undefined) => !!d && d.slice(0, 4) === year;
  const maint = opportunities.filter((o) => o.source_project_id);
  const won = maint.filter((o) => o.stage === "won");
  return {
    due: items.filter((i) => i.status === "active" && inYear(i.next_due)).length,
    reachedOut: items.filter((i) => (i.events ?? []).some((e) => e.kind === "reached_out" && inYear(e.created_at))).length,
    opportunities: maint.length,
    converted: won.length,
    revenue: won.reduce((s, o) => s + (o.project_id ? revenueForProject(o.project_id) : 0), 0),
  };
}

/** Bulk setup for past jobs: a first due date already behind us rolls
 * forward by the interval until it's today or later. */
export function rollForward(next: string | null, item: Pick<MaintenanceItemLike, "interval_months" | "remind_month" | "as_needed">, today: string): string | null {
  let d = next;
  for (let guard = 0; d && d < today && guard < 50; guard++) d = rescheduleAfterDone(item, d);
  return d;
}
