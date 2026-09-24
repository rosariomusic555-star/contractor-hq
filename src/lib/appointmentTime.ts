import type { Appointment } from "./api";

/** "2026-09-24" in the viewer's local time zone. */
export const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The appointment's calendar date (local) — what lists bucket and group by. */
export const appointmentDateKey = (a: Pick<Appointment, "date_time">) => localYmd(new Date(a.date_time));

/** "All day" for date-only appointments (0092), else "9:00 AM". */
export function appointmentTimeLabel(a: Pick<Appointment, "date_time" | "all_day">): string {
  if (a.all_day) return "All day";
  return new Date(a.date_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Stored date_time for a date-only appointment: local noon of that date, so
 * the date never shifts a day across time zones. */
export function allDayDateTime(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
