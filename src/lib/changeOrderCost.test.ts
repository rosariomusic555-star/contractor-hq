import { describe, it, expect } from "vitest";
import { changeOrderDraftTotal } from "./changeOrderCost";

// Money bug (2026-09-28): the change order builder showed "Sales tax 6.25%"
// and a taxed total the contractor would quote, but the saved amount — what
// the client's page, the contract and the invoice use — was the untaxed
// subtotal. The shown total is now exactly what's charged.
describe("change order total = what's charged", () => {
  it("is Σ quantity × price, no tax on top", () => {
    const sections = [{ items: [{ price: 500, quantity: 2 }] }, { items: [{ price: 0.1, quantity: 3 }] }];
    expect(changeOrderDraftTotal(sections)).toBe(1000.3); // not 1000.3 × 1.0625
  });
  it("credits stay negative; blanks count as 0; float noise is rounded off", () => {
    expect(changeOrderDraftTotal([{ items: [{ price: -2400, quantity: 1 }] }])).toBe(-2400);
    expect(changeOrderDraftTotal([{ items: [{ price: NaN, quantity: 2 }, { price: 19.99, quantity: 3 }] }])).toBe(59.97);
  });
});
