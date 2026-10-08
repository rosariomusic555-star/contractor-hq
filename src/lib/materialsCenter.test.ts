import { describe, expect, it } from "vitest";
import { materialsCenterReport } from "./materialsCenter";

/* eslint-disable @typescript-eslint/no-explicit-any */
const line = (id: string, name: string, qty: number, cost: number, extra: Record<string, unknown> = {}) =>
  ({ id, name, quantity: qty, unit_cost: cost, unit: "ton", waste_percent: 0, cost_type: "material", materials_item_baselines: [], tracked: true, ...extra }) as any;
const sections = [{ id: "s1", name: "Paver Patio", feature_id: null, materials_items: [line("gravel", "Gravel", 20, 36), line("sand", "Sand", 4, 44), line("pav", "Pavers", 500, 6, { unit: "sq ft" })] }] as any;
const item = (id: string, lineId: string | null, qty: number, extra: Record<string, unknown> = {}) =>
  ({ id, material_order_id: "o1", description: lineId ?? "Misc", quantity: qty, unit: "ton", sort_order: 0, materials_item_id: lineId, unit_price: null, status: null, source: "manual", ticket_photo_path: null, ...extra }) as any;
const base = {
  project: { id: "p", status: "scheduled", scheduled_start_date: "2026-10-05", scheduled_end_date: "2026-10-09" },
  sections,
  usageLogs: [],
  suppliers: [{ id: "sup", user_id: "u", name: "Stone Co", phone: "555-1000", email: null, address: null, last_used_at: null, created_at: "" }] as any,
  catalog: [],
  delays: [],
  today: "2026-09-29",
};

describe("purchases and readiness (0168)", () => {
  it("a Delivery purchase with no date by the start is unscheduled; a Pickup never blocks; a requested quote isn't purchased", () => {
    const orders = [
      { id: "o1", supplier: "Stone Co", expected_delivery_date: null, status: "ordered", fulfillment: "delivery", material_order_items: [item("a", "pav", 500, { material_order_id: "o1", unit: "square_foot" })], created_at: "2026-09-20" },
      { id: "o2", supplier: "Yard", expected_delivery_date: null, status: "ordered", fulfillment: "pickup", material_order_items: [item("b", "gravel", 20, { material_order_id: "o2" })], created_at: "2026-09-20" },
      { id: "o3", supplier: "Sand Co", expected_delivery_date: "2026-10-01", status: "ordered", payment_status: "quote_requested", material_order_items: [item("c", "sand", 4, { material_order_id: "o3" })], created_at: "2026-09-20" },
    ] as any;
    const r = materialsCenterReport({ ...base, orders });
    expect(r.readiness.unscheduled).toEqual(["Pavers"]);
    expect(r.readiness.short).toEqual(["Sand"]);
  });
});

describe("materialsCenterReport", () => {
  it("still to order and readiness follow the pre-construction rules", () => {
    const orders = [
      // Gravel fully ordered, arriving before start; sand ordered short; pavers not at all.
      { id: "o1", supplier: "Stone Co", expected_delivery_date: "2026-10-02", status: "ordered", material_order_items: [item("a", "gravel", 20), item("b", "sand", 3)], created_at: "2026-09-20" },
    ] as any;
    const r = materialsCenterReport({ ...base, orders });
    expect(r.stillToOrder.map((l) => l.id).sort()).toEqual(["pav", "sand"]);
    expect(r.stillToOrder.find((l) => l.id === "sand")!.toOrder).toBe(1);
    expect(r.readiness.short).toHaveLength(2);
    // 0168: only lines bought for Delivery can be "unscheduled" — pavers aren't purchased yet (that's the Materials item).
    expect(r.readiness.unscheduled).toEqual([]);
    expect(r.readiness.daysToStart).toBe(6);
    expect(r.summary).toMatchObject({ lineCount: 3, fullyOrdered: 1, fullyDelivered: 0 });
    expect(r.summary.nextDelivery!.date).toBe("2026-10-02");
    expect(r.lines.find((l) => l.id === "gravel")!.usualSupplier).toBe("Stone Co");
    expect(r.suppliers[0]).toMatchObject({ name: "Stone Co", openOrders: 1 });
    expect(r.suppliers[0].contact?.phone).toBe("555-1000");
  });

  it("a partial delivery (a delivered part + an open remainder) reads Partially delivered", () => {
    const orders = [
      { id: "o1", supplier: "Stone Co", expected_delivery_date: "2026-10-02", status: "ordered", material_order_items: [item("a", "gravel", 15, { status: "delivered" }), item("a2", "gravel", 5)], created_at: "2026-09-20" },
    ] as any;
    const r = materialsCenterReport({ ...base, orders });
    const g = r.lines.find((l) => l.id === "gravel")!;
    expect(g).toMatchObject({ ordered: 20, delivered: 15, variance: null });
    expect(r.orders[0].state).toBe("partial");
    expect(r.orders[0].deliveredAmount).toBe(540);
    expect(r.orders[0].openLines).toBe(1);
  });

  it("open issues, pallets and return credits", () => {
    const orders = [
      {
        id: "o1",
        supplier: "Stone Co",
        expected_delivery_date: "2026-10-12",
        status: "delivered",
        pallets_delivered: 4,
        pallets_returned: 3,
        pallet_deposit_each: 25,
        material_order_items: [item("a", "gravel", 20, { issue: "damaged", issue_note: "2 bags torn" }), item("b", "sand", 4, { issue: "short", issue_resolved_at: "2026-10-03T00:00:00Z" })],
        created_at: "2026-09-20",
      },
    ] as any;
    const withCredit = { ...base, sections: [{ ...sections[0], materials_items: sections[0].materials_items.map((l: any) => (l.id === "gravel" ? { ...l, disposition: "returned", return_credit: 72 } : l)) }] } as any;
    const r = materialsCenterReport({ ...withCredit, orders });
    expect(r.issues.map((i) => i.kind)).toEqual(["damaged"]); // the resolved one is gone
    expect(r.pallets[0]).toMatchObject({ delivered: 4, returned: 3, outstanding: 1, charged: 100, credit: 75 });
    expect(r.credits).toEqual({ returns: 72, pallets: 75, total: 147 });
    expect(r.orders[0].state).toBe("delivered");
  });

  it("flags a pending delivery after the start date or on a rain day", () => {
    const orders = [{ id: "o1", supplier: "X", expected_delivery_date: "2026-10-07", status: "ordered", material_order_items: [item("a", "pav", 500)], created_at: "2026-09-20" }] as any;
    const r = materialsCenterReport({ ...base, orders, rainDates: new Set(["2026-10-07"]) });
    expect(r.orders[0].afterStart).toBe(true);
    expect(r.calendar.items[0]).toMatchObject({ rain: true, afterStart: true, kind: "expected" });
    expect(r.calendar.workDays).toHaveLength(5);
  });
});

describe("matchReceiptToOrderLines", () => {
  it("pairs each order line with its best receipt line, once", async () => {
    const { matchReceiptToOrderLines } = await import("./materialsCenter");
    const m = matchReceiptToOrderLines(
      [
        { description: "Techo-Bloc Blu 60 Slate Onyx", quantity: 540, unit_price: 6.05 },
        { description: "Polymeric sand HP NextGel", quantity: 8, unit_price: 42 },
      ],
      [
        { id: "pav", description: "Techo-Bloc Blu 60 Slate — Onyx Black" },
        { id: "sand", description: "Techniseal HP NextGel polymeric sand" },
        { id: "fab", description: "Geotextile fabric" },
      ],
    );
    expect(m.get("pav")!.quantity).toBe(540);
    expect(m.get("sand")!.quantity).toBe(8);
    expect(m.has("fab")).toBe(false);
  });
});
