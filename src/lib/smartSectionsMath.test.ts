import { describe, it, expect } from "vitest";
import { SMART_SECTION_TEMPLATES } from "./smartSections";
import { numOr } from "./smartSections/numOr";
import { quantityWithWaste } from "./materialsMath";
import { wasteAdjustedOrderQuantity } from "./catalogOrdering";

const t = (id: string) => SMART_SECTION_TEMPLATES.find((x) => x.id === id)!;
const qty = (lines: { slotKey: string; quantity: number }[], k: string) => lines.find((l) => l.slotKey === k)?.quantity;

describe("Smart Section calculator math (audit 2026-09-28)", () => {
  it("a typed 0 stays 0 (it used to snap back to the default)", () => {
    expect(numOr(0, 1)).toBe(0);
    expect(numOr("0", 1)).toBe(0);
    expect(numOr("", 1)).toBe(1);
    expect(numOr(undefined, 1)).toBe(1);
    expect(numOr("abc", 1)).toBe(1);
    // 0" bedding sand → no bedding sand (was 1").
    const lines = t("paver_patio").calculate({ area: { areaSqft: 300, perimeterFt: 70 }, base_depth_in: 5, bedding_depth_in: 0 });
    expect(qty(lines, "bedding_sand")).toBe(0);
  });

  it("base coverage is sq ft per ton AT 1 INCH: 300 sq ft × 5 in ÷ 165 = 9.1 → 9.5 t", () => {
    const lines = t("paver_patio").calculate({ area: { areaSqft: 300, perimeterFt: 70 }, base_depth_in: 5, base_coverage_sqft_per_ton: 165 });
    expect(qty(lines, "base_material")).toBe(9.5);
    const tunable = t("paver_patio").tunables.find((x) => x.key === "base_coverage_sqft_per_ton")!;
    expect(tunable.unit).toMatch(/1 in deep/); // the label says what the number means
  });

  it("waste is counted once: on the line's Waste %, not also baked into the quantity", () => {
    const sod = t("sod").calculate({ area: { areaSqft: 1000, perimeterFt: null }, waste_pct: 5, sqft_per_pallet: 450 });
    const line = sod.find((l) => l.slotKey === "sod")!;
    expect(line).toMatchObject({ quantity: 2.22, wastePercent: 5 });
    // The Order Sheet then orders ceil(1000 × 1.05 / 450) = 3 pallets — same as before, once.
    expect(wasteAdjustedOrderQuantity(line.quantity, line.wastePercent!, undefined)).toBe(3);
    // Veneer: 200 sq ft + 10% = 220 to order (was 242 when waste stacked).
    const fp = t("fireplace").calculate({ footprint_sqft: 18, perimeter_ft: 18, height_ft: 10, veneer_sqft: 200, veneer_waste_pct: 10 });
    const veneer = fp.find((l) => l.slotKey === "veneer")!;
    expect(quantityWithWaste(veneer.quantity, veneer.wastePercent)).toBe(220);
  });
});
