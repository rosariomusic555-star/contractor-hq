import { describe, expect, it } from "vitest";
import {
  allDayDateTime,
  appointmentTimeLabel,
  appointmentWhenLabel,
  compareAppointments,
  localHm,
  localYmd,
  nextHalfHour,
  timedDateTime,
} from "./appointmentTime";

describe("appointment times", () => {
  it("defaults to the next round half hour, never midnight", () => {
    expect(nextHalfHour(new Date(2026, 8, 25, 9, 7))).toEqual({ ymd: "2026-09-25", hm: "09:30" });
    expect(nextHalfHour(new Date(2026, 8, 25, 9, 30))).toEqual({ ymd: "2026-09-25", hm: "10:00" });
    expect(nextHalfHour(new Date(2026, 8, 25, 9, 45, 30))).toEqual({ ymd: "2026-09-25", hm: "10:00" });
    expect(nextHalfHour(new Date(2026, 8, 25, 23, 45))).toEqual({ ymd: "2026-09-26", hm: "00:00" });
  });

  it("stores date + time as one local instant and reads it back", () => {
    const iso = timedDateTime("2026-09-25", "09:30");
    const d = new Date(iso);
    expect(localYmd(d)).toBe("2026-09-25");
    expect(localHm(d)).toBe("09:30");
  });

  it("labels in 12-hour time; date-only shows no time", () => {
    const timed = { date_time: timedDateTime("2026-09-25", "09:30"), all_day: false };
    const dateOnly = { date_time: allDayDateTime("2026-09-25"), all_day: true };
    expect(appointmentTimeLabel(timed)).toBe("9:30 AM");
    expect(appointmentWhenLabel(timed)).toBe("Fri, Sep 25 · 9:30 AM");
    expect(appointmentTimeLabel(dateOnly)).toBeNull();
    expect(appointmentWhenLabel(dateOnly)).toBe("Fri, Sep 25");
  });

  it("sorts by date, date-only first within a day, then time", () => {
    const a = { id: "2pm", date_time: timedDateTime("2026-09-25", "14:00"), all_day: false };
    const b = { id: "9am", date_time: timedDateTime("2026-09-25", "09:00"), all_day: false };
    const c = { id: "dateonly", date_time: allDayDateTime("2026-09-25"), all_day: true };
    const d = { id: "tomorrow", date_time: timedDateTime("2026-09-26", "08:00"), all_day: false };
    expect([d, a, c, b].sort(compareAppointments).map((x) => x.id)).toEqual(["dateonly", "9am", "2pm", "tomorrow"]);
  });
});
