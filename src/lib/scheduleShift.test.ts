import { describe, expect, it } from "vitest";
import { addWorkingDays, changeSummary, defaultDelayDay, delayDays, planDelay, workingDaysBetween, type DelayJob } from "./scheduleShift";

// Oct 2026: Thu 1, Fri 2, Sat 3, Sun 4, Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Mon 12.
const job = (over: Partial<DelayJob> & { id: string }): DelayJob => ({
  name: over.id,
  crewId: "c",
  start: null,
  end: null,
  started: false,
  ...over,
});

describe("working days", () => {
  it("skips weekends", () => {
    expect(addWorkingDays("2026-10-01", 1)).toBe("2026-10-02");
    expect(addWorkingDays("2026-10-02", 1)).toBe("2026-10-05");
    expect(addWorkingDays("2026-10-03", 1)).toBe("2026-10-05"); // from a Saturday
    expect(addWorkingDays("2026-10-01", 0)).toBe("2026-10-01");
    expect(workingDaysBetween("2026-10-01", "2026-10-06")).toBe(4);
  });
});

describe("planDelay — the delayed job", () => {
  const primary = job({ id: "A", start: "2026-10-01", end: "2026-10-06" });

  it("not started: start and end both move N working days", () => {
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 1, cascade: true, otherJobs: [] });
    expect(p.mode).toBe("shift");
    expect(p.changes[0].to).toEqual({ start: "2026-10-02", end: "2026-10-07" });
    expect(p.lostDays).toEqual(["2026-10-01"]);
    expect(changeSummary(p.changes[0])).toBe("Start Thu Oct 1 → Fri Oct 2 · End Tue Oct 6 → Wed Oct 7");
  });

  it("a day before the start also shifts", () => {
    const p = planDelay({ primary, delayDate: "2026-09-30", days: 2, cascade: true, otherJobs: [] });
    expect(p.mode).toBe("shift");
    expect(p.changes[0].to).toEqual({ start: "2026-10-05", end: "2026-10-08" });
  });

  it("in progress: keeps the start, extends the end", () => {
    const p = planDelay({ primary, delayDate: "2026-10-02", days: 2, cascade: true, otherJobs: [] });
    expect(p.mode).toBe("extend");
    expect(p.changes[0].to).toEqual({ start: "2026-10-01", end: "2026-10-08" });
    expect(p.lostDays).toEqual(["2026-10-02", "2026-10-05"]);
  });

  it("a job that has actually started is extended, even on its start day", () => {
    const p = planDelay({ primary: { ...primary, started: true }, delayDate: "2026-10-01", days: 1, cascade: true, otherJobs: [] });
    expect(p.mode).toBe("extend");
    expect(p.changes[0].to).toEqual({ start: "2026-10-01", end: "2026-10-07" });
  });

  it("a one-day job with no end date", () => {
    const p = planDelay({ primary: job({ id: "A", start: "2026-10-02" }), delayDate: "2026-10-02", days: 1, cascade: true, otherJobs: [] });
    expect(p.changes[0].to).toEqual({ start: "2026-10-05", end: null });
  });
});

describe("planDelay — cascade", () => {
  const primary = job({ id: "A", start: "2026-10-01", end: "2026-10-06" });

  it("shifts later same-crew jobs by the minimum needed, in order", () => {
    const B = job({ id: "B", start: "2026-10-07", end: "2026-10-08" }); // starts right after A
    const C = job({ id: "C", start: "2026-10-12", end: "2026-10-13" }); // has slack — untouched
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 2, cascade: true, otherJobs: [B, C] });
    // A: Oct 5 → Oct 8. B must start after Oct 8 → Oct 9 (2 working days), ends Oct 12.
    expect(p.changes.map((c) => [c.projectId, c.shiftDays, c.to.start, c.to.end])).toEqual([
      ["A", 2, "2026-10-05", "2026-10-08"],
      ["B", 2, "2026-10-09", "2026-10-12"],
      ["C", 1, "2026-10-13", "2026-10-14"], // now overlaps B's new end → pushed by 1, not 2
    ]);
  });

  it("does not move a job that still fits", () => {
    const B = job({ id: "B", start: "2026-10-12", end: "2026-10-13" });
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 1, cascade: true, otherJobs: [B] });
    expect(p.changes.map((c) => c.projectId)).toEqual(["A"]);
  });

  it("never touches another crew's job", () => {
    const B = job({ id: "B", crewId: "other", start: "2026-10-07", end: "2026-10-08" });
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 2, cascade: true, otherJobs: [B] });
    expect(p.changes.map((c) => c.projectId)).toEqual(["A"]);
    expect(p.warnings).toEqual([]);
  });

  it("cascade off → same-crew overlap is a warning", () => {
    const B = job({ id: "B", start: "2026-10-07", end: "2026-10-08" });
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 1, cascade: false, otherJobs: [B] });
    expect(p.changes).toHaveLength(1);
    expect(p.warnings.map((w) => w.kind)).toEqual(["not_cascaded"]);
  });

  it("a started same-crew job is never moved", () => {
    const B = job({ id: "B", start: "2026-10-07", end: "2026-10-08", started: true });
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 1, cascade: true, otherJobs: [B] });
    expect(p.changes).toHaveLength(1);
    expect(p.warnings.map((w) => w.kind)).toEqual(["started"]);
  });

  it("jobs with no crew are listed as may-conflict, never moved", () => {
    const X = job({ id: "X", crewId: null, start: "2026-10-07", end: "2026-10-07" });
    const p = planDelay({ primary, delayDate: "2026-10-01", days: 1, cascade: true, otherJobs: [X] });
    expect(p.changes).toHaveLength(1);
    expect(p.warnings.map((w) => [w.projectId, w.kind])).toEqual([["X", "no_crew"]]);
  });

  it("a delayed job with no crew: no cascade, newly overlapping jobs are warned about", () => {
    const B = job({ id: "B", start: "2026-10-07", end: "2026-10-08" });
    const p = planDelay({ primary: { ...primary, crewId: null }, delayDate: "2026-10-01", days: 1, cascade: true, otherJobs: [B] });
    expect(p.changes).toHaveLength(1);
    expect(p.warnings.map((w) => w.kind)).toEqual(["primary_no_crew"]);
  });
});

describe("defaultDelayDay", () => {
  it("next working day from today while running, else the start", () => {
    expect(defaultDelayDay("2026-09-28", "2026-10-06", "2026-10-03")).toBe("2026-10-05"); // Saturday → Monday
    expect(defaultDelayDay("2026-09-28", "2026-10-06", "2026-10-01")).toBe("2026-10-01");
    expect(defaultDelayDay("2026-09-28", "2026-10-06", "2026-09-20")).toBe("2026-09-28");
    expect(defaultDelayDay("2026-09-28", "2026-10-03", "2026-10-03")).toBe("2026-10-03"); // weekend end date
  });
});

describe("delayDays", () => {
  it("splits weather from other delays and ignores undone ones", () => {
    const rows = [
      { project_id: "A", days: 2, reason: "rain" as const, undone_at: null },
      { project_id: "A", days: 1, reason: "weather_other" as const, undone_at: null },
      { project_id: "A", days: 3, reason: "material" as const, undone_at: null },
      { project_id: "A", days: 5, reason: "rain" as const, undone_at: "2026-10-01" },
      { project_id: "B", days: 4, reason: "rain" as const, undone_at: null },
    ];
    expect(delayDays(rows, "A")).toEqual({ weather: 3, other: 3 });
  });
});
