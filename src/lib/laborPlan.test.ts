import { describe, expect, it } from "vitest";
import type { Category, LaborEntry } from "./api";
import {
  GENERAL_SCOPE_KEY,
  laborRollupsByScope,
  laborTotals,
  plannedLaborFromSections,
  productivityMetrics,
  type PlannedLabor,
} from "./laborPlan";

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: nextId("cat"),
    user_id: "user-1",
    name: "Paver patio",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePlanEntry(overrides: Partial<PlannedLabor> = {}): PlannedLabor {
  return { category_id: null, planned_hours: 40, planned_cost: 3000, ...overrides };
}

function makeActual(overrides: Partial<LaborEntry> = {}): LaborEntry {
  return {
    id: nextId("le"),
    project_id: "project-1",
    category_id: null,
    employee_id: null,
    worker_name: "Jose",
    entry_date: "2026-06-01",
    hours: 8,
    hourly_rate: 75,
    cost: 600,
    note: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("laborRollupsByScope", () => {
  it("groups planned + actual by category, General last", () => {
    const patio = makeCategory({ id: "patio", name: "Paver patio" });
    const wall = makeCategory({ id: "wall", name: "Retaining wall" });
    const plans = [
      makePlanEntry({ category_id: "patio", planned_hours: 40, planned_cost: 3000 }),
      makePlanEntry({ category_id: "wall", planned_hours: 18, planned_cost: 1200 }),
      makePlanEntry({ category_id: null, planned_hours: 5, planned_cost: 375 }),
    ];
    const actuals = [
      makeActual({ category_id: "patio", hours: 46, cost: 3450 }),
      makeActual({ category_id: "wall", hours: 10, cost: 750 }),
    ];

    const rollups = laborRollupsByScope(plans, actuals, [patio, wall]);
    expect(rollups.map((r) => r.categoryName)).toEqual(["Paver patio", "Retaining wall", "General"]);

    const patioRollup = rollups.find((r) => r.categoryId === "patio")!;
    expect(patioRollup.plannedHours).toBe(40);
    expect(patioRollup.actualHours).toBe(46);
    expect(patioRollup.varianceHours).toBe(6);
    expect(patioRollup.varianceCost).toBe(450);
    expect(patioRollup.variancePct).toBeCloseTo(15);
  });

  it("variancePct is null when nothing was planned", () => {
    const actuals = [makeActual({ category_id: null, hours: 5, cost: 375 })];
    const rollups = laborRollupsByScope([], actuals, []);
    expect(rollups[0].variancePct).toBeNull();
  });

  it("omits a scope with neither a plan nor an actual entry", () => {
    const patio = makeCategory({ id: "patio" });
    const rollups = laborRollupsByScope([], [], [patio]);
    expect(rollups).toHaveLength(0);
  });

  it("resolves an unnamed category id to Uncategorized", () => {
    const plans = [makePlanEntry({ category_id: "ghost", planned_hours: 5, planned_cost: 100 })];
    const rollups = laborRollupsByScope(plans, [], []);
    expect(rollups[0].categoryName).toBe("Uncategorized");
  });
});

describe("plannedLaborFromSections", () => {
  it("reads each Cost plan section's labor block as its scope's plan", () => {
    const planned = plannedLaborFromSections([
      { job_category_id: "patio", labor_mode: "crew", labor_crew_size: 3, labor_days: 4, labor_hours_per_day: 8, labor_rate: 30 },
      { job_category_id: "wall", labor_mode: "lump_sum", labor_lump_sum: 1200 },
      { job_category_id: "wall", labor_mode: null },
      { job_category_id: "patio", is_general: true, labor_mode: "crew", labor_crew_size: 1, labor_days: 1, labor_hours_per_day: 8, labor_rate: 50 },
    ]);
    expect(planned).toEqual([
      { category_id: "patio", planned_hours: 96, planned_cost: 2880 },
      { category_id: "wall", planned_hours: 0, planned_cost: 1200 },
      { category_id: null, planned_hours: 8, planned_cost: 400 },
    ]);
    const rollups = laborRollupsByScope(planned, [], []);
    expect(rollups.map((r) => r.categoryId)).toEqual(["patio", "wall", null]);
  });
});

describe("laborTotals", () => {
  it("sums rollups into whole-project totals", () => {
    const rollups = laborRollupsByScope(
      [
        makePlanEntry({ category_id: "patio", planned_hours: 40, planned_cost: 3000 }),
        makePlanEntry({ category_id: "wall", planned_hours: 18, planned_cost: 1200 }),
      ],
      [makeActual({ category_id: "patio", hours: 46, cost: 3450 })],
      [],
    );
    const totals = laborTotals(rollups);
    expect(totals.plannedHours).toBe(58);
    expect(totals.plannedCost).toBe(4200);
    expect(totals.actualHours).toBe(46);
    expect(totals.actualCost).toBe(3450);
    expect(totals.varianceHours).toBe(-12);
  });

  it("returns all-zero totals for an empty project", () => {
    expect(laborTotals([])).toEqual({
      plannedHours: 0,
      plannedCost: 0,
      actualHours: 0,
      actualCost: 0,
      varianceHours: 0,
      varianceCost: 0,
      variancePct: null,
    });
  });
});

describe("productivityMetrics", () => {
  const totals = laborTotals(
    laborRollupsByScope(
      [makePlanEntry({ category_id: null, planned_hours: 80, planned_cost: 6000 })],
      [makeActual({ category_id: null, hours: 90, cost: 6750 })],
      [],
    ),
  );

  it("is null when the project has no size set", () => {
    expect(productivityMetrics(null, totals)).toBeNull();
    expect(productivityMetrics(0, totals)).toBeNull();
  });

  it("computes hours/100sf, cost/sf for an 800 sq ft job", () => {
    const metrics = productivityMetrics(800, totals);
    expect(metrics).not.toBeNull();
    expect(metrics!.plannedHoursPer100Sqft).toBeCloseTo(10);
    expect(metrics!.actualHoursPer100Sqft).toBeCloseTo(11.25);
    expect(metrics!.plannedCostPerSqft).toBeCloseTo(7.5);
    expect(metrics!.actualCostPerSqft).toBeCloseTo(8.4375);
    expect(metrics!.sqftPerActualLaborHour).toBeCloseTo(800 / 90);
  });

  it("scope key sentinel stays stable", () => {
    expect(GENERAL_SCOPE_KEY).toBe("__general__");
  });
});
