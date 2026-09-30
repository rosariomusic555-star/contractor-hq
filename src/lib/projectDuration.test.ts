import { describe, expect, it } from "vitest";
import { projectListProgress } from "./projectDuration";

const base = { status: "in_progress" as const, estimated_duration_days: 10 as number | null, actual_start_date: null as string | null, actual_end_date: null as string | null };
// Wed 2026-09-30; a Monday start → Mon..Wed = 3 working days.
const now = new Date("2026-09-30T12:00:00");

describe("projectListProgress", () => {
  it("is empty without an estimate or a real start date", () => {
    expect(projectListProgress({ ...base, estimated_duration_days: null, actual_start_date: "2026-09-28" }, now)).toBeNull();
    expect(projectListProgress(base, now)).toBeNull();
  });

  it("counts working days elapsed against the estimate", () => {
    expect(projectListProgress({ ...base, actual_start_date: "2026-09-28" }, now)).toEqual({ pct: 30, label: "Day 3 of 10" });
  });

  it("caps at 100% when a job runs over", () => {
    expect(projectListProgress({ ...base, estimated_duration_days: 2, actual_start_date: "2026-09-28" }, now)?.pct).toBe(100);
  });

  it("shows a full bar for complete jobs", () => {
    expect(projectListProgress({ ...base, status: "complete" as const }, now)).toEqual({ pct: 100, label: null });
  });
});
