import { describe, expect, it } from "vitest";
import { actualCostByType, costPlanSummary, expenseBucket } from "./costPlan";
import { costBreakdownLabel, costPlanTotal, laborFormula, lineCost, sectionLaborCost, sectionTotals } from "./costPlanMath";

const cats = [
  { id: "sub", cost_type: "subcontractor" as const },
  { id: "equip", cost_type: "equipment" as const },
  { id: "labor", cost_type: "labor" as const },
  { id: "pavers", cost_type: "material" as const },
  { id: "old", cost_type: null },
];

describe("cost plan math", () => {
  it("material lines keep waste; other lines are qty × rate (lump sum = 1 × amount)", () => {
    expect(lineCost({ quantity: 100, unit_cost: 5, waste_percent: 10 })).toBeCloseTo(550);
    expect(lineCost({ quantity: 2, unit_cost: 450, waste_percent: 10, cost_type: "equipment" })).toBe(900);
    expect(lineCost({ quantity: 1, unit_cost: 7000, cost_type: "subcontractor" })).toBe(7000);
  });

  it("labor: crew × days × hours × rate, or a lump sum", () => {
    const crew = { labor_mode: "crew" as const, labor_crew_size: 3, labor_days: 4, labor_hours_per_day: 8, labor_rate: 30 };
    expect(sectionLaborCost(crew)).toBe(2880);
    expect(laborFormula(crew)).toBe("3 guys × 4 days × 8 hrs × $30 = $2,880");
    expect(sectionLaborCost({ labor_mode: "lump_sum", labor_lump_sum: 2500 })).toBe(2500);
    expect(sectionLaborCost({ labor_mode: null, labor_lump_sum: 2500 })).toBe(0);
    // The migrated hours-only entry: 50 hrs, no rate, $0.
    expect(sectionLaborCost({ labor_mode: "crew", labor_crew_size: 1, labor_days: 6.25, labor_hours_per_day: 8, labor_rate: null })).toBe(0);
  });

  it("section + plan totals break down by type", () => {
    const section = {
      labor_mode: "crew" as const,
      labor_crew_size: 3,
      labor_days: 4,
      labor_hours_per_day: 8,
      labor_rate: 30,
      materials_items: [
        { quantity: 100, unit_cost: 42, waste_percent: 0 },
        { quantity: 1, unit_cost: 1500, cost_type: "subcontractor" as const },
        { quantity: 2, unit_cost: 450, cost_type: "equipment" as const },
      ],
    };
    const t = sectionTotals(section);
    expect(t).toMatchObject({ material: 4200, labor: 2880, subcontractor: 1500, equipment: 900, other: 0, total: 9480 });
    expect(costBreakdownLabel(t)).toBe("Materials $4,200 · Labor $2,880 · Subs $1,500 · Equip $900");
    expect(costPlanTotal([section, { materials_items: [{ quantity: 1, unit_cost: 520, cost_type: "other" as const }] }])).toBe(10000);
  });
});

describe("profit summary by type", () => {
  it("actual spend is matched to types through expense categories (split lines per line)", () => {
    const t = actualCostByType(
      [
        { amount: 7000, expense_category_id: "sub", expense_lines: [] },
        { amount: 1000, expense_category_id: null, expense_lines: [] }, // uncategorized → other
        {
          amount: 600,
          expense_category_id: null,
          expense_lines: [
            { id: "1", expense_id: "e", expense_category_id: "pavers", amount: 400, description: null, sort_order: 0 },
            { id: "2", expense_id: "e", expense_category_id: "equip", amount: 200, description: null, sort_order: 1 },
          ],
        },
        { amount: 50, expense_category_id: "old", expense_lines: [] }, // pre-0103 category → material
      ],
      cats,
      300,
    );
    expect(t).toMatchObject({ subcontractor: 7000, other: 1000, material: 450, equipment: 200, labor: 300, total: 8950 });
    expect(expenseBucket("labor", cats)).toBe("labor");
  });

  it("planned side is the whole cost plan; profit/margin against the contract", () => {
    const quotes = [
      {
        id: "q",
        status: "approved",
        quote_sections: [
          {
            id: "s",
            is_optional: false,
            quote_items: [{ id: "i", price: 20000, quantity: 1, is_optional: false, client_selected: true }],
          },
        ],
      },
    ] as unknown as Parameters<typeof costPlanSummary>[0];
    const s = costPlanSummary(quotes, [], [{ materials_items: [{ quantity: 1, unit_cost: 7000, cost_type: "subcontractor" }] }]);
    expect(s.planned.total).toBe(7000);
    expect(s.projectedProfit).toBe(13000);
    expect(s.projectedMarginPct).toBeCloseTo(65);
    expect(s.pendingSelections).toBe(0);
  });

  it("a not-yet-approved quote's client picks count in cost (Other), not just in price", () => {
    const group = {
      id: "g",
      name: "Walkway material",
      required: true,
      multi: false,
      approved_price: null,
      quote_selection_options: [
        { id: "std", name: "Pavers (included)", price_delta: 0, cost_delta: 0, is_default: true },
        { id: "blue", name: "Bluestone", price_delta: 2280, cost_delta: 1520, is_default: false },
      ],
      quote_selection_picks: [{ option_id: "blue" }],
    };
    const quote = (status: string) =>
      [
        {
          id: "q",
          status,
          kind: "original",
          created_at: "2026-09-01",
          quote_sections: [{ id: "s", is_optional: false, quote_items: [{ id: "i", price: 20000, quantity: 1, is_optional: false }], quote_selection_groups: [group] }],
        },
      ] as unknown as Parameters<typeof costPlanSummary>[0];
    const plan = [{ materials_items: [{ quantity: 1, unit_cost: 7000, cost_type: "subcontractor" as const }] }];
    const sent = costPlanSummary(quote("sent"), [], plan);
    expect(sent.contractValue).toBe(22280);
    expect(sent.pendingSelections).toBe(1520);
    expect(sent.planned.other).toBe(1520);
    expect(sent.planned.total).toBe(8520);
    expect(sent.projectedProfit).toBe(13760);
    // Approved: the trigger has added the "Selection:" line to the plan — not counted twice.
    const approved = costPlanSummary(quote("approved"), [], [...plan, { materials_items: [{ quantity: 1, unit_cost: 1520, cost_type: "other" }] }]);
    expect(approved.pendingSelections).toBe(0);
    expect(approved.planned.total).toBe(8520);
  });
});
