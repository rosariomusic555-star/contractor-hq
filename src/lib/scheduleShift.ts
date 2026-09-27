/* =============================================================================
 * Rain delay action (0120) — the shift + cascade math. Pure; the preview
 * shows exactly what planDelay() returns and apply_schedule_delay() writes
 * exactly that (after checking nothing moved since).
 *
 * Working days: Mon–Fri. isWorkingDay() is the one place holidays would go.
 *
 *  - Not started (the delayed day is on/before the start, and the job has
 *    no actual start): start AND end move forward N working days.
 *  - In progress (the day falls after the start): start stays, end is
 *    extended N working days.
 *  - Cascade (same crew only, toggle): later jobs of that crew that would
 *    now overlap are shifted, in start order, by the MINIMUM working days
 *    needed to begin after the previous job ends — not blindly by N. A job
 *    that has already started is never moved (warning instead).
 *  - Jobs with no crew are never cascaded; if they overlap a moved job they
 *    are listed as "may conflict". Nothing is ever silently overwritten.
 * ========================================================================== */

import { addDaysISO, isoDate } from "@/lib/weatherRisk";

export type DelayReason = "rain" | "weather_other" | "material" | "client" | "other";
export type DelayMode = "shift" | "extend";

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  rain: "Rain",
  weather_other: "Weather – other",
  material: "Material delay",
  client: "Client request",
  other: "Other",
};

/** Weather delays don't count as the job running over its estimate. */
export const WEATHER_REASONS = new Set<DelayReason>(["rain", "weather_other"]);

export function isWorkingDay(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00`).getDay();
  return dow !== 0 && dow !== 6;
}

/** The n-th working day after `iso` (n ≥ 0; n = 0 returns `iso` itself). */
export function addWorkingDays(iso: string, n: number): string {
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addDaysISO(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

/** Inclusive working-day count; 0 when end < start. */
export function workingDaysBetween(start: string, end: string): number {
  let n = 0;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) if (isWorkingDay(d)) n++;
  return n;
}

export interface DelayJob {
  id: string;
  name: string;
  clientName?: string | null;
  crewId: string | null;
  start: string | null;
  end: string | null;
  /** Already begun (actual start set, or In progress) — never cascaded. */
  started: boolean;
}

export interface Span {
  start: string | null;
  end: string | null;
}

export interface DelayChange {
  projectId: string;
  name: string;
  clientName: string | null;
  role: "primary" | "cascade";
  shiftDays: number;
  from: Span;
  to: Span;
}

export interface DelayWarning {
  projectId: string;
  name: string;
  kind: "no_crew" | "started" | "not_cascaded" | "primary_no_crew";
  message: string;
}

export interface DelayPlan {
  mode: DelayMode;
  changes: DelayChange[];
  warnings: DelayWarning[];
  /** The working days the crew loses on the delayed job — where deliveries /
   * appointments / the "Rain delay" marker are looked up. */
  lostDays: string[];
}

const lastDay = (s: Span) => s.end ?? s.start;
const overlaps = (a: Span, b: Span) =>
  !!a.start && !!b.start && a.start <= (lastDay(b) as string) && b.start <= (lastDay(a) as string);

/** Smallest k ≥ 1 with addWorkingDays(start, k) > after. */
function minShiftAfter(start: string, after: string): number {
  let k = 1;
  while (addWorkingDays(start, k) <= after) k++;
  return k;
}

export function planDelay(opts: {
  primary: DelayJob;
  /** The flagged / chosen work day. */
  delayDate: string;
  days: number;
  cascade: boolean;
  /** Every other scheduled job (any crew) — candidates for cascade / warnings. */
  otherJobs: DelayJob[];
}): DelayPlan {
  const { primary, delayDate, cascade } = opts;
  const n = Math.max(1, Math.floor(opts.days));
  if (!primary.start) return { mode: "shift", changes: [], warnings: [], lostDays: [] };

  // A job that has actually begun is never shifted — even on its start day
  // the start already happened, so the end is extended instead.
  const mode: DelayMode = !primary.started && delayDate <= primary.start ? "shift" : "extend";
  const from: Span = { start: primary.start, end: primary.end };
  const to: Span =
    mode === "shift"
      ? { start: addWorkingDays(primary.start, n), end: primary.end ? addWorkingDays(primary.end, n) : null }
      : { start: primary.start, end: addWorkingDays(primary.end ?? primary.start, n) };

  const lostFrom = delayDate > primary.start ? delayDate : primary.start;
  const firstLost = isWorkingDay(lostFrom) ? lostFrom : addWorkingDays(lostFrom, 1);
  const lostDays = Array.from({ length: n }, (_, i) => addWorkingDays(firstLost, i));

  const changes: DelayChange[] = [
    { projectId: primary.id, name: primary.name, clientName: primary.clientName ?? null, role: "primary", shiftDays: n, from, to },
  ];
  const warnings: DelayWarning[] = [];

  const scheduled = opts.otherJobs.filter((j) => j.id !== primary.id && j.start);

  // Same crew, starting on/after the delayed job — in start order.
  if (primary.crewId) {
    const crewJobs = scheduled
      .filter((j) => j.crewId === primary.crewId && (j.start as string) >= primary.start!)
      .sort((a, b) => (a.start as string).localeCompare(b.start as string) || a.name.localeCompare(b.name));
    let prevEnd = lastDay(to) as string;
    for (const j of crewJobs) {
      const span: Span = { start: j.start, end: j.end };
      if ((j.start as string) > prevEnd) {
        prevEnd = (lastDay(span) as string) > prevEnd ? (lastDay(span) as string) : prevEnd;
        continue;
      }
      if (!cascade) {
        warnings.push({ projectId: j.id, name: j.name, kind: "not_cascaded", message: `${j.name} (same crew) would overlap — not shifted` });
      } else if (j.started) {
        warnings.push({ projectId: j.id, name: j.name, kind: "started", message: `${j.name} has already started — not moved, will overlap` });
      } else {
        const k = minShiftAfter(j.start as string, prevEnd);
        const next: Span = { start: addWorkingDays(j.start as string, k), end: j.end ? addWorkingDays(j.end, k) : null };
        changes.push({ projectId: j.id, name: j.name, clientName: j.clientName ?? null, role: "cascade", shiftDays: k, from: span, to: next });
        prevEnd = lastDay(next) as string;
        continue;
      }
      prevEnd = (lastDay(span) as string) > prevEnd ? (lastDay(span) as string) : prevEnd;
    }
  }

  // Jobs with no crew (or everything, when the delayed job has no crew)
  // that overlap a moved job's new dates: listed, never moved.
  const movedIds = new Set(changes.map((c) => c.projectId));
  for (const j of scheduled) {
    if (movedIds.has(j.id)) continue;
    const span: Span = { start: j.start, end: j.end };
    const hit = changes.some((c) => overlaps(c.to, span) && !overlaps(c.from, span));
    if (!hit) continue;
    if (!primary.crewId) {
      warnings.push({ projectId: j.id, name: j.name, kind: "primary_no_crew", message: `${j.name} may conflict (this job has no crew assigned)` });
    } else if (!j.crewId) {
      warnings.push({ projectId: j.id, name: j.name, kind: "no_crew", message: `${j.name} may conflict (no crew assigned)` });
    }
  }

  return { mode, changes, warnings, lostDays };
}

/** "Thu Oct 1" */
export function delayDayLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`;
}

/** "Start Thu Oct 1 → Fri Oct 2 · End Tue Oct 6 → Wed Oct 7" */
export function changeSummary(c: Pick<DelayChange, "from" | "to">): string {
  const parts: string[] = [];
  if (c.from.start !== c.to.start) parts.push(`Start ${delayDayLabel(c.from.start)} → ${delayDayLabel(c.to.start)}`);
  if (c.from.end !== c.to.end) parts.push(`End ${delayDayLabel(c.from.end)} → ${delayDayLabel(c.to.end)}`);
  return parts.join(" · ") || "No change";
}

/** Working days "lost" to weather on a project (non-undone delays with a
 * weather reason), for the Estimated duration card and closeouts. */
export function delayDays(
  delays: { days: number; reason: DelayReason; undone_at: string | null; project_id: string }[],
  projectId: string,
): { weather: number; other: number } {
  let weather = 0;
  let other = 0;
  for (const d of delays) {
    if (d.undone_at || d.project_id !== projectId) continue;
    if (WEATHER_REASONS.has(d.reason)) weather += d.days;
    else other += d.days;
  }
  return { weather, other };
}

/** The day a manual delay defaults to: the next working day from today if
 * the job is running now, else its start. The sheet lets you pick any day. */
export function defaultDelayDay(start: string, end: string | null, today: string = isoDate(new Date())): string {
  const last = end ?? start;
  if (today < start || today > last) return start;
  const next = isWorkingDay(today) ? today : addWorkingDays(today, 1);
  return next <= last ? next : last;
}
