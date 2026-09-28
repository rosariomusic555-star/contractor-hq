/**
 * "Upcoming from a date" lists (Tasks, Appointments): everything on or
 * after the chosen start date, grouped by day, soonest first. Dates are
 * local "YYYY-MM-DD" strings. Pure.
 */

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today", "Tomorrow", else "Wed, Oct 1" (+ the year when it isn't this one). */
export function dayHeading(ymd: string, today: string): string {
  if (ymd === today) return "Today";
  if (ymd === addDaysYmd(today, 1)) return "Tomorrow";
  const d = new Date(`${ymd}T00:00:00`);
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export interface DayGroup<T> {
  /** "2026-10-01", or null for items with no date. */
  key: string | null;
  heading: string;
  items: T[];
}

/** Items dated on/after `from`, grouped by day in date order; undated
 * items (`includeUndated`) last under "No date". Order within a day is kept. */
export function groupFromDate<T>(
  items: T[],
  dateOf: (item: T) => string | null,
  from: string,
  today: string,
  { includeUndated = false }: { includeUndated?: boolean } = {},
): DayGroup<T>[] {
  const byDay = new Map<string, T[]>();
  const undated: T[] = [];
  for (const it of items) {
    const d = dateOf(it);
    if (!d) {
      if (includeUndated) undated.push(it);
      continue;
    }
    if (d < from) continue;
    const list = byDay.get(d);
    if (list) list.push(it);
    else byDay.set(d, [it]);
  }
  const groups: DayGroup<T>[] = [...byDay.keys()].sort().map((k) => ({ key: k, heading: dayHeading(k, today), items: byDay.get(k)! }));
  if (undated.length) groups.push({ key: null, heading: "No date", items: undated });
  return groups;
}
