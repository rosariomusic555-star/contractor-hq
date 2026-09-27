import { describe, expect, it } from "vitest";
import {
  clientQuoteTotal,
  effectiveOptions,
  groupFromRows,
  groupPrice,
  missingRequired,
  priceLabel,
  sectionIncluded,
  selectionRange,
  selectionsTotal,
  type SelectionGroupLike,
} from "./selections";
import { quoteTotal, type QuoteSection } from "./api";

const style: SelectionGroupLike = {
  id: "style",
  name: "Paver style",
  required: true,
  multi: false,
  options: [
    { id: "blu60", name: "Blu 60", price_delta: 0, is_default: true, cost_delta: 0 },
    { id: "grande", name: "Blu Grande", price_delta: 1250, is_default: false, cost_delta: 700 },
  ],
  picked: [],
};
const color: SelectionGroupLike = {
  id: "color",
  name: "Paver color",
  required: true,
  multi: false,
  options: [
    { id: "grey", name: "Shale Grey", price_delta: 0, is_default: false },
    { id: "brown", name: "Chestnut Brown", price_delta: 0, is_default: false },
  ],
  picked: [],
};

describe("client selections math", () => {
  it("defaults count until the client picks; picks override", () => {
    expect(groupPrice(style)).toBe(0);
    expect(groupPrice(style, ["grande"])).toBe(1250);
    expect(effectiveOptions(style).map((o) => o.id)).toEqual(["blu60"]);
    expect(selectionsTotal([style, color], { style: ["grande"] })).toBe(1250);
  });

  it("frozen approved price wins over the live pick (a CO carries later swaps)", () => {
    expect(groupPrice({ ...style, approved_price: 0, picked: ["grande"] })).toBe(0);
  });

  it("required groups with no pick and no default are flagged", () => {
    expect(missingRequired([style, color]).map((g) => g.id)).toEqual(["color"]);
    expect(missingRequired([style, color], { color: ["grey"] })).toEqual([]);
  });

  it("range and labels", () => {
    expect(selectionRange([style, color])).toEqual({ min: 0, max: 1250 });
    expect(priceLabel(0)).toBe("Included");
    expect(priceLabel(1250)).toBe("+$1,250");
    expect(priceLabel(-200)).toBe("−$200");
  });

  it("optional section's selections only count when the section is kept", () => {
    expect(sectionIncluded({ is_optional: true, quote_items: [{ client_selected: false }] })).toBe(false);
    expect(sectionIncluded({ is_optional: true, quote_items: [{ client_selected: true }] })).toBe(true);
  });

  it("quoteTotal (contractor rows) and clientQuoteTotal (client shape) agree", () => {
    const rows = {
      id: "style",
      name: "Paver style",
      required: true,
      multi: false,
      approved_price: null,
      quote_selection_options: [
        { id: "blu60", name: "Blu 60", price_delta: 0, is_default: true, cost_delta: 0, sort_order: 0 },
        { id: "grande", name: "Blu Grande", price_delta: 1250, is_default: false, cost_delta: 700, sort_order: 1 },
      ],
      quote_selection_picks: [{ option_id: "grande" }],
    };
    const section = {
      id: "s",
      is_optional: false,
      quote_items: [{ price: 20000, quantity: 1, is_optional: false, client_selected: false }],
      quote_selection_groups: [rows],
    } as unknown as QuoteSection;
    expect(groupFromRows(rows).picked).toEqual(["grande"]);
    expect(quoteTotal([section])).toBe(21250);
    const client = [
      {
        is_optional: false,
        items: [{ price: 20000, quantity: 1, is_optional: false, client_selected: false }],
        selections: [{ id: "style", name: "Paver style", required: true, multi: false, options: rows.quote_selection_options, picked: ["grande"] }],
      },
    ];
    expect(clientQuoteTotal(client)).toBe(21250);
    expect(clientQuoteTotal(client, { style: ["blu60"] })).toBe(20000);
  });
});
