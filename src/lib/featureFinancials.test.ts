import { describe, expect, it } from "vitest";
import { costChangeDelta, costChangesDelta, describeCostChange } from "./changeOrderCost";
import { addonQuoteNumbers, changeOrderNumbers, featurePrice, featureReports } from "./featureFinancials";
import { countsTowardTotals, featureName, type ProjectFeature } from "./features";
import { costPlanTotal } from "./costPlanMath";
import { actualCostByType } from "./costPlan";
import type { ChangeOrder, Quote } from "./api";

const feature = (id: string, category_id: string, extra: Partial<ProjectFeature> = {}): ProjectFeature => ({
  id,
  project_id: "p",
  category_id,
  label: null,
  status: "active",
  source_quote_id: null,
  sort_order: 0,
  created_at: "2026-09-01T00:00:00Z",
  ...extra,
});
const cats = [
  { id: "patio", name: "Paver Patio" },
  { id: "fire", name: "Fire Pit" },
];

const quote = (sections: { feature_id: string | null; price: number }[], extra: Partial<Quote> = {}): Quote =>
  ({
    id: extra.id ?? "q",
    status: "approved",
    kind: "original",
    created_at: "2026-09-01T00:00:00Z",
    quote_sections: sections.map((s, i) => ({
      id: `s${i}`,
      feature_id: s.feature_id,
      is_optional: false,
      quote_items: [{ id: `i${i}`, price: s.price, quantity: 1, is_optional: false, client_selected: true }],
    })),
    ...extra,
  }) as unknown as Quote;

const co = (id: string, status: string, created_at: string, sections: { feature_id: string | null; price: number }[]): ChangeOrder =>
  ({
    id,
    status,
    created_at,
    amount: sections.reduce((s, x) => s + x.price, 0),
    change_order_sections: sections.map((s) => ({ feature_id: s.feature_id, change_order_items: [{ price: s.price, quantity: 1 }] })),
  }) as unknown as ChangeOrder;

describe("change order cost changes", () => {
  it("add / edit / remove / labor deltas", () => {
    expect(costChangeDelta({ kind: "add", line: { quantity: 100, unit_cost: 5, waste_percent: 10 } })).toBeCloseTo(550);
    expect(costChangeDelta({ kind: "add", line: { quantity: 1, unit_cost: 1200, cost_type: "subcontractor" } })).toBe(1200);
    expect(
      costChangeDelta({ kind: "edit", line: { quantity: 900 }, before: { name: "Pavers", quantity: 800, unit_cost: 4.5, waste_percent: 0 } }),
    ).toBe(450);
    expect(costChangeDelta({ kind: "remove", line: {}, before: { name: "Caps", quantity: 10, unit_cost: 30 } })).toBe(-300);
    expect(
      costChangeDelta({
        kind: "labor",
        line: { labor_mode: "crew", labor_crew_size: 3, labor_days: 5, labor_hours_per_day: 8, labor_rate: 30 },
        before: { labor_mode: "crew", labor_crew_size: 3, labor_days: 4, labor_hours_per_day: 8, labor_rate: 30 },
      }),
    ).toBe(720);
    // A credit: removing more than adding.
    expect(
      costChangesDelta([
        { kind: "remove", line: {}, before: { quantity: 1, unit_cost: 2000, cost_type: "equipment" } },
        { kind: "add", line: { quantity: 1, unit_cost: 500, cost_type: "equipment" } },
      ]),
    ).toBe(-1500);
    expect(describeCostChange({ kind: "edit", line: { quantity: 900 }, before: { name: "Pavers", quantity: 800, unit_cost: 4.5 } })).toBe(
      "Change Pavers (qty 800 → 900) · +$450",
    );
  });
});

describe("features", () => {
  it("names, and which sections count", () => {
    expect(featureName(feature("a", "patio"), cats)).toBe("Paver Patio");
    expect(featureName(feature("a", "patio", { label: "Back patio" }), cats)).toBe("Paver Patio · Back patio");
    expect(countsTowardTotals({ feature: null })).toBe(true);
    expect(countsTowardTotals({ feature: { status: "active" } })).toBe(true);
    expect(countsTowardTotals({ feature: { status: "proposed" } })).toBe(false);
    expect(countsTowardTotals({ feature: { status: "removed" } })).toBe(false);
  });

  it("a proposed add-on's section is shown but never in the plan total", () => {
    const sections = [
      { materials_items: [{ quantity: 1, unit_cost: 1000, cost_type: "subcontractor" as const }], feature: { status: "active" as const } },
      { materials_items: [{ quantity: 1, unit_cost: 5000, cost_type: "subcontractor" as const }], feature: { status: "proposed" as const } },
    ];
    expect(costPlanTotal(sections)).toBe(1000);
  });

  it("price per feature: approved quotes + approved change orders only", () => {
    const quotes = [
      quote([{ feature_id: "f1", price: 20000 }, { feature_id: "f2", price: 5000 }]),
      quote([{ feature_id: "f3", price: 8000 }], { id: "addon", kind: "addon", status: "sent" }),
    ];
    const cos = [
      co("c1", "approved", "2026-09-02", [{ feature_id: "f1", price: 1500 }]),
      co("c2", "declined", "2026-09-03", [{ feature_id: "f1", price: 999 }]),
      co("c3", "approved", "2026-09-04", [{ feature_id: "f2", price: -500 }]),
    ];
    expect(featurePrice("f1", quotes, cos)).toBe(21500);
    expect(featurePrice("f2", quotes, cos)).toBe(4500);
    expect(featurePrice("f3", quotes, cos)).toBe(0); // add-on not approved yet
    expect(changeOrderNumbers(cos).get("c3")).toBe(3);
    expect(addonQuoteNumbers(quotes).get("addon")).toBe(1);
  });
});

describe("planned vs actual per feature", () => {
  it("rows add up to the project, spend is matched by feature and type", () => {
    const features = [feature("f1", "patio"), feature("f2", "fire"), feature("f3", "fire", { status: "removed" })];
    const sections = [
      { feature_id: "f1", feature: { status: "active" as const }, materials_items: [{ quantity: 100, unit_cost: 50 }], labor_mode: "lump_sum" as const, labor_lump_sum: 3000 },
      { feature_id: "f2", feature: { status: "active" as const }, materials_items: [{ quantity: 1, unit_cost: 2000, cost_type: "subcontractor" as const }] },
      { feature_id: "f3", feature: { status: "removed" as const }, materials_items: [{ quantity: 1, unit_cost: 9999 }] },
      { feature_id: null, feature: null, materials_items: [{ quantity: 1, unit_cost: 400, cost_type: "other" as const }] },
    ];
    const quotes = [quote([{ feature_id: "f1", price: 12000 }, { feature_id: "f2", price: 4000 }, { feature_id: null, price: 1000 }])];
    const expenses = [
      { amount: 5200, expense_category_id: "pavers", feature_id: "f1", cost_type: null, expense_lines: [] },
      {
        amount: 3000,
        expense_category_id: null,
        feature_id: null,
        cost_type: null,
        expense_lines: [
          { id: "1", expense_id: "e", expense_category_id: "pavers", amount: 1000, description: null, sort_order: 0, feature_id: "f1", cost_type: null },
          { id: "2", expense_id: "e", expense_category_id: null, amount: 2000, description: null, sort_order: 1, feature_id: "f2", cost_type: "subcontractor" as const },
        ],
      },
      { amount: 250, expense_category_id: null, feature_id: "f3", cost_type: "other" as const, expense_lines: [] }, // removed feature → General
    ];
    const expenseCategories = [{ id: "pavers", cost_type: "material" as const }];
    const laborEntries = [{ cost: 3300, feature_id: "f1" }];

    const rows = featureReports({ features, categories: cats, sections, quotes, changeOrders: [], expenses, expenseCategories, laborEntries });
    expect(rows.map((r) => r.name)).toEqual(["Paver Patio", "Fire Pit", "General"]);

    const patio = rows[0];
    expect(patio.planned).toMatchObject({ material: 5000, labor: 3000, total: 8000 });
    expect(patio.actual).toMatchObject({ material: 6200, labor: 3300, total: 9500 });
    expect(patio.price).toBe(12000);
    expect(patio.varianceCost).toBe(1500);
    expect(patio.plannedMarginPct).toBeCloseTo((4000 / 12000) * 100);
    expect(patio.actualProfit).toBe(2500);

    expect(rows[1].actual.subcontractor).toBe(2000);
    expect(rows[2]).toMatchObject({ price: 1000, planned: { total: 400 }, actual: { other: 250, total: 250 } });

    // Rows reconcile with the project-level numbers.
    const plannedSum = rows.reduce((s, r) => s + r.planned.total, 0);
    expect(plannedSum).toBe(costPlanTotal(sections));
    const actualSum = rows.reduce((s, r) => s + r.actual.total, 0);
    expect(actualSum).toBe(actualCostByType(expenses, expenseCategories, 3300).total);
    expect(rows.reduce((s, r) => s + r.price, 0)).toBe(17000);
  });
});
