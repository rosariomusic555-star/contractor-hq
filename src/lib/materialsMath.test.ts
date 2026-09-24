import { describe, expect, it } from "vitest";
import {
  materialLineLabel,
  materialsLineTotal,
  normalizeMaterialUnit,
  quantityWithWaste,
  wastePercentToReach,
} from "./materialsMath";
import { materialsCogs } from "./api";
import { nextOrderableQuantity } from "./catalogOrdering";

describe("waste math", () => {
  it("required quantity = quantity × (1 + waste%)", () => {
    expect(quantityWithWaste(230, 5)).toBeCloseTo(241.5);
    expect(quantityWithWaste(230, 0)).toBe(230);
    expect(quantityWithWaste(230, null)).toBe(230);
    expect(quantityWithWaste("", 5)).toBe(0);
  });

  it("drives the line total and materialsCogs", () => {
    expect(materialsLineTotal({ quantity: 100, unit_cost: 2, waste_percent: 10 })).toBeCloseTo(220);
    const sections = [{ materials_items: [{ quantity: 100, unit_cost: 2, waste_percent: 10 }, { quantity: 5, unit_cost: 7, waste_percent: 0 }] }];
    expect(materialsCogs(sections as never)).toBeCloseTo(255);
  });

  it("'Use N' picks the waste % that lands on N, and the nudge then goes away", () => {
    const specs = { coverage_per_unit: 1, units_per_package: 116.82 };
    const adjusted = quantityWithWaste(230, 5); // 241.5
    const next = nextOrderableQuantity(adjusted, specs)!;
    expect(next).toBeCloseTo(350.46);
    const waste = wastePercentToReach(230, next);
    expect(waste).toBeCloseTo(52.37, 2);
    expect(nextOrderableQuantity(quantityWithWaste(230, waste), specs)).toBeNull();
  });
});

describe("units", () => {
  it("maps known spellings onto the dropdown options", () => {
    expect(normalizeMaterialUnit("sf")).toBe("sq ft");
    expect(normalizeMaterialUnit(" SQFT ")).toBe("sq ft");
    expect(normalizeMaterialUnit("ea")).toBe("piece");
    expect(normalizeMaterialUnit("Bags")).toBe("bag");
    expect(normalizeMaterialUnit("tons")).toBe("ton");
  });

  it("keeps anything else as a custom unit, never losing it", () => {
    expect(normalizeMaterialUnit("cy")).toBe("cy");
    expect(normalizeMaterialUnit("linear ft")).toBe("linear ft");
    expect(normalizeMaterialUnit(null)).toBe("");
  });
});

describe("materialLineLabel", () => {
  it("adds the color when set", () => {
    expect(materialLineLabel({ name: "Blu 60 Slate", color: "Onyx Black" })).toBe("Blu 60 Slate — Onyx Black");
    expect(materialLineLabel({ name: "Blu 60 Slate", color: " " })).toBe("Blu 60 Slate");
  });
});
