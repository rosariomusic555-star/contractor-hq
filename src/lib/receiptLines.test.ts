import { describe, expect, it } from "vitest";
import { mapReceiptUnit } from "./receiptLines";

describe("mapReceiptUnit", () => {
  it("maps common receipt spellings", () => {
    expect(mapReceiptUnit("TN")).toEqual({ unit: "ton", note: null });
    expect(mapReceiptUnit("Yd.")).toEqual({ unit: "cubic_yard", note: null });
    expect(mapReceiptUnit("plt")).toEqual({ unit: "pallet", note: null });
    expect(mapReceiptUnit("EA")).toEqual({ unit: "each", note: null });
  });
  it("keeps an unknown unit as a note instead of dropping it", () => {
    expect(mapReceiptUnit("sq ft")).toEqual({ unit: "each", note: "sq ft" });
    expect(mapReceiptUnit(null)).toEqual({ unit: "each", note: null });
  });
});
