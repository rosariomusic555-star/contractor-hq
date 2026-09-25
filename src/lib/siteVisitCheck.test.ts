import { describe, expect, it } from "vitest";
import { overdueSiteVisit, overdueSiteVisitsByOpportunity } from "./siteVisitCheck";
import { buildNeedsYouItems } from "./needsYou";
import { allDayDateTime } from "./appointmentTime";
import type { Appointment, Opportunity } from "./api";

// "Now" is Sat Sep 26 2026, mid-afternoon local time.
const NOW = new Date(2026, 8, 26, 15, 0);

const visit = (over: Partial<Appointment> = {}) =>
  ({
    id: "a1",
    client_id: "c1",
    opportunity_id: "o1",
    type: "site_visit",
    status: "scheduled",
    date_time: allDayDateTime("2026-09-25"),
    all_day: true,
    outcome: null,
    ...over,
  }) as Appointment;

const opp = (over: Partial<Opportunity> = {}) =>
  ({ id: "o1", stage: "site_visit_scheduled", title: "Wayfield Patio", client: { name: "Jose Garcia" }, ...over }) as Opportunity;

describe("overdueSiteVisit", () => {
  it("flags a still-scheduled site visit from yesterday", () => {
    expect(overdueSiteVisit(opp(), [visit()], NOW)?.id).toBe("a1");
  });

  it("counts estimate appointments too", () => {
    expect(overdueSiteVisit(opp(), [visit({ type: "estimate_appointment" })], NOW)).toBeDefined();
  });

  it("a timed visit asks as soon as its start time has passed — not at midnight", () => {
    const at = (h: number, m = 0) => visit({ date_time: new Date(2026, 8, 26, h, m).toISOString(), all_day: false });
    expect(overdueSiteVisit(opp(), [at(9)], NOW)).toBeDefined(); // 9 AM today, now 3 PM
    expect(overdueSiteVisit(opp(), [at(15)], NOW)).toBeDefined(); // exactly now
    expect(overdueSiteVisit(opp(), [at(16, 30)], NOW)).toBeUndefined(); // later today
  });

  it("a date-only visit (no time) still waits until the day after", () => {
    expect(overdueSiteVisit(opp(), [visit({ date_time: allDayDateTime("2026-09-26") })], NOW)).toBeUndefined();
  });

  it.each(["completed", "cancelled", "no_show"] as const)("clears once the visit is %s", (status) => {
    expect(overdueSiteVisit(opp(), [visit({ status })], NOW)).toBeUndefined();
  });

  it("clears once rescheduled to a future date", () => {
    expect(overdueSiteVisit(opp(), [visit({ date_time: allDayDateTime("2026-09-30") })], NOW)).toBeUndefined();
  });

  it("ignores other appointment types and other opportunities", () => {
    expect(overdueSiteVisit(opp(), [visit({ type: "follow_up" })], NOW)).toBeUndefined();
    expect(overdueSiteVisit(opp(), [visit({ opportunity_id: "o2" })], NOW)).toBeUndefined();
  });

  it("only asks while confirming would still move the stage", () => {
    for (const stage of ["new_lead", "contacted", "site_visit_scheduled"] as const) {
      expect(overdueSiteVisit(opp({ stage }), [visit()], NOW)).toBeDefined();
    }
    for (const stage of ["site_visit_done", "proposal_sent", "revisions", "won", "lost"] as const) {
      expect(overdueSiteVisit(opp({ stage }), [visit()], NOW)).toBeUndefined();
    }
  });

  it("picks the oldest overdue visit", () => {
    const older = visit({ id: "old", date_time: allDayDateTime("2026-09-20") });
    expect(overdueSiteVisit(opp(), [visit(), older], NOW)?.id).toBe("old");
  });

  it("maps every opportunity at once", () => {
    const map = overdueSiteVisitsByOpportunity([opp(), opp({ id: "o2" })], [visit()], NOW);
    expect([...map.keys()]).toEqual(["o1"]);
  });
});

describe("Needs you: confirm site visit", () => {
  it("adds an item linking to the opportunity", () => {
    const items = buildNeedsYouItems([], [], NOW, { opportunities: [opp()], appointments: [visit()] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Confirm site visit: Wayfield Patio",
      href: "/pipeline/o1",
      action: "Confirm",
    });
    expect(items[0].subtitle).toContain("Sep 25");
  });

  it("disappears once the visit is completed", () => {
    const items = buildNeedsYouItems([], [], NOW, { opportunities: [opp()], appointments: [visit({ status: "completed" })] });
    expect(items).toHaveLength(0);
  });
});
