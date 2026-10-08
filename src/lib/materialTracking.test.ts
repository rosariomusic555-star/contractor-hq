import { describe, expect, it } from "vitest";
import type { ChangeOrder, MaterialOrderItem, MaterialsItem, MaterialsUsageLog, Quote } from "./api";
import {
  convertToSheetUnit,
  currentBaseline,
  deliveredQuantity,
  effectiveDeliveryStatus,
  effectiveEstimate,
  isProjectActive,
  executionTrackedLines,
  leftoverQuantity,
  lineActualCost,
  lineStatus,
  materialAlerts,
  materialAlertSummary,
  startContext,
  hasAnyOrder,
  needsReconciliation,
  orderedQuantity,
  predictedMaterialCost,
  prefillConversion,
  sheetCostSummary,
  suggestMaterialsItemMatches,
  trackedSheetIds,
  trackingSummary,
  unitsMatch,
  unplannedActualCost,
  usedQuantity,
  type DeliveryLineWithOrderStatus,
  overEstimate,
  orderingStatus,
  usageStatus,
} from "./materialTracking";

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function makeItem(overrides: Partial<MaterialsItem> = {}): MaterialsItem {
  return {
    id: nextId("mi"),
    section_id: "section-1",
    name: "Base gravel",
    quantity: 24,
    unit_cost: 50,
    sort_order: 0,
    expense_category_id: null,
    category: null,
    unit: "ton",
    price_book_item_id: null,
    catalog_product_id: null,
    waste_percent: 0,
    conversion_unit: null,
    conversion_factor: null,
    reconciled_at: null,
    disposition: null,
    return_credit: null,
    tracked: true,
    materials_item_baselines: [],
    ...overrides,
  };
}

function makeOrderItem(overrides: Partial<MaterialOrderItem> = {}): MaterialOrderItem {
  return {
    id: nextId("moi"),
    material_order_id: "order-1",
    description: "Base gravel",
    quantity: 10,
    unit: "ton",
    sort_order: 0,
    materials_item_id: null,
    unit_price: null,
    status: null,
    source: "manual",
    ticket_photo_path: null,
    ...overrides,
  };
}

function makeUsage(overrides: Partial<MaterialsUsageLog> = {}): MaterialsUsageLog {
  return {
    id: nextId("ul"),
    materials_item_id: "mi-x",
    quantity: 1,
    logged_at: "2026-06-01",
    note: null,
    logged_by: null,
    photo_path: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function delivery(item: MaterialOrderItem, orderStatus: MaterialOrderItem["status"] & {} = "ordered"): DeliveryLineWithOrderStatus {
  return { item, orderStatus: orderStatus as NonNullable<MaterialOrderItem["status"]> };
}

function makeQuoteStub(status: string, material_sheet_id: string): Quote {
  return { id: nextId("q"), status, material_sheet_id } as unknown as Quote;
}

function makeChangeOrderStub(status: string, material_sheet_id: string): ChangeOrder {
  return { id: nextId("co"), status, material_sheet_id } as unknown as ChangeOrder;
}

describe("trackedSheetIds", () => {
  it("includes the signed quote's sheet, never a draft or sent one", () => {
    const ids = trackedSheetIds(
      [makeQuoteStub("draft", "sheet-draft"), makeQuoteStub("sent", "sheet-sent"), makeQuoteStub("approved", "sheet-approved")],
      [],
    );
    expect(ids).toEqual(new Set(["sheet-approved"]));
  });

  it("includes approved change order sheets, never pending/declined ones", () => {
    const ids = trackedSheetIds(
      [],
      [
        makeChangeOrderStub("draft", "co-draft"),
        makeChangeOrderStub("declined", "co-declined"),
        makeChangeOrderStub("approved", "co-approved"),
      ],
    );
    expect(ids).toEqual(new Set(["co-approved"]));
  });
});

describe("effectiveDeliveryStatus", () => {
  it("inherits the parent order's status when the line has no override", () => {
    expect(effectiveDeliveryStatus({ status: null }, "delivered")).toBe("delivered");
  });

  it("uses the line's own override for a partial delivery", () => {
    expect(effectiveDeliveryStatus({ status: "ordered" }, "delivered")).toBe("ordered");
  });
});

describe("unit conversion and mismatch handling", () => {
  it("matches same units directly, no conversion needed", () => {
    expect(unitsMatch("cy", "cubic_yard")).toBe(true);
    expect(unitsMatch("sf", "sf")).toBe(true);
  });

  it("converts via the line's defined conversion when units differ", () => {
    const line = makeItem({ unit: "sf", conversion_unit: "pallet", conversion_factor: 108 });
    expect(convertToSheetUnit(5, "pallet", line)).toBe(540);
  });

  it("returns null — never guesses — when units differ and no conversion is defined", () => {
    const line = makeItem({ unit: "sf", conversion_unit: null, conversion_factor: null });
    expect(convertToSheetUnit(5, "pallet", line)).toBeNull();
  });

  it("prefillConversion reads Price Book pallet coverage", () => {
    expect(prefillConversion({ kind: "price_book", coverage_per_pallet_sqft: 108 })).toEqual({
      conversion_unit: "pallet",
      conversion_factor: 108,
    });
  });

  it("prefillConversion derives Catalog package coverage from per-unit x units-per-package", () => {
    expect(prefillConversion({ kind: "catalog", coverage_per_unit: 2.25, units_per_package: 48 })).toEqual({
      conversion_unit: "pallet",
      conversion_factor: 108,
    });
  });

  it("prefillConversion returns null when the source has no coverage data", () => {
    expect(prefillConversion({ kind: "price_book" })).toBeNull();
    expect(prefillConversion(null)).toBeNull();
  });
});

describe("computed quantities from deliveries and usage", () => {
  it("orderedQuantity sums every matched line regardless of status ('ordered or later')", () => {
    const line = makeItem({ id: "mi-1", unit: "ton" });
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 10 }), "ordered"),
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 8 }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 2 }), "delayed"),
      delivery(makeOrderItem({ materials_item_id: "mi-other", quantity: 99 }), "delivered"),
    ];
    expect(orderedQuantity(line, deliveries)).toBe(20);
  });

  it("deliveredQuantity only sums lines whose effective status is delivered", () => {
    const line = makeItem({ id: "mi-1", unit: "ton" });
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 10 }), "ordered"),
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 8 }), "delivered"),
      // per-line override: this one shipment's line is still only ordered
      // even though the parent order overall reads delivered.
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 4, status: "ordered" }), "delivered"),
    ];
    expect(deliveredQuantity(line, deliveries)).toBe(8);
  });

  it("converts a matched line's quantity into the sheet unit before summing", () => {
    const line = makeItem({ id: "mi-1", unit: "sf", conversion_unit: "pallet", conversion_factor: 108 });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 3, unit: "pallet" }), "delivered")];
    expect(deliveredQuantity(line, deliveries)).toBe(324);
  });

  it("contributes 0 (not a crash, not a guess) when a matched delivery's unit can't be converted", () => {
    const line = makeItem({ id: "mi-1", unit: "sf" });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 3, unit: "pallet" }), "delivered")];
    expect(deliveredQuantity(line, deliveries)).toBe(0);
  });

  it("usedQuantity sums usage logs for the line only", () => {
    const line = makeItem({ id: "mi-1" });
    const logs = [
      makeUsage({ materials_item_id: "mi-1", quantity: 5 }),
      makeUsage({ materials_item_id: "mi-1", quantity: 3 }),
      makeUsage({ materials_item_id: "mi-2", quantity: 100 }),
    ];
    expect(usedQuantity(line, logs)).toBe(8);
  });

  it("currentBaseline reads the most recent snapshot, null when never snapshotted", () => {
    const withBaseline = makeItem({
      materials_item_baselines: [
        { id: "b2", materials_item_id: "mi-1", quantity: 24, unit_cost: 50, unit: "ton", reason: "site remeasure", created_at: "2026-02-01" },
        { id: "b1", materials_item_id: "mi-1", quantity: 20, unit_cost: 45, unit: "ton", reason: null, created_at: "2026-01-01" },
      ],
    });
    expect(currentBaseline(withBaseline)).toEqual({ quantity: 24, unit_cost: 50, unit: "ton" });
    expect(currentBaseline(makeItem({ materials_item_baselines: [] }))).toBeNull();
  });

  it("effectiveEstimate ignores the automatic first snapshot — Est. follows the live line (the 'Est. 0' bug)", () => {
    // Auto-snapshotted while the line was still blank, then filled in.
    const line = makeItem({
      quantity: 750,
      unit_cost: 4,
      unit: "sq ft",
      waste_percent: 5,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 0, unit_cost: 0, unit: "sq ft", reason: null, created_at: "2026-01-01" }],
    });
    expect(effectiveEstimate(line)).toEqual({ quantity: 787.5, unit_cost: 4, unit: "sq ft" });
  });

  it("effectiveEstimate uses an explicit 'Revise estimate' once there is one (newest revision wins)", () => {
    const line = makeItem({
      quantity: 999,
      unit_cost: 999,
      materials_item_baselines: [
        { id: "b3", materials_item_id: "mi-1", quantity: 26, unit_cost: 52, unit: "ton", reason: "added a bed", created_at: "2026-03-01" },
        { id: "b2", materials_item_id: "mi-1", quantity: 24, unit_cost: 50, unit: "ton", reason: "site remeasure", created_at: "2026-02-01" },
        { id: "b1", materials_item_id: "mi-1", quantity: 20, unit_cost: 45, unit: "ton", reason: null, created_at: "2026-01-01" },
      ],
    });
    expect(effectiveEstimate(line)).toEqual({ quantity: 26, unit_cost: 52, unit: "ton" });
  });

  it("effectiveEstimate falls back to the line's own live quantity/cost before any baseline exists", () => {
    const line = makeItem({ quantity: 30, unit_cost: 12, unit: "bag", materials_item_baselines: [] });
    expect(effectiveEstimate(line)).toEqual({ quantity: 30, unit_cost: 12, unit: "bag" });
  });
});

describe("isProjectActive — when any tracking UI shows", () => {
  it("only once the job is Won and scheduled / in progress / complete", () => {
    expect(isProjectActive({ status: "scheduled", opportunities: [{ id: "o", stage: "won" }] })).toBe(true);
    expect(isProjectActive({ status: "in_progress", opportunities: [] })).toBe(true);
    expect(isProjectActive({ status: "complete", opportunities: [{ id: "o", stage: "won" }] })).toBe(true);
  });

  it("never for a pre-sale (opportunity not Won), Estimating or Lost project", () => {
    expect(isProjectActive({ status: "estimating", opportunities: [{ id: "o", stage: "site_visit_done" }] })).toBe(false);
    // Even a stray non-estimating status behind an open opportunity stays hidden.
    expect(isProjectActive({ status: "scheduled", opportunities: [{ id: "o", stage: "proposal_sent" }] })).toBe(false);
    expect(isProjectActive({ status: "estimating", opportunities: [] })).toBe(false);
    expect(isProjectActive({ status: "lost", opportunities: [{ id: "o", stage: "lost" }] })).toBe(false);
    expect(isProjectActive(null)).toBe(false);
  });
});

describe("suggestMaterialsItemMatches", () => {
  it("ranks the closest-named line first by shared words", () => {
    const pavers = makeItem({ id: "mi-1", name: "Techo-Bloc Blu Pavers 60mm" });
    const base = makeItem({ id: "mi-2", name: "Base gravel 3/4 minus" });
    const [top] = suggestMaterialsItemMatches("Techo-Bloc Blu 60mm", [base, pavers]);
    expect(top.id).toBe("mi-1");
  });

  it("suggests nothing when no candidate shares a word", () => {
    const base = makeItem({ id: "mi-1", name: "Base gravel" });
    expect(suggestMaterialsItemMatches("Polymeric sand", [base])).toEqual([]);
  });
});

describe("lineStatus", () => {
  it("walks not_ordered -> ordered -> delivered -> in_use -> used_up", () => {
    expect(lineStatus(24, 0, 0, 0)).toBe("not_ordered");
    expect(lineStatus(24, 24, 0, 0)).toBe("ordered");
    expect(lineStatus(24, 24, 24, 0)).toBe("delivered");
    expect(lineStatus(24, 24, 24, 10)).toBe("in_use");
    expect(lineStatus(24, 24, 24, 24)).toBe("used_up");
  });

  it("over_estimate takes priority over every other state", () => {
    expect(lineStatus(24, 24, 24, 30)).toBe("over_estimate");
    expect(lineStatus(24, 40, 0, 0)).toBe("ordered"); // over-ordered but not over-used isn't this status
  });
});

describe("actual cost, including Unplanned items", () => {
  it("uses the delivery's own price when set, else falls back to the sheet's unit_cost", () => {
    const line = makeItem({ id: "mi-1", unit: "ton", unit_cost: 50 });
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 10, unit_price: 55 }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 5, unit_price: null }), "delivered"),
    ];
    // 10 x 55 (actual) + 5 x 50 (fallback to sheet cost)
    expect(lineActualCost(line, deliveries)).toBe(800);
  });

  it("never drops an Unplanned (unmatched) delivered line — counts it at its own price", () => {
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: null, quantity: 4, unit_price: 25 }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: null, quantity: 2, unit_price: null }), "delivered"),
      // not yet delivered — shouldn't count
      delivery(makeOrderItem({ materials_item_id: null, quantity: 100, unit_price: 9 }), "ordered"),
    ];
    // 4 x 25 (priced) + 2 x 0 (no price entered, never guessed)
    expect(unplannedActualCost(deliveries)).toBe(100);
  });

  it("sheetCostSummary combines baseline cost, tracked-line actual cost, and Unplanned cost", () => {
    const line = makeItem({
      id: "mi-1",
      unit: "ton",
      unit_cost: 50,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 50, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 20, unit_price: 55 }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: null, quantity: 3, unit_price: 10 }), "delivered"),
    ];
    const summary = sheetCostSummary([line], deliveries, []);
    expect(summary.estimatedCost).toBe(1200); // 24 x 50
    expect(summary.actualCost).toBe(1130); // 20 x 55 + 3 x 10
    expect(summary.varianceDollars).toBe(-70);
    expect(summary.unplannedCount).toBe(1);
  });

  it("subtracts a reconciled return credit from actual cost", () => {
    const line = makeItem({
      id: "mi-1",
      unit: "ton",
      unit_cost: 50,
      reconciled_at: "2026-08-01",
      disposition: "returned",
      return_credit: 100,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 50, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 24, unit_price: 50 }), "delivered")];
    const summary = sheetCostSummary([line], deliveries, []);
    expect(summary.actualCost).toBe(1100); // 24 x 50 - 100 credit
  });

  it("still counts an untracked (Don't Track) line's cost in estimated/actual — the toggle is execution-only", () => {
    const tracked = makeItem({
      id: "mi-1",
      tracked: true,
      quantity: 10,
      unit_cost: 50,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 10, unit_cost: 50, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const untracked = makeItem({
      id: "mi-2",
      tracked: false,
      quantity: 5,
      unit_cost: 20,
      materials_item_baselines: [{ id: "b2", materials_item_id: "mi-2", quantity: 5, unit_cost: 20, unit: "bag", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 10, unit_price: 50 }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: "mi-2", quantity: 5, unit_price: 20 }), "delivered"),
    ];
    const summary = sheetCostSummary([tracked, untracked], deliveries, []);
    expect(summary.estimatedCost).toBe(600); // 10x50 + 5x20 — both lines count
    expect(summary.actualCost).toBe(600);
  });

  it("counts an untracked line as not ordered (ordering is for every line, 0167), but never as over estimate", () => {
    const untracked = makeItem({
      id: "mi-1",
      tracked: false,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const summary = sheetCostSummary([untracked], [], [makeUsage({ materials_item_id: "mi-1", quantity: 30 })]);
    expect(summary.notOrderedCount).toBe(1);
    expect(summary.overEstimateCount).toBe(0);
  });

  it("shows a real estimated cost for a line with no baseline yet — the tracker works before Won, not just after", () => {
    const line = makeItem({ id: "mi-1", quantity: 40, unit_cost: 75, materials_item_baselines: [] });
    const summary = sheetCostSummary([line], [], []);
    expect(summary.estimatedCost).toBe(3000);
    expect(summary.notOrderedCount).toBe(1); // nothing ordered yet against a real, non-zero estimate
  });
});

describe("predictedMaterialCost", () => {
  const section = (items: MaterialsItem[]) => ({
    id: "sec-1",
    project_id: "p-1",
    sheet_id: "sheet-1",
    name: "Section",
    sort_order: 0,
    smart_section_build_type: null,
    materials_items: items,
  });

  it("is null for a project with no materials sheet at all — not started, never $0", () => {
    const summary = sheetCostSummary([], [], []);
    expect(predictedMaterialCost([], summary)).toBeNull();
    expect(predictedMaterialCost([section([])], summary)).toBeNull();
  });

  it("reads the real number from sheetCostSummary once there's at least one line", () => {
    const line = makeItem({ id: "mi-1", quantity: 10, unit_cost: 5, materials_item_baselines: [] });
    const summary = sheetCostSummary([line], [], []);
    expect(predictedMaterialCost([section([line])], summary)).toBe(50);
  });
});

describe("Track / Don't Track (0086)", () => {
  it("executionTrackedLines keeps only lines with tracked=true", () => {
    const lines = [makeItem({ id: "mi-1", tracked: true }), makeItem({ id: "mi-2", tracked: false })];
    expect(executionTrackedLines(lines).map((l) => l.id)).toEqual(["mi-1"]);
  });

  it("trackingSummary counts tracked vs. total", () => {
    const lines = [{ tracked: true }, { tracked: true }, { tracked: false }];
    expect(trackingSummary(lines)).toEqual({ trackedCount: 2, totalCount: 3 });
  });
});

describe("burn-rate and other early-warning alerts", () => {
  const settings = { overOrderMarginPct: 10, notOrderedAlertDays: 5 };

  it("never raises a usage-based alert — over estimate / using fast are quiet line notes now (0167)", () => {
    const project = { scheduled_start_date: null };
    const line = makeItem({
      id: "mi-1",
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 100, unit_cost: 1, unit: "ea", reason: null, created_at: "2026-01-01" }],
    });
    const logs = [makeUsage({ materials_item_id: "mi-1", quantity: 180 })];
    expect(materialAlerts(project, [line], [], logs, settings, new Date("2026-06-05T12:00:00"))).toEqual([]);
    expect(overEstimate(100, 180)).toBe(true);
    expect(overEstimate(100, 100)).toBe(false);
    expect(overEstimate(0, 5)).toBe(false);
  });

  it("flags a line ordered more than the margin over estimate", () => {
    const project = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: null };
    const line = makeItem({
      id: "mi-1",
      unit: "ton",
      quantity: 100,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 100, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 115, unit: "ton" }), "ordered")];
    const alerts = materialAlerts(project, [line], deliveries, [], settings);
    expect(alerts.some((a) => a.key === "over_order")).toBe(true);

    const withinMargin = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 105, unit: "ton" }), "ordered")];
    expect(materialAlerts(project, [line], withinMargin, [], settings).some((a) => a.key === "over_order")).toBe(false);
  });

  it("flags a line not yet ordered within N days of the scheduled start", () => {
    const line = makeItem({
      id: "mi-1",
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const now = new Date("2026-06-01T00:00:00");
    const soonProject = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: "2026-06-04" };
    const farProject = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: "2026-07-01" };
    expect(materialAlerts(soonProject, [line], [], [], settings, now).some((a) => a.key === "not_ordered")).toBe(true);
    expect(materialAlerts(farProject, [line], [], [], settings, now).some((a) => a.key === "not_ordered")).toBe(false);
  });

  it("never flags not-ordered once something has been ordered", () => {
    const line = makeItem({
      id: "mi-1",
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 5, unit: "ton" }), "ordered")];
    const now = new Date("2026-06-01T00:00:00");
    const soonProject = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: "2026-06-02" };
    expect(materialAlerts(soonProject, [line], deliveries, [], settings, now).some((a) => a.key === "not_ordered")).toBe(false);
  });

  it("an untracked line still gets its not-ordered alert (0167 — ordering is for every line)", () => {
    const line = makeItem({
      id: "mi-1",
      tracked: false,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const now = new Date("2026-06-01T00:00:00");
    const soonProject = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: "2026-06-02" };
    expect(materialAlerts(soonProject, [line], [], [], settings, now).map((a) => a.key)).toEqual(["not_ordered"]);
  });

  it("still flags over-order for a line with no baseline yet (still in Estimating, say), using its live quantity as the estimate", () => {
    const project = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: null };
    const line = makeItem({ id: "mi-1", unit: "ton", quantity: 100, materials_item_baselines: [] });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 115, unit: "ton" }), "ordered")];
    expect(materialAlerts(project, [line], deliveries, [], settings).some((a) => a.key === "over_order")).toBe(true);
  });
});

describe("reconciliation", () => {
  it("leftoverQuantity floors at 0 rather than going negative", () => {
    expect(leftoverQuantity(20, 14)).toBe(6);
    expect(leftoverQuantity(10, 12)).toBe(0);
  });

  it("needsReconciliation lists tracked lines where delivered != used and not yet reconciled", () => {
    const settled = makeItem({
      id: "mi-1",
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const leftover = makeItem({
      id: "mi-2",
      materials_item_baselines: [{ id: "b2", materials_item_id: "mi-2", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const alreadyReconciled = makeItem({
      id: "mi-3",
      reconciled_at: "2026-08-01",
      materials_item_baselines: [{ id: "b3", materials_item_id: "mi-3", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [
      delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 20, unit: "ton" }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: "mi-2", quantity: 20, unit: "ton" }), "delivered"),
      delivery(makeOrderItem({ materials_item_id: "mi-3", quantity: 20, unit: "ton" }), "delivered"),
    ];
    const logs = [
      makeUsage({ materials_item_id: "mi-1", quantity: 20 }), // fully used, settled
      makeUsage({ materials_item_id: "mi-2", quantity: 14 }), // 6 leftover
      makeUsage({ materials_item_id: "mi-3", quantity: 14 }), // leftover, but already reconciled
    ];
    const result = needsReconciliation([settled, leftover, alreadyReconciled], deliveries, logs);
    expect(result.map((l) => l.id)).toEqual(["mi-2"]);
  });

  it("never nags reconciliation for an untracked (Don't Track) line", () => {
    const untrackedLeftover = makeItem({
      id: "mi-1",
      tracked: false,
      materials_item_baselines: [{ id: "b1", materials_item_id: "mi-1", quantity: 24, unit_cost: 1, unit: "ton", reason: null, created_at: "2026-01-01" }],
    });
    const deliveries = [delivery(makeOrderItem({ materials_item_id: "mi-1", quantity: 20, unit: "ton" }), "delivered")];
    const logs = [makeUsage({ materials_item_id: "mi-1", quantity: 14 })]; // 6 leftover, but untracked
    expect(needsReconciliation([untrackedLeftover], deliveries, logs)).toEqual([]);
  });
});

describe("material alerts — compact summary rules", () => {
  const settings = { overOrderMarginPct: 10, notOrderedAlertDays: 3 };
  const now = new Date("2026-06-10T09:00:00");
  const started = { estimated_duration_days: null, actual_start_date: null, actual_end_date: null, scheduled_start_date: "2026-06-09" };
  const dl = (item: MaterialOrderItem, orderStatus: "ordered" | "delivered" | "delayed" = "ordered") => ({ item, orderStatus });

  it("not ordered needs an estimate above 0 and a start date inside the lead-time window", () => {
    const priced = makeItem({ id: "a", quantity: 10 });
    const blank = makeItem({ id: "b", quantity: 0 });
    const alerts = materialAlerts(started, [priced, blank], [], [], settings, now);
    expect(alerts.filter((a) => a.key === "not_ordered").map((a) => a.lineId)).toEqual(["a"]);
    const noStart = { ...started, scheduled_start_date: null };
    expect(materialAlerts(noStart, [priced], [], [], settings, now)).toEqual([]);
    const inFourDays = { ...started, scheduled_start_date: "2026-06-14" };
    expect(materialAlerts(inFourDays, [priced], [], [], settings, now)).toEqual([]);
    const inThreeDays = { ...started, scheduled_start_date: "2026-06-13" };
    expect(materialAlerts(inThreeDays, [priced], [], [], settings, now)).toHaveLength(1);
  });

  it("any matched order clears not-ordered, even one in a unit that still needs converting", () => {
    const line = makeItem({ id: "a", quantity: 800, unit: "sq ft" });
    const order = [dl(makeOrderItem({ materials_item_id: "a", quantity: 800, unit: "each" }))];
    expect(materialAlerts(started, [line], order, [], settings, now)).toEqual([]);
    expect(lineStatus(800, 0, 0, 0, hasAnyOrder(line, order))).toBe("ordered");
  });

  it("carries its section, leaves usage out, and summarises ordering in rank order", () => {
    const over = makeItem({ id: "o", section_id: "s2", quantity: 10 });
    const notOrdered1 = makeItem({ id: "n1", section_id: "s1", quantity: 5 });
    const notOrdered2 = makeItem({ id: "n2", section_id: "s1", quantity: 5 });
    const logs = [makeUsage({ materials_item_id: "o", quantity: 12 })];
    const orders = [
      { id: "ord-late", supplier: "Stone Yard", expected_delivery_date: "2026-06-08", status: "ordered" as const },
      { id: "ord-done", supplier: "Quarry", expected_delivery_date: "2026-06-01", status: "delivered" as const },
    ];
    const deliveries = [dl(makeOrderItem({ materials_item_id: "o", quantity: 10, unit: "ton", material_order_id: "ord-late" }))];
    const alerts = materialAlerts(started, [notOrdered1, over, notOrdered2], deliveries, logs, settings, now, orders);
    // 0168: no per-delivery alerts — a late delivery is a note on the purchase.
    expect(alerts.map((a) => a.key)).toEqual(["not_ordered", "not_ordered"]);
    expect(alerts[0]).toMatchObject({ lineId: "n1", sectionId: "s1" });
    expect(materialAlertSummary(alerts).map((x) => x.text).join(" · ")).toBe("2 not purchased");
    expect(startContext("2026-06-09", now)).toBe("job started 1d ago");
    expect(startContext("2026-06-12", now)).toBe("job starts in 2d");
  });

  it("a line with usage tracking off still gets ordering alerts (0167)", () => {
    const off = makeItem({ id: "x", quantity: 10, tracked: false });
    expect(materialAlerts(started, [off], [], [], settings, now).map((a) => a.key)).toEqual(["not_ordered"]);
  });

  it("status helpers: ordering only for untracked lines, usage without the over flag for tracked", () => {
    expect(orderingStatus(0, 0, false)).toBe("not_ordered");
    expect(orderingStatus(5, 0)).toBe("ordered");
    expect(orderingStatus(5, 5)).toBe("delivered");
    expect(usageStatus(10, 10, 12)).toBe("used_up");
    expect(usageStatus(10, 10, 4)).toBe("in_use");
  });
});

// Quantity bug (2026-09-28): Order Sheet "Mark as ordered" wrote sq ft /
// cu yd / ft / roll / tube lines as "each", so the tracker couldn't match
// them — Ordered and Delivered read 0 (and delivered cost $0).
import { guessMaterialOrderUnit } from "./orderSheet";
describe("Mark as ordered keeps the line's unit, so the tracker counts it", () => {
  it("maps every unit the calculators write", () => {
    expect(["sq ft", "sf", "Sq Ft"].map(guessMaterialOrderUnit)).toEqual(["square_foot", "square_foot", "square_foot"]);
    expect(guessMaterialOrderUnit("cu yd")).toBe("cubic_yard");
    expect(guessMaterialOrderUnit("ft")).toBe("linear_foot");
    expect(["roll", "tube", "layer", "pieces"].map(guessMaterialOrderUnit)).toEqual(["roll", "tube", "layer", "each"]);
  });
  it("an order written that way counts against the line", () => {
    for (const [lineUnit, orderUnit] of [["sq ft", "square_foot"], ["cu yd", "cubic_yard"], ["ft", "linear_foot"], ["roll", "roll"], ["tube", "tube"]] as const) {
      const line = makeItem({ id: "mi-u", unit: lineUnit });
      const d = [delivery(makeOrderItem({ materials_item_id: "mi-u", quantity: 350.46, unit: orderUnit as never }), "delivered")];
      expect(orderedQuantity(line, d), lineUnit).toBe(350.46);
      expect(deliveredQuantity(line, d), lineUnit).toBe(350.46);
    }
  });
});
