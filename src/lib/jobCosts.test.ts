import { describe, expect, it } from "vitest";
import { jobCostReport } from "./jobCosts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const features = [
  { id: "patio", project_id: "p", category_id: "cat-patio", label: null, status: "active", source_quote_id: null, sort_order: 0, created_at: "" },
  { id: "wall", project_id: "p", category_id: "cat-wall", label: null, status: "active", source_quote_id: null, sort_order: 1, created_at: "" },
] as any;
const categories = [
  { id: "cat-patio", name: "Paver Patio" },
  { id: "cat-wall", name: "Seating Wall" },
];
const line = (id: string, name: string, qty: number, cost: number) =>
  ({ id, name, quantity: qty, unit_cost: cost, unit: "ea", waste_percent: 0, cost_type: "material", materials_item_baselines: [], tracked: true }) as any;
const sections = [
  { id: "s1", feature_id: "patio", feature: { status: "active" }, labor_mode: "hours", labor_man_hours: 100, labor_rate: 40, materials_items: [line("pav", "Pavers", 100, 50)] },
  { id: "s2", feature_id: "wall", feature: { status: "active" }, labor_mode: null, materials_items: [line("blk", "Block", 50, 10)] },
] as any;
// $20,000 signed quote on the patio.
const quotes = [
  { id: "q", status: "approved", kind: "original", created_at: "2026-09-01", quote_sections: [{ id: "qs", feature_id: "patio", is_optional: false, quote_items: [{ price: 20000, quantity: 1, is_optional: false }] }] },
] as any;
const exp = (id: string, amount: number, extra: Record<string, unknown> = {}) =>
  ({ id, project_id: "p", user_id: "u", name: `Exp ${id}`, amount, date: "2026-10-06", created_at: "2026-10-06T12:00:00Z", expense_category_id: null, expense_lines: [], ...extra }) as any;

const base = {
  project: { id: "p", status: "in_progress", estimated_duration_days: 10, actual_start_date: "2026-10-05", actual_end_date: null, scheduled_start_date: "2026-10-05" } as any,
  features,
  categories,
  expenseCategories: [],
  sections,
  quotes,
  changeOrders: [],
  expenses: [],
  laborEntries: [],
  materialOrders: [],
  usageLogs: [],
  materialsCounted: false,
  overheadRate: null,
  weatherDays: 0,
  today: "2026-10-06",
};

describe("jobCostReport", () => {
  it("planned is the Cost plan; actual is expenses + labor (pending included)", () => {
    const r = jobCostReport({
      ...base,
      expenses: [exp("a", 1000, { feature_id: "patio", cost_type: "material" })],
      laborEntries: [
        { id: "l1", feature_id: null, hours: 10, cost: 400, entry_date: "2026-10-05", worker_name: "Mike", timesheet_id: null } as any,
        { id: "l2", feature_id: null, hours: 5, cost: 200, entry_date: "2026-10-06", worker_name: "Ana", timesheet_id: "t", timesheet: { status: "submitted" } } as any,
      ],
    });
    // 100×50 + 100h×40 + 50×10
    expect(r.planned).toBe(9500);
    expect(r.actual).toBe(1600);
    expect(r.remaining).toBe(7900);
    expect(r.labor).toMatchObject({ approvedHours: 10, approvedCost: 400, pendingHours: 5, pendingCost: 200 });
    // Labor not tagged per feature → its own whole-job row, never split by guess.
    expect(r.laborTracking).toBe("project");
    expect(r.matrix.find((m) => m.featureId === "labor")!.cells.labor.actual).toBe(600);
  });

  it("split expenses bucket per line and count unassigned lines", () => {
    const r = jobCostReport({
      ...base,
      expenses: [
        exp("s", 300, {
          expense_lines: [
            { id: "x1", expense_id: "s", expense_category_id: null, amount: 200, description: "Sand", sort_order: 0, feature_id: "patio", cost_type: "material" },
            { id: "x2", expense_id: "s", expense_category_id: null, amount: 100, description: "Rental", sort_order: 1, feature_id: null, cost_type: "equipment" },
          ],
        }),
        exp("u", 50),
      ],
    });
    const split = r.rows.find((x) => x.key === "exp-s")!;
    expect(split.lines).toHaveLength(2);
    expect(r.matrix.find((m) => m.featureId === "patio")!.cells.material.actual).toBe(200);
    expect(r.matrix.find((m) => m.featureId === null)!.cells.equipment.actual).toBe(100);
    expect(r.unassignedCount).toBe(2); // the rental line + the untagged expense
  });

  it("deliveries are tracked but only totalled once the job is complete and reconciled", () => {
    const orders = [
      { id: "o", project_id: "p", supplier: "Stone Co", expected_delivery_date: "2026-10-05", status: "delivered", material_order_items: [{ id: "i", materials_item_id: "pav", quantity: 100, unit: "ea", unit_price: 55, status: null }] },
    ] as any;
    const open = jobCostReport({ ...base, materialOrders: orders });
    expect(open.actual).toBe(0);
    expect(open.materials.deliveredTotal).toBe(5500);
    expect(open.rows.find((x) => x.source === "delivery")!.inTotals).toBe(false);
    expect(open.materials.lines.find((l) => l.id === "pav")!.variance).toBe(500);
    // Half delivered: no variance yet, just "partial".
    const half = jobCostReport({ ...base, materialOrders: [{ ...orders[0], material_order_items: [{ ...orders[0].material_order_items[0], quantity: 50 }] }] as any });
    expect(half.materials.lines.find((l) => l.id === "pav")).toMatchObject({ variance: null, partial: true });
    const done = jobCostReport({ ...base, project: { ...base.project, status: "complete" }, materialOrders: orders, materialsCounted: true });
    expect(done.actual).toBe(5500);
  });

  it("flags labor typed as a manual expense while timesheet labor exists", () => {
    const r = jobCostReport({
      ...base,
      expenses: [exp("lab", 800, { cost_type: "labor" })],
      laborEntries: [{ id: "l1", feature_id: null, hours: 8, cost: 320, entry_date: "2026-10-05", worker_name: "Mike", timesheet_id: null } as any],
    });
    expect(r.labor.manualLaborExpenses).toBe(800);
    expect(r.labor.manualLaborCount).toBe(1);
  });

  it("warns when spend runs well ahead of the job's progress", () => {
    // Day 2 of 10 (20% through), $5,000 of $9,500 spent (53%).
    const r = jobCostReport({ ...base, expenses: [exp("big", 5000, { feature_id: "patio", cost_type: "material" })] });
    expect(r.progress.pct).toBeCloseTo(20);
    expect(r.progress.spendAhead).toBe(true);
    expect(r.status).toBe("ahead");
  });

  it("vendors total by name; remaining budget per feature × type", () => {
    const r = jobCostReport({
      ...base,
      expenses: [exp("a", 100, { vendor: "Home Depot", feature_id: "wall", cost_type: "material" }), exp("b", 50, { vendor: "home depot " })],
    });
    expect(r.vendors[0]).toMatchObject({ total: 150, count: 2 });
    expect(r.remainingBudget("wall", "material")).toEqual({ planned: 500, actual: 100, remaining: 400 });
  });
});

describe("job costs export", () => {
  it("CSV carries every section; PDF builds and is marked internal", async () => {
    const { jobCostsCsv, buildJobCostsPdf } = await import("./jobCostsExport");
    const r = jobCostReport({
      ...base,
      expenses: [exp("a", 1000, { feature_id: "patio", cost_type: "material", vendor: 'Stone, "Co"' })],
      laborEntries: [{ id: "l1", feature_id: null, hours: 10, cost: 400, entry_date: "2026-10-05", worker_name: "Mike", timesheet_id: null } as any],
    });
    const csv = jobCostsCsv({ projectName: "Job", report: r, featureName: (id) => id ?? "General", categoryName: () => "—" });
    expect(csv.startsWith("INTERNAL")).toBe(true);
    expect(csv).toContain('"Stone, ""Co"""'); // quoted cell
    expect(csv).toContain("Mike,10,10,0,400,0,0");
    const doc = buildJobCostsPdf({ projectName: "Job", clientName: "Client", businessName: "Biz", report: r, featureName: (id) => id ?? "General", categoryName: () => "—" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    expect(doc.output()).toContain("INTERNAL");
  });
});

describe("supplier credits (0152)", () => {
  it("return credits and pallet deposits back reduce material cost once counted; deposits charged add", () => {
    const secs = [
      { ...sections[0], materials_items: [{ ...sections[0].materials_items[0], disposition: "returned", return_credit: 150, reconciled_at: "2026-10-20T12:00:00Z" }] },
      sections[1],
    ] as any;
    const orders = [
      {
        id: "o", project_id: "p", supplier: "Stone Co", expected_delivery_date: "2026-10-05", delivered_on: "2026-10-05", updated_at: "2026-10-20T00:00:00Z",
        status: "delivered", pallets_delivered: 4, pallets_returned: 3, pallet_deposit_each: 25,
        material_order_items: [{ id: "i", materials_item_id: "pav", quantity: 100, unit: "ea", unit_price: 50, status: null }],
      },
    ] as any;
    const done = jobCostReport({ ...base, project: { ...base.project, status: "complete" }, sections: secs, materialOrders: orders, materialsCounted: true });
    // 100×50 delivered − 150 return + 4×25 deposit − 3×25 back
    expect(done.actual).toBe(5000 - 150 + 100 - 75);
    expect(done.materials.supplierCredits).toBe(225);
    expect(done.rows.filter((r) => r.source === "credit").map((r) => r.amount).sort()).toEqual([-150, -75]);
    const open = jobCostReport({ ...base, sections: secs, materialOrders: orders });
    expect(open.actual).toBe(0);
    expect(open.rows.find((r) => r.key === "credit-return-pav")!.inTotals).toBe(false);
  });
});
