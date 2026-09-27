import { describe, expect, it } from "vitest";
import { needsMaintenanceSetup, maintenanceStats, rollForward, addMonthsISO, dueBuckets, intervalLabel, maintenanceMessage, maintenanceNeedsYou, nextDueDate, proposeItems, rescheduleAfterDone, warrantyEnd } from "./maintenance";

describe("dates", () => {
  it("adds months, clamping month ends", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-09-15", 24)).toBe("2028-09-15");
  });
  it("snaps to the reminder month nearest the anniversary", () => {
    expect(nextDueDate("2026-09-15", 24, null)).toBe("2028-09-15");
    expect(nextDueDate("2026-09-15", 24, 4)).toBe("2028-04-01"); // Sep 2028 anniversary → April 2028 is nearest
    expect(nextDueDate("2026-05-20", 12, 4)).toBe("2027-04-01");
    expect(nextDueDate("2026-11-20", 12, 4)).toBe("2028-04-01"); // anniversary Nov 2027: Apr 2028 (5 mo) beats Apr 2027 (7 mo)
    expect(nextDueDate("2026-09-15", null, 4, true)).toBeNull();
  });
  it("labels and warranty", () => {
    expect(intervalLabel({ interval_months: 24, interval_months_max: 36, as_needed: false })).toBe("Every 2–3 years");
    expect(intervalLabel({ interval_months: 12, interval_months_max: null, as_needed: false })).toBe("Every year");
    expect(intervalLabel({ interval_months: null, interval_months_max: null, as_needed: true })).toBe("As needed");
    expect(warrantyEnd("2026-09-15", 5)).toBe("2031-09-15");
    expect(warrantyEnd("2026-09-15", null)).toBeNull();
    expect(rescheduleAfterDone({ interval_months: 12, remind_month: null, as_needed: false }, "2027-04-10")).toBe("2028-04-10");
  });
});

describe("completion prefill", () => {
  it("templates for each feature's build type", () => {
    const items = proposeItems(
      [
        { id: "f1", label: "Back patio", category: "Paver Patio" },
        { id: "f2", label: "Lights", category: "Outdoor Lighting" },
        { id: "f3", label: "Odd thing", category: "Something else" },
      ],
      [
        { id: "t1", build_type: "paver_patio", label: "Clean & reseal", description: null, interval_months: 24, interval_months_max: 36, as_needed: false, remind_month: 4, active: true },
        { id: "t2", build_type: "paver_patio", label: "Re-sand joints", description: null, interval_months: null, interval_months_max: null, as_needed: true, remind_month: null, active: true },
        { id: "t3", build_type: "outdoor_lighting", label: "Annual check", description: null, interval_months: 12, interval_months_max: null, as_needed: false, remind_month: null, active: true },
        { id: "t4", build_type: "paver_patio", label: "Off", description: null, interval_months: 12, interval_months_max: null, as_needed: false, remind_month: null, active: false },
      ],
      "2026-09-15",
    );
    expect(items.map((i) => [i.feature_id, i.label, i.next_due])).toEqual([
      ["f1", "Clean & reseal", "2028-04-01"],
      ["f1", "Re-sand joints", null],
      ["f2", "Annual check", "2027-09-15"],
    ]);
  });
});

describe("due reminders", () => {
  const base = { project_id: "p", feature_id: "f", interval_months: 24, as_needed: false, remind_month: 4, snoozed_until: null, status: "active" as const, last_done_on: null, projectName: "Greg Patio", clientName: "Greg Gray", optedOut: false, completedAt: "2026-09-15T12:00:00Z", hasOpportunity: false };
  it("inside the lead window, not snoozed / opted out / already in the pipeline", () => {
    const items = [
      { ...base, id: "a", label: "Clean & reseal", next_due: "2028-04-01" },
      { ...base, id: "b", label: "Far", next_due: "2028-09-01" },
      { ...base, id: "c", label: "Snoozed", next_due: "2028-04-01", snoozed_until: "2028-05-01" },
      { ...base, id: "d", label: "Opted", next_due: "2028-04-01", optedOut: true },
      { ...base, id: "e", label: "In pipeline", next_due: "2028-04-01", hasOpportunity: true },
    ];
    const n = maintenanceNeedsYou(items, 30, "2028-03-10");
    expect(n.map((x) => x.title)).toEqual(["Greg Gray: clean & reseal due in April"]);
    expect(n[0].subtitle).toBe("Greg Patio (installed Sep 2026)");
    expect(maintenanceNeedsYou(items, 30, "2028-04-20")[0].tone).toBe("red");
  });
  it("buckets + message", () => {
    const b = dueBuckets([{ next_due: "2028-04-10", status: "active" }, { next_due: "2028-05-02", status: "active" }, { next_due: "2028-02-01", status: "active" }, { next_due: "2028-04-11", status: "stopped" }], "2028-04-05");
    expect([b.thisMonth.length, b.nextMonth.length, b.overdue.length]).toEqual([1, 1, 1]);
    expect(maintenanceMessage({ clientName: "Greg Gray", companyName: "Stone Co", featureLabel: "Patio", itemLabel: "Clean & reseal", installedOn: "2026-09-15", today: "2028-09-20" })).toBe(
      "Hi Greg, it's Stone Co. It's been about 2 years since we installed your patio. It's a great time for a clean & reseal to keep it looking new. Want us to get you on the schedule?",
    );
  });
});

describe("needsMaintenanceSetup", () => {
  const p = { status: "complete", completed_at: "2026-09-20T15:00:00Z", maintenance_dismissed: false, client_id: "c" };
  it("waits a day after completion, then asks once", () => {
    expect(needsMaintenanceSetup(p, 0, "2026-09-20")).toBe(false);
    expect(needsMaintenanceSetup(p, 0, "2026-09-21")).toBe(true);
    expect(needsMaintenanceSetup(p, 2, "2026-09-21")).toBe(false);
    expect(needsMaintenanceSetup({ ...p, maintenance_dismissed: true }, 0, "2026-09-21")).toBe(false);
  });
  it("leaves old jobs to the bulk setup", () => {
    expect(needsMaintenanceSetup(p, 0, "2027-01-30")).toBe(false);
  });
});

describe("maintenanceStats", () => {
  it("counts only maintenance opportunities and won revenue", () => {
    const s = maintenanceStats(
      [
        { status: "active", next_due: "2026-10-01", events: [{ kind: "reached_out", created_at: "2026-09-02T00:00:00Z" }] },
        { status: "active", next_due: "2027-04-01", events: [] },
      ],
      [
        { id: "a", stage: "won", source_project_id: "p0", project_id: "p1" },
        { id: "b", stage: "contacted", source_project_id: "p0", project_id: null },
        { id: "c", stage: "won", source_project_id: null, project_id: "p9" },
      ],
      (id) => (id === "p1" ? 1200 : 99999),
      "2026-09-27",
    );
    expect(s).toEqual({ due: 1, reachedOut: 1, opportunities: 2, converted: 1, revenue: 1200 });
  });
});

describe("rollForward", () => {
  it("moves a past first date to the next occurrence", () => {
    const t = { interval_months: 24, remind_month: 4, as_needed: false };
    expect(rollForward("2022-04-01", t, "2026-09-27")).toBe("2028-04-01");
    expect(rollForward("2027-04-01", t, "2026-09-27")).toBe("2027-04-01");
    expect(rollForward(null, t, "2026-09-27")).toBe(null);
  });
});
