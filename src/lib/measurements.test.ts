import { describe, it, expect } from "vitest";
import { BUILD_TYPES } from "./buildTypes";
import {
  BUILD_TYPE_MEASUREMENTS,
  buildTypeForCategoryName,
  fieldVisible,
  measurementGroupsFor,
  measurementValuesFor,
  totalAreaSqft,
  type MeasurementRow,
} from "./measurements";

const row = (p: Partial<MeasurementRow>): MeasurementRow => ({
  id: Math.random().toString(),
  project_id: "p",
  build_type: null,
  category_id: null,
  field_key: "custom_x",
  label: null,
  value: null,
  value_text: null,
  unit: "sq_ft",
  sort_order: 0,
  ...p,
});

describe("measurements config", () => {
  it("every build type has a field mapping", () => {
    for (const b of BUILD_TYPES) expect(BUILD_TYPE_MEASUREMENTS[b.id]?.length).toBeGreaterThan(0);
  });

  it("matches the default Job Category names to build types", () => {
    expect(buildTypeForCategoryName("Paver Patio")?.id).toBe("paver_patio");
    expect(buildTypeForCategoryName("Fire Pit / Fireplace")?.id).toBe("fire_pit");
    expect(buildTypeForCategoryName("Retaining Wall")?.id).toBe("retaining_wall");
    expect(buildTypeForCategoryName("steps")?.id).toBe("steps");
    expect(buildTypeForCategoryName("Drainage")).toBeNull();
    expect(buildTypeForCategoryName("Other / Uncategorized")).toBeNull();
  });

  it("builds one group per selected type, merging duplicates and keeping unmapped ones", () => {
    const cats = [
      { id: "a", name: "Paver Patio" },
      { id: "b", name: "Patio" },
      { id: "c", name: "Drainage" },
    ];
    const groups = measurementGroupsFor(["a", "b", "c"], cats);
    expect(groups.map((g) => g.key)).toEqual(["bt:paver_patio", "cat:c"]);
    expect(groups[1].fields).toEqual([]);
  });

  it("shows fire pit dimensions by shape", () => {
    const [, diameter, width] = BUILD_TYPE_MEASUREMENTS.fire_pit;
    const round = [row({ field_key: "shape", value_text: "round" })];
    expect(fieldVisible(diameter, round)).toBe(true);
    expect(fieldVisible(width, round)).toBe(false);
  });

  it("totals sq ft only across visible groups", () => {
    const rows = [
      row({ build_type: "paver_patio", field_key: "area_sqft", value: 400 }),
      row({ build_type: "walkway", field_key: "area_sqft", value: 100 }),
      row({ field_key: "custom_1", value: 50 }),
      row({ build_type: "seating_wall", field_key: "length_lf", value: 20, unit: "linear_ft" }),
    ];
    expect(totalAreaSqft(rows, new Set(["bt:paver_patio", "bt:seating_wall", "general"]))).toBe(450);
    expect(totalAreaSqft([], new Set())).toBeNull();
  });

  it("exposes prefill values per build type", () => {
    const rows = [
      row({ build_type: "fire_pit", field_key: "shape", value_text: "round", unit: null }),
      row({ build_type: "fire_pit", field_key: "diameter_ft", value: 6, unit: "ft" }),
      row({ build_type: "fire_pit", field_key: "custom_1", value: 3 }),
    ];
    expect(measurementValuesFor(rows, "fire_pit")).toEqual({ shape: "round", diameter_ft: 6 });
  });
});
