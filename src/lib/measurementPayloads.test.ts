import { describe, expect, it } from "vitest";
import { customMeasurementPayload, featureMeasurementPayload, type FeatureInstance, type MeasurementRow } from "./measurements";

// A row as listFeatureMeasurements() loads it (select "*") vs a brand-new one.
const loaded = {
  id: "a",
  project_id: "p",
  build_type: "paver_patio",
  feature_id: "f1",
  label: "Back",
  data: { areas: [] },
  totals: { sqft: 100 },
  sort_order: 0,
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
} as unknown as FeatureInstance;
const fresh: FeatureInstance = { id: "b", project_id: "", build_type: "outdoor_kitchen", label: null, data: {} as never, totals: {}, sort_order: 0 };

describe("measurement write payloads", () => {
  it("never carry created_at / updated_at", () => {
    const p = featureMeasurementPayload(loaded, "p");
    expect(p).not.toHaveProperty("created_at");
    expect(p).not.toHaveProperty("updated_at");
  });

  it("give new and loaded rows the same keys, so a mixed batch never NULLs a column", () => {
    expect(Object.keys(featureMeasurementPayload(fresh, "p")).sort()).toEqual(Object.keys(featureMeasurementPayload(loaded, "p")).sort());
    expect(featureMeasurementPayload(fresh, "p")).toMatchObject({ project_id: "p", feature_id: null, label: null });
  });

  it("whitelist custom measurement columns", () => {
    const row = { id: "c", project_id: "", build_type: null, category_id: "cat", field_key: "x", label: "Gate", value: 3, value_text: null, unit: "ft", sort_order: 1, created_at: "t" } as unknown as MeasurementRow;
    expect(customMeasurementPayload(row, "p")).toEqual({
      id: "c",
      project_id: "p",
      build_type: null,
      category_id: "cat",
      field_key: "x",
      label: "Gate",
      value: 3,
      value_text: null,
      unit: "ft",
      sort_order: 1,
    });
  });
});
