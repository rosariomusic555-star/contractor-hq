import { describe, it, expect } from "vitest";
import { ceilClean, nextOrderableQuantity, roundUpToOrderable, wasteAdjustedOrderQuantity } from "./catalogOrdering";
import { quantityWithWaste, wastePercentToReach } from "./materialsMath";

// Money/quantity bugs (2026-09-28): float noise in quantity × package math
// made the Order Sheet order an extra pallet and showed 584.0999999999999.
const pallet = (sqftPerPallet: number) => ({ coverage_per_unit: sqftPerPallet, units_per_package: 1 }) as never;

describe("orderable quantities ignore float noise", () => {
  it("'Use N' then Order Sheet orders the pallets the nudge promised (300 sq ft of a 116.82/pallet paver = 3, not 4)", () => {
    const next = nextOrderableQuantity(300, pallet(116.82));
    expect(next).toBe(350.46);
    const waste = wastePercentToReach(300, next!); // 16.82%
    expect(wasteAdjustedOrderQuantity(300, waste, pallet(116.82))).toBe(350.46); // 3 pallets
    // 130 sq ft at 54/pallet: nudge 162 → orders 162, not 216.
    const n2 = nextOrderableQuantity(130, pallet(54))!;
    expect(wasteAdjustedOrderQuantity(130, wastePercentToReach(130, n2), pallet(54))).toBe(162);
  });

  it("the calculator's already-rounded quantity isn't rounded up another pallet (180 sq ft of 87.91/pallet)", () => {
    const q = roundUpToOrderable(180, pallet(87.91));
    expect(q).toBe(263.73); // 3 pallets
    expect(wasteAdjustedOrderQuantity(q, 0, pallet(87.91))).toBe(263.73); // still 3
  });

  it("no float noise in quantities", () => {
    expect(roundUpToOrderable(500, pallet(116.82))).toBe(584.1); // not 584.0999999999999
    expect(quantityWithWaste(180, 10)).toBe(198); // not 198.00000000000003
    expect(wasteAdjustedOrderQuantity(180, 10, undefined)).toBe(198); // plain ceil: not 199
    expect(wasteAdjustedOrderQuantity(100, 10, undefined)).toBe(110); // not 111
    expect(ceilClean(198.00000000000003)).toBe(198);
    expect(ceilClean(198.0001)).toBe(199); // a real remainder still rounds up
  });

  it("a real shortfall still orders the next package", () => {
    expect(roundUpToOrderable(117, pallet(116.82))).toBe(233.64);
    expect(roundUpToOrderable(0, pallet(116.82))).toBe(0);
  });
});
