import { describe, expect, it } from "vitest";
import { canSubmit, dayTotals, genericPayrollCsv, gustoPayrollCsv, payrollRow, periodDays, periodTotals, previewHours, timesheetFlags, type TimeEntryLike } from "./timesheets";

const at = (d: string, t: string) => new Date(`${d}T${t}`).toISOString();
const entry = (id: string, d: string, start: string | null, end: string | null, extra: Partial<TimeEntryLike> = {}): TimeEntryLike => ({
  id,
  project_id: "p1",
  project: "Greg Patio",
  entry_date: d,
  start_at: start ? at(d, start) : null,
  end_at: end ? at(d, end) : null,
  break_minutes: 0,
  hours: start && end ? (Date.parse(at(d, end)) - Date.parse(at(d, start))) / 3.6e6 : 0,
  reg_hours: null,
  ot_hours: null,
  note: null,
  ...extra,
});

describe("totals", () => {
  it("adds up days and the period from the stored hours", () => {
    const es = [entry("a", "2026-09-21", "07:00", "12:00"), entry("b", "2026-09-21", "12:30", "16:30"), { ...entry("c", "2026-09-25", "07:00", "16:00"), reg_hours: 4, ot_hours: 5 }];
    expect(dayTotals(es).get("2026-09-21")).toEqual({ hours: 9, ot: 0 });
    expect(periodTotals(es)).toEqual({ total: 18, reg: 13, ot: 5 });
    expect(periodDays("2026-09-21", "2026-09-27")).toHaveLength(7);
  });
  it("previews hours minus the break", () => {
    expect(previewHours(at("2026-09-21", "07:00"), at("2026-09-21", "16:30"), 30)).toBe(9);
    expect(previewHours(at("2026-09-21", "07:00"), null, 0)).toBeNull();
  });
});

describe("flags", () => {
  const opts = { today: "2026-09-27", longDayHours: 12, rainDays: [{ project_id: "p1", date: "2026-09-23" }] };
  it("blocks a running timer and a missing clock-out", () => {
    const f = timesheetFlags([entry("run", "2026-09-27", "07:00", null), entry("old", "2026-09-22", "07:00", null)], opts);
    expect(f.map((x) => [x.kind, x.blocking])).toEqual([
      ["missing_out", true],
      ["running", true],
    ]);
    expect(canSubmit(f, {}).ok).toBe(false);
  });
  it("flags overlaps, long days and rain days — explainable", () => {
    const f = timesheetFlags(
      [entry("a", "2026-09-21", "06:00", "14:00"), entry("b", "2026-09-21", "13:00", "20:00"), entry("r", "2026-09-23", "07:00", "09:00")],
      opts,
    );
    expect(f.map((x) => x.kind).sort()).toEqual(["long_day", "overlap", "rain"]);
    expect(f.every((x) => !x.blocking)).toBe(true);
    expect(canSubmit(f, {}).ok).toBe(false);
    expect(canSubmit(f, Object.fromEntries(f.map((x) => [x.key, "ok"]))).ok).toBe(true);
  });
  it("back-to-back entries don't overlap", () => {
    expect(timesheetFlags([entry("a", "2026-09-21", "07:00", "12:00"), entry("b", "2026-09-21", "12:00", "15:00")], opts)).toEqual([]);
  });
});

describe("payroll", () => {
  it("estimates gross from the stored split and the rate in effect", () => {
    const r = payrollRow(
      "e1",
      "Jane Rivera",
      [
        { entry_date: "2026-09-21", hours: 9, reg_hours: 9, ot_hours: 0, hourly_rate: 30 },
        { entry_date: "2026-09-25", hours: 9, reg_hours: 4, ot_hours: 5, hourly_rate: 35 },
      ],
      1.5,
    );
    expect(r).toMatchObject({ reg: 13, ot: 5, rates: [30, 35], gross: 9 * 30 + 4 * 35 + 5 * 35 * 1.5, missingRate: false });
  });
  it("flags hours with no pay rate instead of counting them as $0", () => {
    expect(payrollRow("e1", "Jane", [{ entry_date: "2026-09-21", hours: 8, reg_hours: 8, ot_hours: 0, hourly_rate: null }], 1.5)).toMatchObject({ gross: 0, missingRate: true });
  });
  it("exports CSVs", () => {
    const rows = [payrollRow("e1", "Jane Rivera", [{ entry_date: "2026-09-21", hours: 42, reg_hours: 40, ot_hours: 2, hourly_rate: 30 }], 1.5)];
    expect(genericPayrollCsv(rows, { start: "2026-09-21", end: "2026-09-27" })).toBe(
      "Employee,Period start,Period end,Regular hours,Overtime hours,Hourly rate,Estimated gross\nJane Rivera,2026-09-21,2026-09-27,40.00,2.00,30.00,1290.00\n",
    );
    expect(gustoPayrollCsv(rows)).toBe("first_name,last_name,regular_hours,overtime_hours\nJane,Rivera,40.00,2.00\n");
  });
});

describe("entryProblem (time entry form)", () => {
  it("refuses a same-time or 16 h+ entry and a break as long as the shift; flags overnight", async () => {
    const { entryProblem, toIso } = await import("./timesheets");
    const e = (a: string, b: string, brk: number) => {
      const s = toIso("2026-09-28", a);
      return entryProblem(s, toIso("2026-09-28", b, s), brk);
    };
    expect(e("07:00", "15:30", 30)).toEqual({ error: null, overnight: false });
    expect(e("07:00", "07:00", 0).error).toMatch(/same time/);
    expect(e("15:30", "07:00", 30)).toEqual({ error: null, overnight: true }); // 15.5 h night shift — allowed, flagged
    expect(e("06:00", "23:30", 0).error).toMatch(/over 16 hours/);
    expect(e("07:00", "15:30", 600).error).toMatch(/break/);
    expect(entryProblem(toIso("2026-09-28", "07:00"), null, 0).error).toBeNull(); // still clocked in
  });
});
