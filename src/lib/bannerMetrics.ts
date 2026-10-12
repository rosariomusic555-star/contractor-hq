/**
 * The math behind list pages' banners (ListBanner): pure functions over plain
 * numbers and dates, so each page's banner hook only maps its rows onto them.
 * Dates are local calendar dates ("YYYY-MM-DD" or ISO timestamps).
 */

const DAY = 86_400_000;

/** Local midnight of a date / ISO string. */
export function dayStart(d: Date | string): Date {
  const x = typeof d === "string" ? parseLocal(d) : new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** "2026-10-12" parses as a local date (not UTC); timestamps as-is. */
export function parseLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
}

/** Whole calendar days from `a` to `b` (b − a). */
export function daysBetween(a: Date | string, b: Date | string): number {
  return Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DAY);
}

/** Within the `days` days ending today (inclusive of today). */
export function inLastDays(d: string | null | undefined, days: number, now: Date): boolean {
  if (!d) return false;
  const n = daysBetween(d, now);
  return n >= 0 && n < days;
}

/** Today … today + days − 1. */
export function inNextDays(d: string | null | undefined, days: number, now: Date): boolean {
  if (!d) return false;
  const n = daysBetween(now, d);
  return n >= 0 && n < days;
}

/** Same calendar month as `now` (offset −1 = last month). */
export function inMonth(d: string | null | undefined, now: Date, offset = 0): boolean {
  if (!d) return false;
  const x = parseLocal(d);
  const ref = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return x.getFullYear() === ref.getFullYear() && x.getMonth() === ref.getMonth();
}

/** Monday-start week containing `now` (offset −1 = last week). */
export function inWeek(d: string | null | undefined, now: Date, offset = 0): boolean {
  if (!d) return false;
  const start = dayStart(now);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const n = daysBetween(start, d);
  return n >= 0 && n < 7;
}

/** Year to date (offset −1 = same span last year). */
export function inYearToDate(d: string | null | undefined, now: Date, offset = 0): boolean {
  if (!d) return false;
  const x = parseLocal(d);
  const year = now.getFullYear() + offset;
  const end = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59);
  return x.getFullYear() === year && x <= end;
}

/**
 * Sums per calendar month for the last `months` months (oldest first,
 * ending with the current month) — a sparkline's points.
 */
export function monthlySeries<T>(rows: T[], date: (r: T) => string | null | undefined, value: (r: T) => number, now: Date, months = 6): number[] {
  const out = new Array(months).fill(0);
  for (const r of rows) {
    const d = date(r);
    if (!d) continue;
    const x = parseLocal(d);
    const back = (now.getFullYear() - x.getFullYear()) * 12 + (now.getMonth() - x.getMonth());
    if (back >= 0 && back < months) out[months - 1 - back] += value(r);
  }
  return out;
}

/** Share won of everything decided (won + lost); null when nothing decided. */
export function winRate(won: number, lost: number): number | null {
  const decided = won + lost;
  return decided > 0 ? won / decided : null;
}

/** Share of clients with 2+ jobs, among clients with at least one; null when none. */
export function repeatRate(jobsPerClient: number[]): number | null {
  const withJobs = jobsPerClient.filter((n) => n > 0);
  if (withJobs.length === 0) return null;
  return withJobs.filter((n) => n >= 2).length / withJobs.length;
}

export interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d60plus: number;
}

/**
 * Open balances by days past due: not yet due (or no due date) / 1–30 /
 * 31–60 / 61+. `balance` ≤ 0 rows are skipped.
 */
export function agingBuckets<T>(rows: T[], dueDate: (r: T) => string | null | undefined, balance: (r: T) => number, now: Date): AgingBuckets {
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
  for (const r of rows) {
    const amt = balance(r);
    if (!(amt > 0)) continue;
    const due = dueDate(r);
    const late = due ? daysBetween(due, now) : 0;
    if (late <= 0) b.current += amt;
    else if (late <= 30) b.d1_30 += amt;
    else if (late <= 60) b.d31_60 += amt;
    else b.d60plus += amt;
  }
  return b;
}

/** Average whole days from sent to paid over the pairs given; null when none. */
export function avgDaysToPay(pairs: { sent: string; paid: string }[]): number | null {
  const ds = pairs.map((p) => daysBetween(p.sent, p.paid)).filter((n) => n >= 0);
  if (ds.length === 0) return null;
  return Math.round(ds.reduce((s, n) => s + n, 0) / ds.length);
}

/** (current − previous) / previous; null when there's no previous to compare. */
export function change(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return (current - previous) / previous;
}

/** "+12% vs last month", "−5% vs …", "same as …"; null when no comparison. */
export function changeLabel(current: number, previous: number, vs: string): string | null {
  const c = change(current, previous);
  if (c == null) return null;
  if (Math.abs(c) < 0.005) return `same as ${vs}`;
  return `${c > 0 ? "+" : "−"}${Math.round(Math.abs(c) * 100)}% vs ${vs}`;
}

/** "$42.1k", "$950", "$1.2M" — compact money for insight lines. */
export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

/** 0.273 → "27%". */
export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** "1 quote" / "3 quotes" — word only after the count. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
