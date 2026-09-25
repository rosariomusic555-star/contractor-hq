import type { Appointment } from "./api";

/**
 * Appointment date/time helpers. An appointment is one timestamp
 * (appointments.date_time, timestamptz):
 *  - timed (all_day = false): the start time, entered in the contractor's
 *    own (browser) time zone and stored as that exact instant;
 *  - date-only (all_day = true, 0092 — every appointment made before times
 *    came back): local noon of the date, so the date can't shift a day
 *    across time zones. These show no time.
 */

/** "2026-09-24" in the viewer's local time zone. */
export const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "09:30" (24h, local) — the value format of <input type="time">. */
export const localHm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** The appointment's calendar date (local) — what lists bucket and group by. */
export const appointmentDateKey = (a: Pick<Appointment, "date_time">) => localYmd(new Date(a.date_time));

/** "9:30 AM", or null for a date-only appointment (no time to show). */
export function appointmentTimeLabel(a: Pick<Appointment, "date_time" | "all_day">): string | null {
  if (a.all_day) return null;
  return new Date(a.date_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Fri, Sep 25 · 9:30 AM", or just "Fri, Sep 25" when date-only. */
export function appointmentWhenLabel(a: Pick<Appointment, "date_time" | "all_day">): string {
  const date = new Date(a.date_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = appointmentTimeLabel(a);
  return time ? `${date} · ${time}` : date;
}

/** Stored date_time for a date-only appointment: local noon of that date. */
export function allDayDateTime(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** Stored date_time for a timed appointment: that local date + time as one
 * instant ("2026-09-25" + "09:30" in the contractor's zone). */
export function timedDateTime(ymd: string, hm: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0).toISOString();
}

/** The next round half hour after `now` (9:07 → 9:30, 9:30 → 10:00,
 * 23:45 → tomorrow 00:00) — the New appointment modal's default. */
export function nextHalfHour(now: Date = new Date()): { ymd: string; hm: string } {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return { ymd: localYmd(d), hm: localHm(d) };
}

/** Whether the appointment is behind us: a timed one once its start time
 * has passed; a date-only one once its whole date has (from the next
 * morning). */
export function appointmentHasPassed(a: Pick<Appointment, "date_time" | "all_day">, now: Date = new Date()): boolean {
  if (a.all_day) return appointmentDateKey(a) < localYmd(now);
  return new Date(a.date_time).getTime() <= now.getTime();
}

/** Date, then date-only before timed within a day, then time. */
export function compareAppointments(a: Pick<Appointment, "date_time" | "all_day">, b: Pick<Appointment, "date_time" | "all_day">): number {
  return (
    appointmentDateKey(a).localeCompare(appointmentDateKey(b)) ||
    Number(b.all_day) - Number(a.all_day) ||
    new Date(a.date_time).getTime() - new Date(b.date_time).getTime()
  );
}
