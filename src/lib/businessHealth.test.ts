import { describe, expect, it } from "vitest";
import { addWorkingDays, agingDetail, cashForecast, crewCapacity, monthCompare, plannedCrewDays, unscheduledBacklog, winStats, workingDaysBetween } from "./businessHealth";

const none = new Set<string>();
// 2026-09-28 is a Monday.
const TODAY = "2026-09-28";

describe("working days", () => {
  it("counts Mon–Fri minus holidays", () => {
    expect(workingDaysBetween("2026-09-28", "2026-10-04", [1, 2, 3, 4, 5], none)).toBe(5);
    expect(workingDaysBetween("2026-09-28", "2026-10-04", [1, 2, 3, 4, 5], new Set(["2026-09-30"]))).toBe(4);
    expect(workingDaysBetween("2026-09-28", "2026-10-04", [1, 2, 3, 4, 5, 6], none)).toBe(6);
  });
  it("adds working days, skipping weekends", () => {
    expect(addWorkingDays("2026-10-02", 1, [1, 2, 3, 4, 5], none)).toBe("2026-10-05"); // Fri + 1 → Mon
    expect(addWorkingDays("2026-09-27", 5, [1, 2, 3, 4, 5], none)).toBe("2026-10-02");
  });
  it("plans crew-days from the estimate, else man-hours ÷ crew-day hours", () => {
    expect(plannedCrewDays(6, 999, 24)).toBe(6);
    expect(plannedCrewDays(null, 120, 24)).toBe(5);
    expect(plannedCrewDays(null, 0, 24)).toBeNull();
  });
});

describe("crew capacity", () => {
  const crews = [
    { id: "a", name: "Crew A", work_days: [1, 2, 3, 4, 5] },
    { id: "b", name: "Crew B", work_days: [1, 2, 3, 4, 5] },
  ];
  const projects = [
    { id: "p1", name: "Patio", status: "scheduled", crew_id: "a", scheduled_start_date: "2026-09-28", scheduled_end_date: "2026-10-09" },
    { id: "p2", name: "Wall", status: "in_progress", crew_id: "a", scheduled_start_date: "2026-09-21", scheduled_end_date: "2026-09-30" }, // overlaps p1
    { id: "p3", name: "Done", status: "complete", crew_id: "b", scheduled_start_date: "2026-09-28", scheduled_end_date: "2026-10-30" },
  ];
  const cap = crewCapacity(crews, projects, TODAY, none);
  it("books each day once and finds the last booked day", () => {
    expect(cap[0].bookedThrough).toBe("2026-10-09");
    expect(cap[0].windows[0]).toMatchObject({ weeks: 4, booked: 10, available: 20, utilization: 0.5 });
    expect(cap[0].openNext3Weeks).toBe(5);
    expect(cap[0].strip[0]).toEqual({ weekStart: "2026-09-28", booked: 5, available: 5 });
  });
  it("ignores completed jobs", () => {
    expect(cap[1].bookedThrough).toBeNull();
    expect(cap[1].openNext3Weeks).toBe(15);
  });
  it("queues unscheduled jobs after current bookings", () => {
    const u = unscheduledBacklog(
      [
        { project: { id: "u1", name: "Kitchen", status: "scheduled", crew_id: "a", scheduled_start_date: null, scheduled_end_date: null }, crewDays: 5, contract: 30000 },
        { project: { id: "u2", name: "Fire pit", status: "scheduled", crew_id: null, scheduled_start_date: null, scheduled_end_date: null }, crewDays: 3, contract: 8000 },
        { project: { id: "u3", name: "Steps", status: "scheduled", crew_id: "a", scheduled_start_date: null, scheduled_end_date: null }, crewDays: 2, contract: 4000 },
      ],
      cap,
      TODAY,
      none,
    );
    expect(u[0]).toMatchObject({ crewName: "Crew A", assumedCrew: false, wouldFinish: "2026-10-16" }); // after Oct 9, 5 working days
    expect(u[1]).toMatchObject({ crewName: "Crew B", assumedCrew: true, wouldFinish: "2026-09-30" }); // B is free from today
    expect(u[2]).toMatchObject({ crewName: "Crew A", wouldFinish: "2026-10-20" }); // stacks after the Kitchen
  });
});

describe("cash forecast", () => {
  const f = cashForecast({
    today: TODAY,
    dueDays: 14,
    credits: 500,
    weeklyPayroll: 7000,
    monthlyOverhead: 3000,
    invoices: [
      { id: "i1", status: "sent", amount: 5000, balance: 5000, due_date: "2026-10-10", created_at: "2026-09-26T00:00:00Z", project_id: "p" },
      { id: "i2", status: "overdue", amount: 2000, balance: 1200, due_date: "2026-09-01", created_at: "2026-08-15T00:00:00Z", project_id: "p" },
      { id: "i3", status: "draft", amount: 1000, balance: 1000, due_date: null, created_at: "2026-09-27T00:00:00Z", project_id: "p" },
      { id: "i4", status: "paid", amount: 900, balance: 0, due_date: "2026-10-01", created_at: "2026-09-01T00:00:00Z", project_id: "p" },
    ],
    jobs: [
      // $40k, 30% deposit, $5k invoiced already → deposit 7k at start, 28k at end
      { id: "j1", name: "Patio", status: "scheduled", start: "2026-10-12", end: "2026-11-06", contract: 40000, invoiced: 5000, depositPct: 30 },
      { id: "j2", name: "Unscheduled", status: "scheduled", start: null, end: null, contract: 9000, invoiced: 0, depositPct: 30 },
      { id: "j3", name: "Done", status: "complete", start: "2026-08-01", end: "2026-08-20", contract: 9000, invoiced: 0, depositPct: 30 },
    ],
  });
  it("keeps overdue separate", () => {
    expect(f.overdue).toMatchObject({ amount: 1200 });
  });
  it("buckets invoices, drafts and projected billing by date", () => {
    const [d30, d60, d90] = f.periods;
    expect(d30).toMatchObject({ invoices: 5000, projected: 1000 + 7000, credits: 500, inTotal: 12500 }); // deposit due Oct 26
    expect(d60.projected).toBe(28000); // final: Nov 6 + 14 = Nov 20 → days 31–60
    expect(d90.projected).toBe(0);
    expect(d30.outTotal).toBe(30000 + 3000);
    expect(d30.net).toBe(12500 - 33000);
  });
});

describe("receivables + trends", () => {
  it("ages open invoices into five buckets", () => {
    const b = agingDetail(
      [
        { status: "sent", balance: 100, due_date: "2026-10-05" },
        { status: "overdue", balance: 200, due_date: "2026-09-10" },
        { status: "overdue", balance: 300, due_date: "2026-07-20" },
        { status: "overdue", balance: 400, due_date: "2026-05-01" },
        { status: "draft", balance: 999, due_date: "2026-05-01" },
      ],
      TODAY,
    );
    expect(b.map((x) => x.amount)).toEqual([100, 200, 0, 300, 400]);
  });
  it("compares months and years", () => {
    const c = monthCompare(
      [
        { date: "2026-09-05", amount: 1000 },
        { date: "2026-08-20", amount: 500 },
        { date: "2025-09-10", amount: 700 },
        { date: "2025-12-01", amount: 900 },
        { date: "2026-02-01", amount: 300 },
      ],
      TODAY,
    );
    expect(c).toEqual({ thisMonth: 1000, lastMonth: 500, sameMonthLastYear: 700, ytd: 1800, ytdLastYear: 700 });
  });
  it("win rate and average job over a window", () => {
    const w = winStats(
      [
        { outcome: "won", date: "2026-09-01", value: 20000 },
        { outcome: "won", date: "2026-08-01", value: 10000 },
        { outcome: "lost", date: "2026-09-10", value: 0 },
        { outcome: "won", date: "2026-01-01", value: 99999 },
      ],
      "2026-07-01",
      TODAY,
    );
    expect(w).toEqual({ decided: 3, won: 2, winRate: 2 / 3, avgJob: 15000 });
  });
});
