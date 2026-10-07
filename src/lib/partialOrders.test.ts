import { describe, expect, it } from "vitest";
import { lineStatusLabel, partiallyOrdered } from "./materialTracking";
import { unitFor } from "./materialsMath";

describe("partial orders", () => {
  it("is partial only while some but not all is ordered", () => {
    expect(partiallyOrdered(6, 0)).toBe(false);
    expect(partiallyOrdered(6, 4)).toBe(true);
    expect(partiallyOrdered(6, 6)).toBe(false);
    expect(partiallyOrdered(6, 8)).toBe(false);
  });
  it("labels the chip Partially ordered", () => {
    expect(lineStatusLabel("ordered", 6, 4)).toBe("Partially ordered");
    expect(lineStatusLabel("ordered", 6, 6)).toBe("Ordered");
    expect(lineStatusLabel("not_ordered", 6, 0)).toBe("Not ordered");
  });
  it("pluralizes count units only", () => {
    expect(unitFor(6, "pallet")).toBe("pallets");
    expect(unitFor(1, "pallet")).toBe("pallet");
    expect(unitFor(120, "sq ft")).toBe("sq ft");
  });
});
