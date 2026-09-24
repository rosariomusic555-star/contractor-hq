import { describe, expect, it } from "vitest";
import { autoMatchedSheetSections, linkedSheetSections, sectionMargin, sheetSectionsCost } from "./quoteSectionMaterials";

const sheet = [
  { id: "m1", name: "Patio", job_category_id: "paver", materials_items: [{ quantity: 100, unit_cost: 10, waste_percent: 0 }] },
  { id: "m2", name: "Outdoor Kitchen", job_category_id: "kitchen", materials_items: [{ quantity: 10, unit_cost: 50, waste_percent: 10 }] },
  { id: "m3", name: "Walkway", job_category_id: null, materials_items: [{ quantity: 1, unit_cost: 200 }] },
];

describe("auto-matching", () => {
  it("matches by project type", () => {
    expect(autoMatchedSheetSections({ name: "Backyard Paver Patio", job_category_id: "paver" }, sheet).map((s) => s.id)).toEqual(["m1"]);
  });
  it("falls back to the same name when there's no type match", () => {
    expect(autoMatchedSheetSections({ name: " walkway ", job_category_id: null }, sheet).map((s) => s.id)).toEqual(["m3"]);
    expect(autoMatchedSheetSections({ name: "Walkway", job_category_id: "fire_pit" }, sheet).map((s) => s.id)).toEqual(["m3"]);
  });
  it("matches nothing when neither type nor name lines up", () => {
    expect(autoMatchedSheetSections({ name: "Fire pit", job_category_id: "fire_pit" }, sheet)).toEqual([]);
  });
});

describe("linkedSheetSections", () => {
  it("manual mode uses the picks, ignoring any that aren't on the current sheet (stale)", () => {
    const q = { name: "Patio", job_category_id: "paver", materials_link_mode: "manual" as const };
    expect(linkedSheetSections(q, ["m2", "deleted-or-other-sheet"], sheet).map((s) => s.id)).toEqual(["m2"]);
    expect(linkedSheetSections(q, [], sheet)).toEqual([]);
  });
  it("auto mode follows the live match", () => {
    expect(linkedSheetSections({ name: "x", job_category_id: "kitchen", materials_link_mode: "auto" }, ["m1"], sheet).map((s) => s.id)).toEqual(["m2"]);
  });
});

describe("cost and margin", () => {
  it("sums waste-adjusted material cost", () => {
    expect(sheetSectionsCost([sheet[0], sheet[1]])).toBeCloseTo(1000 + 550);
  });
  it("margin is against the quote section's price; null with no price", () => {
    expect(sectionMargin(6000, 3765)).toEqual({ profit: 2235, marginPct: (2235 / 6000) * 100 });
    expect(sectionMargin(0, 100).marginPct).toBeNull();
  });
});
