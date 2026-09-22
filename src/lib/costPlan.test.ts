import { describe, expect, it } from "vitest";
import type { ChangeOrder, CostPlanItem, Quote, QuoteSection } from "./api";
import { costPlanGroupTotal, costPlanSummary } from "./costPlan";

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function makeQuoteSections(total: number): QuoteSection[] {
  return [
    {
      id: nextId("section"),
      quote_id: "quote-1",
      name: "Section",
      is_optional: false,
      sort_order: 0,
      quote_items: [
        {
          id: nextId("item"),
          section_id: "section-1",
          name: "Line",
          description: null,
          price: total,
          quantity: 1,
          unit: null,
          is_optional: false,
          client_selected: false,
          sort_order: 0,
          category_id: null,
          quote_item_images: [],
        },
      ],
    },
  ];
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: nextId("quote"),
    project_id: "project-1",
    client_id: null,
    user_id: "user-1",
    status: "approved",
    deposit_percentage: 30,
    notes: null,
    terms: null,
    share_token: null,
    signed_at: null,
    signed_by: null,
    signed_ip: null,
    declined_at: null,
    decline_comment: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    material_sheet_id: null,
    quote_sections: makeQuoteSections(30_000),
    ...overrides,
  };
}

function makeCostPlanItem(overrides: Partial<CostPlanItem> = {}): CostPlanItem {
  return {
    id: nextId("cpi"),
    project_id: "project-1",
    group: "other",
    name: "Line",
    planned_cost: 0,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("costPlanGroupTotal", () => {
  it("sums only the items in the given group", () => {
    const items = [
      makeCostPlanItem({ group: "subcontractor", planned_cost: 2000 }),
      makeCostPlanItem({ group: "subcontractor", planned_cost: 500 }),
      makeCostPlanItem({ group: "equipment", planned_cost: 1000 }),
    ];
    expect(costPlanGroupTotal(items, "subcontractor")).toBe(2500);
    expect(costPlanGroupTotal(items, "equipment")).toBe(1000);
    expect(costPlanGroupTotal(items, "other")).toBe(0);
  });
});

describe("costPlanSummary", () => {
  it("matches the spec example: $30k contract, $19.5k planned cost, 35% margin", () => {
    const quotes = [makeQuote()];
    const changeOrders: ChangeOrder[] = [];
    const items = [
      makeCostPlanItem({ group: "equipment", planned_cost: 1000 }),
      makeCostPlanItem({ group: "other", planned_cost: 500 }),
    ];
    // Materials: $12,000, Labor: $6,000 (from the spec's own example).
    const summary = costPlanSummary(quotes, changeOrders, 12_000, 6_000, items);

    expect(summary.contractValue).toBe(30_000);
    expect(summary.materialCost).toBe(12_000);
    expect(summary.laborCost).toBe(6_000);
    expect(summary.subcontractorCost).toBe(0);
    expect(summary.equipmentCost).toBe(1_000);
    expect(summary.otherCost).toBe(500);
    expect(summary.totalPlannedCost).toBe(19_500);
    expect(summary.projectedProfit).toBe(10_500);
    expect(summary.projectedMarginPct).toBeCloseTo(35);
  });

  it("treats a null material cost (no sheet started) as zero in the total", () => {
    const summary = costPlanSummary([makeQuote()], [], null, 0, []);
    expect(summary.materialCost).toBeNull();
    expect(summary.totalPlannedCost).toBe(0);
  });

  it("projected profit/margin are null with no contract value yet", () => {
    const summary = costPlanSummary([], [], 5000, 0, []);
    expect(summary.contractValue).toBe(0);
    expect(summary.projectedProfit).toBeNull();
    expect(summary.projectedMarginPct).toBeNull();
  });
});
