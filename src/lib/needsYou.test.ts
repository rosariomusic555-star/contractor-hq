import { describe, it, expect } from "vitest";
import type { Invoice, Quote } from "./api";
import { depositItems } from "./needsYou";

const quote = (price: number, pct: number, id = "q1") =>
  ({
    id,
    status: "approved",
    project_id: `p-${id}`,
    project: { name: "Patio" },
    deposit_percentage: pct,
    updated_at: "2026-09-20T12:00:00Z",
    quote_sections: [{ quote_items: [{ quantity: 1, price, is_optional: false, client_selected: true }] }],
  }) as unknown as Quote;

describe("depositItems (Needs you: quote approved — needs deposit)", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  it("asks for the deposit amount", () => {
    const [item] = depositItems([quote(10000, 30)], [] as Invoice[], now);
    expect(item.subtitle).toBe("Patio · $3,000.00 (30%)");
  });
  it("skips a $0 quote or a 0% deposit — nothing to bill", () => {
    expect(depositItems([quote(0, 50, "a"), quote(5000, 0, "b")], [] as Invoice[], now)).toEqual([]);
  });
});
