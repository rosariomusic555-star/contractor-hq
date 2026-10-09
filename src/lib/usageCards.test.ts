import { describe, expect, it } from "vitest";
import type { MaterialsUsageLog } from "@/lib/api";
import { clampQty, unitWord, usageDayBars, usageStep } from "./usageCards";

const log = (id: string, qty: number, logged_at: string, line = "L1"): MaterialsUsageLog => ({
  id,
  materials_item_id: line,
  quantity: qty,
  logged_at,
  note: null,
  logged_by: null,
  photo_path: null,
  created_at: logged_at,
  updated_at: logged_at,
});

describe("usageStep", () => {
  it("uses the per-unit map, case-insensitive and singular", () => {
    expect(usageStep("ton")).toBe(0.5);
    expect(usageStep("Tons")).toBe(0.5);
    expect(usageStep("cu yd")).toBe(0.5);
    expect(usageStep("sq ft")).toBe(10);
    expect(usageStep("ft")).toBe(10);
    expect(usageStep("bags")).toBe(1);
  });
  it("steps by 1 for unknown or missing units", () => {
    expect(usageStep("tube")).toBe(1);
    expect(usageStep(null)).toBe(1);
  });
});

describe("unitWord", () => {
  it("pluralizes except for 1 and invariant units", () => {
    expect(unitWord("ton", 3)).toBe("tons");
    expect(unitWord("ton", 1)).toBe("ton");
    expect(unitWord("sq ft", 10)).toBe("sq ft");
    expect(unitWord("cu yd", 2)).toBe("cu yd");
    expect(unitWord(null, 2)).toBe("units");
  });
});

describe("clampQty", () => {
  it("never goes below 0 and fixes float steps", () => {
    expect(clampQty(-0.5)).toBe(0);
    expect(clampQty(0.1 + 0.2)).toBe(0.3);
    expect(clampQty(NaN)).toBe(0);
  });
});

describe("usageDayBars", () => {
  it("sums entries per local day, oldest first, only this line", () => {
    const bars = usageDayBars(
      [log("a", 2, "2026-10-05"), log("b", 1.5, "2026-10-06"), log("c", 1, "2026-10-06"), log("x", 9, "2026-10-06", "L2")],
      "L1",
    );
    expect(bars.map((b) => [b.day, b.quantity])).toEqual([
      ["2026-10-05", 2],
      ["2026-10-06", 2.5],
    ]);
    expect(bars[1].entries.map((e) => e.id)).toEqual(["b", "c"]);
  });
  it("keeps only the most recent days", () => {
    const logs = Array.from({ length: 20 }, (_, i) => log(`e${i}`, 1, `2026-09-${String(i + 1).padStart(2, "0")}`));
    const bars = usageDayBars(logs, "L1", 14);
    expect(bars).toHaveLength(14);
    expect(bars[13].day).toBe("2026-09-20");
  });
});
