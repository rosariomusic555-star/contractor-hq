import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filterOpportunityRows, nextUpFor, type OpportunityRow } from "./opportunityList";
import type { Opportunity } from "./api";

const row = (id: string, over: Partial<Opportunity> = {}, categoryIds: string[] = []): OpportunityRow => ({
  opp: { id, title: `Job ${id}`, stage: "new_lead", lead_source: null, created_at: "2026-09-15T12:00:00Z", client: { name: "Pat" }, ...over } as Opportunity,
  categoryIds,
  value: null,
  lastActivity: "2026-09-20T00:00:00Z",
  next: null,
});

describe("filterOpportunityRows", () => {
  const rows = [row("a"), row("b", { stage: "won" }), row("c", { stage: "lost", lead_source: "Google" }, ["steps"])];

  it("hides Won/Lost unless included", () => {
    expect(filterOpportunityRows(rows, EMPTY_FILTERS).map((r) => r.opp.id)).toEqual(["a"]);
    expect(filterOpportunityRows(rows, { ...EMPTY_FILTERS, includeClosed: true })).toHaveLength(3);
  });

  it("picking Won as the stage shows Won even with the toggle off", () => {
    expect(filterOpportunityRows(rows, { ...EMPTY_FILTERS, stage: "won" }).map((r) => r.opp.id)).toEqual(["b"]);
  });

  it("filters by lead source, type, date range and search", () => {
    const all = { ...EMPTY_FILTERS, includeClosed: true };
    expect(filterOpportunityRows(rows, { ...all, leadSource: "Google" }).map((r) => r.opp.id)).toEqual(["c"]);
    expect(filterOpportunityRows(rows, { ...all, categoryId: "steps" }).map((r) => r.opp.id)).toEqual(["c"]);
    expect(filterOpportunityRows(rows, { ...all, from: "2026-09-16" })).toHaveLength(0);
    expect(filterOpportunityRows(rows, { ...all, to: "2026-09-15" })).toHaveLength(3);
    expect(filterOpportunityRows(rows, { ...all, search: "job b" }).map((r) => r.opp.id)).toEqual(["b"]);
    expect(filterOpportunityRows(rows, { ...all, search: "pat" })).toHaveLength(3);
  });
});

describe("nextUpFor", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  it("picks the soonest scheduled appointment or open task", () => {
    const next = nextUpFor(
      "o",
      [{ opportunity_id: "o", status: "scheduled", date_time: "2026-10-05T15:00:00Z", type: "site_visit" }],
      [{ opportunity_id: "o", completed: false, due_at: "2026-10-02T15:00:00Z", title: "Call back" }],
      now,
    );
    expect(next).toMatchObject({ kind: "task", label: "Call back", overdue: false });
  });

  it("skips completed / cancelled and flags overdue tasks", () => {
    const next = nextUpFor(
      "o",
      [{ opportunity_id: "o", status: "cancelled", date_time: "2026-10-01T15:00:00Z", type: "site_visit" }],
      [
        { opportunity_id: "o", completed: true, due_at: "2026-09-01T00:00:00Z", title: "Done" },
        { opportunity_id: "o", completed: false, due_at: "2026-09-28T00:00:00Z", title: "Late" },
      ],
      now,
    );
    expect(next).toMatchObject({ label: "Late", overdue: true });
  });

  it("is null with nothing scheduled", () => {
    expect(nextUpFor("o", [], [], now)).toBeNull();
  });
});
