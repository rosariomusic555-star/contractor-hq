import { describe, expect, it } from "vitest";
import { purchasedLines } from "./materialTracking";
import { lineMaterialStatus, purchaseSplit, purchaseTitle, purchaseTotal, unpaidQuoteNeedsYouItems } from "./purchases";

/* eslint-disable @typescript-eslint/no-explicit-any */
const item = (id: string, lineId: string | null, qty: number, price: number | null = null) =>
  ({ id, material_order_id: "o", description: id, quantity: qty, unit: "each", sort_order: 0, materials_item_id: lineId, unit_price: price, status: null }) as any;

describe("supplier purchases (0168)", () => {
  it("splits the amount paid across features by line value; the parts add up exactly", () => {
    const lines = new Map([
      ["pav", { feature_id: "patio", unit_cost: 5 }],
      ["blk", { feature_id: "wall", unit_cost: 10 }],
    ]);
    const parts = purchaseSplit({ material_order_items: [item("a", "pav", 100), item("b", "blk", 50), item("c", null, 1, 0)] }, 999.99, lines);
    expect(parts.map((p) => p.feature_id)).toEqual(["patio", "wall", null]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(999.99, 2);
    expect(parts[0].amount).toBeCloseTo(500, 0);
    // Nothing to weigh by → one share.
    expect(purchaseSplit({ material_order_items: [] }, 120, lines)).toEqual([{ feature_id: null, amount: 120 }]);
  });

  it("total: amount paid, else priced lines (plan unit cost as fallback), else unknown", () => {
    expect(purchaseTotal({ amount_paid: 1380, material_order_items: [] })).toBe(1380);
    expect(purchaseTotal({ amount_paid: null, material_order_items: [item("a", "pav", 10, 4), item("b", "blk", 2)] }, new Map([["blk", 15]]))).toBe(70);
    expect(purchaseTotal({ amount_paid: null, material_order_items: [item("a", null, 10)] })).toBeNull();
    expect(purchaseTitle({ supplier: "Martin Marietta", po_number: "Q-4410" })).toBe("Martin Marietta · #Q-4410");
  });

  it("line status: Not purchased → Purchased (partial / full) → On site", () => {
    expect(lineMaterialStatus(6, 0, 0)).toBe("not_purchased");
    expect(lineMaterialStatus(6, 4, 0)).toBe("partial");
    expect(lineMaterialStatus(6, 6, 0)).toBe("purchased");
    expect(lineMaterialStatus(6, 6, 6)).toBe("on_site");
  });

  it("a requested quote hasn't bought anything — only paid purchases count", () => {
    const lines = purchasedLines([
      { status: "ordered", payment_status: "quote_requested", material_order_items: [item("a", "pav", 10)] },
      { status: "delivered", payment_status: "paid", material_order_items: [item("b", "pav", 4)] },
      { status: "ordered", material_order_items: [item("c", "pav", 1)] }, // before 0168 → paid
    ]);
    expect(lines.map((l) => l.item.id)).toEqual(["b", "c"]);
  });

  it("Needs you: one 'supplier quote not paid' per job, only before it starts", () => {
    const projects = new Map([
      ["p1", { name: "Greg Patio", status: "scheduled", scheduled_start_date: "2026-10-12" }],
      ["p2", { name: "Started job", status: "in_progress", scheduled_start_date: "2026-10-01" }],
    ]);
    const items = unpaidQuoteNeedsYouItems(
      [
        { project_id: "p1", payment_status: "quote_requested", created_at: "" },
        { project_id: "p1", payment_status: "quote_requested", created_at: "" },
        { project_id: "p2", payment_status: "quote_requested", created_at: "" },
        { project_id: "p1", payment_status: "paid", created_at: "" },
      ] as any,
      projects,
      "2026-10-07",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Supplier quote not paid yet for Greg Patio", tone: "red", subtitle: "Job starts in 5 days" });
  });
});
