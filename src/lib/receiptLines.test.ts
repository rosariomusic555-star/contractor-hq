import { describe, expect, it } from "vitest";
import { mapReceiptUnit } from "./receiptLines";

describe("mapReceiptUnit", () => {
  it("maps common receipt spellings", () => {
    expect(mapReceiptUnit("TN")).toEqual({ unit: "ton", note: null });
    expect(mapReceiptUnit("Yd.")).toEqual({ unit: "cubic_yard", note: null });
    expect(mapReceiptUnit("plt")).toEqual({ unit: "pallet", note: null });
    expect(mapReceiptUnit("EA")).toEqual({ unit: "each", note: null });
    // The 0142 units.
    expect(mapReceiptUnit("sq ft")).toEqual({ unit: "square_foot", note: null });
    expect(mapReceiptUnit("SF")).toEqual({ unit: "square_foot", note: null });
    expect(mapReceiptUnit("rolls")).toEqual({ unit: "roll", note: null });
    expect(mapReceiptUnit("tube")).toEqual({ unit: "tube", note: null });
  });
  it("keeps an unknown unit as a note instead of dropping it", () => {
    expect(mapReceiptUnit("gal")).toEqual({ unit: "each", note: "gal" });
    expect(mapReceiptUnit(null)).toEqual({ unit: "each", note: null });
  });
});
