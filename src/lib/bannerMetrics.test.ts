import { describe, expect, it } from "vitest";
import { agingBuckets, avgDaysToPay, changeLabel, compactMoney, inMonth, inNextDays, inWeek, inYearToDate, monthlySeries, repeatRate, winRate } from "./bannerMetrics";

const now = new Date(2026, 9, 12, 15, 0); // Mon Oct 12 2026, 3pm

describe("winRate", () => {
  it("is won ÷ decided", () => {
    expect(winRate(3, 1)).toBe(0.75);
    expect(winRate(0, 4)).toBe(0);
  });
  it("is null with nothing decided", () => {
    expect(winRate(0, 0)).toBeNull();
  });
});

describe("repeatRate", () => {
  it("counts clients with 2+ jobs among clients with any", () => {
    expect(repeatRate([1, 2, 0, 3, 1])).toBe(0.5);
  });
  it("is null without jobs", () => {
    expect(repeatRate([0, 0])).toBeNull();
    expect(repeatRate([])).toBeNull();
  });
});

describe("agingBuckets", () => {
  const rows = [
    { due: "2026-10-20", bal: 100 }, // not due
    { due: null, bal: 50 }, // no due date → current
    { due: "2026-10-12", bal: 10 }, // due today → current
    { due: "2026-10-11", bal: 1 }, // 1 day late
    { due: "2026-09-12", bal: 30 }, // 30 late
    { due: "2026-09-11", bal: 31 }, // 31 late
    { due: "2026-08-13", bal: 60 }, // 60 late
    { due: "2026-08-12", bal: 61 }, // 61 late
    { due: "2026-01-01", bal: 0 }, // paid → skipped
  ];
  it("splits balances by days past due", () => {
    expect(agingBuckets(rows, (r) => r.due, (r) => r.bal, now)).toEqual({ current: 160, d1_30: 31, d31_60: 91, d60plus: 61 });
  });
});

describe("avgDaysToPay", () => {
  it("averages sent → paid in days", () => {
    expect(avgDaysToPay([{ sent: "2026-10-01", paid: "2026-10-11" }, { sent: "2026-09-01", paid: "2026-09-21" }])).toBe(15);
  });
  it("ignores pairs paid before sent, null when none", () => {
    expect(avgDaysToPay([{ sent: "2026-10-05", paid: "2026-10-01" }])).toBeNull();
    expect(avgDaysToPay([])).toBeNull();
  });
});

describe("monthlySeries", () => {
  it("sums the last N months, oldest first", () => {
    const rows = [
      { d: "2026-10-01", v: 5 },
      { d: "2026-10-30", v: 1 },
      { d: "2026-09-15", v: 2 },
      { d: "2026-05-31", v: 7 }, // 5 months back
      { d: "2026-04-30", v: 9 }, // 6 back — outside
      { d: "2026-11-01", v: 9 }, // future — outside
      { d: null, v: 9 },
    ];
    expect(monthlySeries(rows, (r) => r.d, (r) => r.v, now, 6)).toEqual([7, 0, 0, 0, 2, 6]);
  });
});

describe("date windows", () => {
  it("inMonth / last month", () => {
    expect(inMonth("2026-10-01", now)).toBe(true);
    expect(inMonth("2026-09-30", now)).toBe(false);
    expect(inMonth("2026-09-30", now, -1)).toBe(true);
  });
  it("inWeek is Monday-start", () => {
    expect(inWeek("2026-10-12", now)).toBe(true); // Mon
    expect(inWeek("2026-10-18", now)).toBe(true); // Sun
    expect(inWeek("2026-10-11", now)).toBe(false);
    expect(inWeek("2026-10-11", now, -1)).toBe(true);
  });
  it("inNextDays includes today", () => {
    expect(inNextDays("2026-10-12", 7, now)).toBe(true);
    expect(inNextDays("2026-10-18", 7, now)).toBe(true);
    expect(inNextDays("2026-10-19", 7, now)).toBe(false);
    expect(inNextDays("2026-10-11", 7, now)).toBe(false);
  });
  it("inYearToDate compares the same span last year", () => {
    expect(inYearToDate("2026-01-01", now)).toBe(true);
    expect(inYearToDate("2025-10-12", now, -1)).toBe(true);
    expect(inYearToDate("2025-10-13", now, -1)).toBe(false);
  });
});

describe("labels", () => {
  it("changeLabel", () => {
    expect(changeLabel(120, 100, "last month")).toBe("+20% vs last month");
    expect(changeLabel(80, 100, "last month")).toBe("−20% vs last month");
    expect(changeLabel(100, 100, "last month")).toBe("same as last month");
    expect(changeLabel(5, 0, "last month")).toBeNull();
  });
  it("compactMoney", () => {
    expect(compactMoney(42_100)).toBe("$42.1k");
    expect(compactMoney(70_000)).toBe("$70k");
    expect(compactMoney(950)).toBe("$950");
    expect(compactMoney(1_250_000)).toBe("$1.3M");
  });
});
