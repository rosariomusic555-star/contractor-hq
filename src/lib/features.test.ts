import { describe, expect, it } from "vitest";
import { featureSortUpdates, moveId, orderCategoryIdsByFeatures, type ProjectFeature } from "./features";

const f = (id: string, category_id: string | null, sort_order: number, status: ProjectFeature["status"] = "active"): ProjectFeature => ({
  id,
  project_id: "p",
  category_id,
  label: null,
  status,
  source_quote_id: null,
  sort_order,
  created_at: `2026-09-0${sort_order + 1}T00:00:00Z`,
});

describe("orderCategoryIdsByFeatures", () => {
  it("orders types by their features' sort_order", () => {
    const features = [f("1", "patio", 2), f("2", "steps", 0), f("3", "firepit", 1)];
    expect(orderCategoryIdsByFeatures(["patio", "firepit", "steps"], features)).toEqual(["steps", "firepit", "patio"]);
  });

  it("keeps the added order for types with no feature yet (no stored order)", () => {
    expect(orderCategoryIdsByFeatures(["b", "a"], [])).toEqual(["b", "a"]);
    expect(orderCategoryIdsByFeatures(["new", "patio"], [f("1", "patio", 0)])).toEqual(["patio", "new"]);
  });

  it("ignores removed features", () => {
    const features = [f("1", "patio", 0, "removed"), f("2", "steps", 1)];
    expect(orderCategoryIdsByFeatures(["patio", "steps"], features)).toEqual(["steps", "patio"]);
  });
});

describe("featureSortUpdates", () => {
  it("renumbers features to the new type order, moving a type's features together", () => {
    const features = [f("w1", "wall", 0), f("w2", "wall", 1), f("s", "steps", 2)];
    expect(featureSortUpdates(features, ["steps", "wall"])).toEqual([
      { id: "s", sort_order: 0 },
      { id: "w1", sort_order: 1 },
      { id: "w2", sort_order: 2 },
    ]);
  });

  it("writes nothing when the order is unchanged", () => {
    expect(featureSortUpdates([f("a", "x", 0), f("b", "y", 1)], ["x", "y"])).toEqual([]);
  });

  it("puts removed features last, so a re-checked type comes back at the end", () => {
    const features = [f("old", "patio", 0, "removed"), f("s", "steps", 1)];
    expect(featureSortUpdates(features, ["steps"])).toEqual([
      { id: "s", sort_order: 0 },
      { id: "old", sort_order: 1 },
    ]);
  });
});

describe("moveId", () => {
  it("moves an item and ignores out-of-range moves", () => {
    expect(moveId(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
