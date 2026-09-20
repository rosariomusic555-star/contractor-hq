import type { BacklogJob } from "./backlog";

/** Drag payload MIME for dragging a job (Unscheduled rail, or an existing
 * single-job day cell) onto a calendar day — value is just the project id. */
export const JOB_DRAG_MIME = "application/x-backlog-job";

/** Up to this many status dots render per day cell before collapsing to
 * a "+" indicator (Year view's mini months — see YearGrid/MiniMonth). */
export const MAX_VISIBLE_DOTS = 3;

function toLocalDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** A job's effective [start, end] — an end-less job is a single-day span. */
export function jobRange(job: BacklogJob): { start: Date; end: Date } | null {
  if (!job.startDate) return null;
  const start = toLocalDate(job.startDate);
  const end = job.endDate ? toLocalDate(job.endDate) : start;
  return end < start ? { start, end: start } : { start, end };
}

export function jobOverlapsRange(job: BacklogJob, rangeStart: Date, rangeEnd: Date): boolean {
  const r = jobRange(job);
  if (!r) return false;
  return r.start <= rangeEnd && r.end >= rangeStart;
}

/** The always-6-week (42 day), Sun-Sat grid a real month calendar needs so
 * every mini month renders the same height in the year grid — leading/
 * trailing days from adjacent months are included and flagged via
 * `inMonth`. */
export interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
}

export function monthGridDays(year: number, month: number, today: Date = new Date()): CalendarDay[] {
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    days.push({ date, key: dateKey(date), inMonth: date.getMonth() === month, isToday: sameDay(date, today) });
  }
  return days;
}

/** Every job covering a given date — drives a mini month day cell's dots/
 * tint, the day side panel's job list, and the hover tooltip. */
export function jobsOnDate(jobs: BacklogJob[], date: Date): BacklogJob[] {
  return jobs.filter((j) => jobOverlapsRange(j, date, date));
}

/** Plain day-1-through-last-day list for a month, no leading/trailing days
 * from neighboring months — the Dashboard's square thumbnails (unlike
 * monthGridDays' always-42-day grid) don't show adjacent months at all, so
 * there's nothing to pad against. */
export function daysInMonth(year: number, month: number): Date[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
}
