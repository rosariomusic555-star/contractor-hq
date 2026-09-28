import { describe, it, expect } from "vitest";
import { quoteTotal, type QuoteSection } from "./api";
import { seedOptionalSelection, selectionWrites } from "./sharedQuoteSelection";

// Money bug (2026-09-28): the share-link page kept the client's optional
// choices in local state only and started everything ticked — the signed
// total and the deposit invoice (which read the SAVED client_selected) still
// included the optional work the client had dropped.

const sec = (p: Partial<QuoteSection> & { items: { id: string; price: number; quantity?: number; is_optional?: boolean; client_selected: boolean }[] }) =>
  ({ id: "s", name: "S", is_optional: false, sort_order: 0, quote_id: "q", ...p, quote_items: p.items.map((i) => ({ is_optional: false, quantity: 1, ...i })) }) as unknown as QuoteSection & { items: { id: string; is_optional: boolean; client_selected: boolean }[] };

describe("share-link optional choices", () => {
  const base = sec({ id: "base", items: [{ id: "patio", price: 20000, client_selected: true }] });
  const optItem = sec({ id: "mixed", items: [{ id: "lights", price: 5000, is_optional: true, client_selected: false }] });
  const optSection = sec({ id: "kitchen", is_optional: true, items: [{ id: "k1", price: 8000, client_selected: true }, { id: "k2", price: 2000, client_selected: false }] });

  it("starts from what's saved, not everything ticked", () => {
    const seed = seedOptionalSelection([base, optItem, optSection].map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, is_optional: !!i.is_optional })) })));
    expect(seed.items).toEqual({ lights: false, k1: true, k2: false });
    expect(seed.sections).toEqual({ kitchen: true });
  });

  it("a section toggle saves every item in it; an item saves itself; required items never", () => {
    expect(selectionWrites({ ...optSection, items: optSection.items.map((i) => ({ ...i, is_optional: false })) }, { kind: "section" }, false)).toEqual([
      { itemId: "k1", selected: false },
      { itemId: "k2", selected: false },
    ]);
    expect(selectionWrites({ ...optItem, items: [{ id: "lights", is_optional: true, client_selected: false }] }, { kind: "item", itemId: "lights" }, true)).toEqual([{ itemId: "lights", selected: true }]);
    expect(selectionWrites({ ...base, items: [{ id: "patio", is_optional: false, client_selected: true }] }, { kind: "item", itemId: "patio" }, false)).toEqual([]);
  });

  it("the signed total and deposit leave out optional work the client dropped", () => {
    // $20k base + $5k optional lights the client unticked (saved as not selected).
    const total = quoteTotal([base, optItem]);
    expect(total).toBe(20000);
    expect((total * 30) / 100).toBe(6000); // 30% deposit — not $7,500
    // Ticking it back in adds it.
    expect(quoteTotal([base, sec({ id: "mixed", items: [{ id: "lights", price: 5000, is_optional: true, client_selected: true }] })])).toBe(25000);
  });
});
