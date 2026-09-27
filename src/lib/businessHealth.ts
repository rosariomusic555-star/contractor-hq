/* =============================================================================
 * Business health (0132) — backlog / capacity, cash forecast, receivables,
 * trends. Pure functions; the page feeds them live data and reuses the
 * app's own money helpers (contract value, invoice balance, collected,
 * margins, overhead) so every number matches the other pages.
 *
 * Dates are local "YYYY-MM-DD" strings throughout.
 * ========================================================================== */

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
const dow = (s: string) => parse(s).getDay();

export const MON_FRI = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

export function isWorkingDay(date: string, workDays: number[], holidays: Set<string>): boolean {
  return workDays.includes(dow(date)) && !holidays.has(date);
}

/** Working days in [from, to], inclusive. */
export function workingDaysBetween(from: string, to: string, workDays: number[], holidays: Set<string>): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, workDays, holidays)) n++;
  return n;
}

/** The date `days` working days after `from` (exclusive), i.e. the last day of a job of that length starting the next working day. */
export function addWorkingDays(from: string, days: number, workDays: number[], holidays: Set<string>): string {
  let d = from;
  let left = Math.max(0, Math.ceil(days));
  if (!workDays.length) return from;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, workDays, holidays)) left--;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Backlog + capacity
// ---------------------------------------------------------------------------

export interface HCrew {
  id: string;
  name: string;
  work_days?: number[] | null;
}

export interface HProject {
  id: string;
  name: string;
  status: string;
  crew_id: string | null;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  client_name?: string | null;
}

export const isBookedStatus = (s: string) => s === "scheduled" || s === "in_progress";

export interface CrewCapacity {
  crew: HCrew;
  bookedThrough: string | null;
  windows: { weeks: number; booked: number; available: number; utilization: number | null }[];
  /** 12 weeks from this week's Monday: booked vs available working days. */
  strip: { weekStart: string; booked: number; available: number }[];
  openNext3Weeks: number;
  jobs: HProject[];
}

/** The Monday on or before a date. */
export const weekStart = (s: string) => addDays(s, -((dow(s) + 6) % 7));

/**
 * Per crew: booked-through (the last scheduled working day), booked vs
 * available working days over the next 4 / 8 / 12 weeks, a 12-week strip,
 * and open days in the next 3 weeks. A day counts as booked once, however
 * many jobs overlap on it.
 */
export function crewCapacity(crews: HCrew[], projects: HProject[], today: string, holidays: Set<string>): CrewCapacity[] {
  return crews.map((crew) => {
    const wd = crew.work_days?.length ? crew.work_days : MON_FRI;
    const jobs = projects.filter((p) => p.crew_id === crew.id && isBookedStatus(p.status) && p.scheduled_start_date);
    const booked = new Set<string>();
    let bookedThrough: string | null = null;
    for (const p of jobs) {
      const end = p.scheduled_end_date ?? p.scheduled_start_date!;
      if (end < today) continue;
      for (let d = p.scheduled_start_date! < today ? today : p.scheduled_start_date!; d <= end; d = addDays(d, 1)) {
        if (isWorkingDay(d, wd, holidays)) {
          booked.add(d);
          if (!bookedThrough || d > bookedThrough) bookedThrough = d;
        }
      }
    }
    const countBooked = (from: string, to: string) => [...booked].filter((d) => d >= from && d <= to).length;
    const windows = [4, 8, 12].map((weeks) => {
      const end = addDays(today, weeks * 7 - 1);
      const available = workingDaysBetween(today, end, wd, holidays);
      const b = countBooked(today, end);
      return { weeks, booked: b, available, utilization: available ? b / available : null };
    });
    const strip = Array.from({ length: 12 }, (_, i) => {
      const ws = addDays(weekStart(today), i * 7);
      const from = ws < today ? today : ws;
      const to = addDays(ws, 6);
      return { weekStart: ws, booked: countBooked(from, to), available: from > to ? 0 : workingDaysBetween(from, to, wd, holidays) };
    });
    const end3 = addDays(today, 20);
    return { crew, bookedThrough, windows, strip, openNext3Weeks: workingDaysBetween(today, end3, wd, holidays) - countBooked(today, end3), jobs };
  });
}

export interface UnscheduledJob {
  project: HProject;
  crewDays: number | null;
  contract: number;
  /** The crew it'd go to (its own, else the least-booked), and when that crew would finish it. */
  crewId: string | null;
  crewName: string | null;
  assumedCrew: boolean;
  wouldFinish: string | null;
}

/**
 * Signed but not scheduled: planned crew-days each, and the date each
 * would push its crew to if booked after the crew's current bookings (jobs
 * without a crew go to whichever crew frees up first). Queued in the order
 * given, so two jobs for the same crew stack.
 */
export function unscheduledBacklog(
  jobs: { project: HProject; crewDays: number | null; contract: number }[],
  capacity: CrewCapacity[],
  today: string,
  holidays: Set<string>,
): UnscheduledJob[] {
  const cursor = new Map(capacity.map((c) => [c.crew.id, c.bookedThrough && c.bookedThrough > today ? c.bookedThrough : addDays(today, -1)]));
  return jobs.map((j) => {
    let crewId = j.project.crew_id;
    let assumed = false;
    if (!crewId || !cursor.has(crewId)) {
      crewId = [...cursor.entries()].sort((a, b) => a[1].localeCompare(b[1]))[0]?.[0] ?? null;
      assumed = true;
    }
    const cap = capacity.find((c) => c.crew.id === crewId);
    let wouldFinish: string | null = null;
    if (crewId && cap && j.crewDays && j.crewDays > 0) {
      wouldFinish = addWorkingDays(cursor.get(crewId)!, j.crewDays, cap.crew.work_days?.length ? cap.crew.work_days : MON_FRI, holidays);
      cursor.set(crewId, wouldFinish);
    }
    return { ...j, crewId, crewName: cap?.crew.name ?? null, assumedCrew: assumed, wouldFinish };
  });
}

/** Planned crew-days for a job: the owner's estimate, else Cost plan man-hours ÷ a crew-day's hours. */
export function plannedCrewDays(estimatedDays: number | null | undefined, plannedManHours: number, crewDayHours: number): number | null {
  if (estimatedDays && estimatedDays > 0) return estimatedDays;
  if (plannedManHours > 0 && crewDayHours > 0) return Math.round((plannedManHours / crewDayHours) * 10) / 10;
  return null;
}

// ---------------------------------------------------------------------------
// Cash forecast (30 / 60 / 90)
// ---------------------------------------------------------------------------

export interface FInvoice {
  id: string;
  status: string;
  amount: number;
  balance: number;
  due_date: string | null;
  created_at: string;
  project_id: string | null;
}

export interface FJob {
  id: string;
  name: string;
  status: string;
  start: string | null;
  end: string | null;
  contract: number;
  /** Everything invoiced so far, drafts included. */
  invoiced: number;
  depositPct: number;
}

export type CashLine = { kind: "invoice" | "projected_deposit" | "projected_final" | "draft"; label: string; amount: number; date: string; refId: string };

export interface CashPeriod {
  days: 30 | 60 | 90;
  from: string;
  to: string;
  invoices: number;
  projected: number;
  credits: number;
  inTotal: number;
  payroll: number;
  overhead: number;
  outTotal: number;
  net: number;
  lines: CashLine[];
}

/**
 * Money expected in: open invoice balances by due date (overdue kept
 * separate); draft invoices as due `dueDays` from today; and — clearly
 * "projected" — the rest of each scheduled job's contract: the deposit
 * (deposit % less what's been invoiced) at its start, the remainder at its
 * scheduled end, each + `dueDays`. Unapplied credits come off the first
 * period. Money out: recent weekly payroll and monthly overhead, pro rata.
 */
export function cashForecast(input: {
  today: string;
  invoices: FInvoice[];
  jobs: FJob[];
  dueDays: number;
  credits: number;
  weeklyPayroll: number;
  monthlyOverhead: number;
}): { overdue: { amount: number; invoices: FInvoice[] }; periods: CashPeriod[] } {
  const { today, dueDays } = input;
  const lines: CashLine[] = [];
  const overdue: FInvoice[] = [];
  for (const inv of input.invoices) {
    if (inv.balance <= 0 || inv.status === "paid") continue;
    if (inv.status === "draft") {
      lines.push({ kind: "draft", label: "Draft invoice", amount: inv.balance, date: addDays(today, dueDays), refId: inv.id });
    } else if (inv.due_date && inv.due_date < today) {
      overdue.push(inv);
    } else {
      lines.push({ kind: "invoice", label: "Invoice", amount: inv.balance, date: inv.due_date ?? addDays(inv.created_at.slice(0, 10), dueDays), refId: inv.id });
    }
  }
  for (const j of input.jobs) {
    if (!isBookedStatus(j.status) || !j.start) continue;
    const remaining = j.contract - j.invoiced;
    if (remaining <= 0.005) continue;
    const deposit = Math.max(0, Math.min(remaining, (j.contract * j.depositPct) / 100 - j.invoiced));
    const startDate = j.start < today ? today : j.start;
    const endDate = (j.end ?? j.start) < today ? today : (j.end ?? j.start);
    if (deposit > 0.005) lines.push({ kind: "projected_deposit", label: `${j.name} — deposit`, amount: deposit, date: addDays(startDate, dueDays), refId: j.id });
    const final = remaining - deposit;
    if (final > 0.005) lines.push({ kind: "projected_final", label: `${j.name} — final`, amount: final, date: addDays(endDate, dueDays), refId: j.id });
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const periods = ([30, 60, 90] as const).map((days, i) => {
    const from = addDays(today, i * 30);
    const to = addDays(today, days - 1);
    const inPeriod = lines.filter((l) => (i === 0 ? l.date <= to : l.date >= from && l.date <= to));
    const invoices = r2(inPeriod.filter((l) => l.kind === "invoice").reduce((s, l) => s + l.amount, 0));
    const projected = r2(inPeriod.filter((l) => l.kind !== "invoice").reduce((s, l) => s + l.amount, 0));
    const credits = i === 0 ? r2(Math.min(input.credits, invoices + projected)) : 0;
    const inTotal = r2(invoices + projected - credits);
    const payroll = r2((input.weeklyPayroll * 30) / 7);
    const overhead = r2(input.monthlyOverhead);
    return { days, from, to, invoices, projected, credits, inTotal, payroll, overhead, outTotal: r2(payroll + overhead), net: r2(inTotal - payroll - overhead), lines: inPeriod };
  });
  return { overdue: { amount: r2(overdue.reduce((s, i) => s + i.balance, 0)), invoices: overdue }, periods };
}

// ---------------------------------------------------------------------------
// Receivables
// ---------------------------------------------------------------------------

export const AGING_BUCKETS = [
  { key: "current", label: "Current", min: -Infinity, max: 0 },
  { key: "d1_30", label: "1–30 days", min: 1, max: 30 },
  { key: "d31_60", label: "31–60 days", min: 31, max: 60 },
  { key: "d61_90", label: "61–90 days", min: 61, max: 90 },
  { key: "d90", label: "90+ days", min: 91, max: Infinity },
] as const;

export function agingDetail<T extends { status: string; balance: number; due_date: string | null }>(invoices: T[], today: string) {
  return AGING_BUCKETS.map((b) => {
    const list = invoices
      .filter((i) => (i.status === "sent" || i.status === "overdue") && i.balance > 0)
      .map((i) => ({ inv: i, late: i.due_date ? daysBetween(i.due_date, today) : 0 }))
      .filter((x) => x.late >= b.min && x.late <= b.max)
      .sort((a, b2) => b2.late - a.late);
    return { ...b, amount: Math.round(list.reduce((s, x) => s + x.inv.balance, 0) * 100) / 100, items: list };
  });
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export interface MonthCompare {
  thisMonth: number;
  lastMonth: number;
  sameMonthLastYear: number;
  ytd: number;
  ytdLastYear: number;
}

/** Sums dated amounts into this month / last month / same month LY / YTD / YTD LY (same day of year). */
export function monthCompare(items: { date: string; amount: number }[], today: string): MonthCompare {
  const ym = today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const lastYm = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const lyYm = `${y - 1}-${pad(m)}`;
  const lyToday = `${y - 1}${today.slice(4)}`;
  const sum = (f: (d: string) => boolean) => Math.round(items.filter((i) => f(i.date.slice(0, 10))).reduce((s, i) => s + i.amount, 0) * 100) / 100;
  return {
    thisMonth: sum((d) => d.startsWith(ym) && d <= today),
    lastMonth: sum((d) => d.startsWith(lastYm)),
    sameMonthLastYear: sum((d) => d.startsWith(lyYm)),
    ytd: sum((d) => d.startsWith(`${y}-`) && d <= today),
    ytdLastYear: sum((d) => d.startsWith(`${y - 1}-`) && d <= lyToday),
  };
}

export const pctChange = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** Win rate + average job size over a window: decided = won + lost with a decision date in it. */
export function winStats(decisions: { outcome: "won" | "lost"; date: string; value: number }[], from: string, to: string) {
  const inW = decisions.filter((d) => d.date >= from && d.date <= to);
  const won = inW.filter((d) => d.outcome === "won");
  return {
    decided: inW.length,
    won: won.length,
    winRate: inW.length ? won.length / inW.length : null,
    avgJob: won.length ? Math.round(won.reduce((s, d) => s + d.value, 0) / won.length) : null,
  };
}

export const DEFAULT_STAGE_PROBABILITIES: Record<string, number> = {
  new_lead: 10,
  contacted: 15,
  site_visit_scheduled: 25,
  site_visit_done: 30,
  proposal_sent: 40,
  revisions: 60,
};
