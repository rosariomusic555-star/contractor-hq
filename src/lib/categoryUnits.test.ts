import { describe, expect, it } from "vitest";
import { suggestCategoryUnit, withCategoryUnit } from "./categoryUnits";
import { removeDraftLine, restoreDraftLine } from "@/hooks/use-line-delete-undo";

describe("suggestCategoryUnit", () => {
  it.each([
    ["Pavers", "sq ft"],
    ["Border pavers", "sq ft"],
    ["Wall Block", "piece"],
    ["Veneer", "sq ft"],
    ["Caps", "piece"],
    ["Coping", "piece"],
    ["Steps/Treads", "piece"],
    ["Base Gravel", "ton"],
    ["Aggregate", "ton"],
    ["Crushed stone", "ton"],
    ["Drainage gravel", "ton"],
    ["Bedding Sand", "ton"],
    ["Topsoil", "ton"],
    ["Mulch (yards)", "cu yd"],
    ["Stone & Gravel", "ton"],
    ["Polymeric Sand", "bag"],
    ["Mortar", "bag"],
    ["Concrete mix", "bag"],
    ["Geotextile fabric", "roll"],
    ["Fabric", "roll"],
    ["Edge restraint", "ft"],
    ["Edging", "ft"],
    ["Drain pipe", "ft"],
    ["Wire", "ft"],
    ["Adhesive", "tube"],
    ["Light fixtures", "piece"],
    ["Transformer", "piece"],
    ["Sod", "sq ft"],
  ])("%s → %s", (name, unit) => expect(suggestCategoryUnit(name)).toBe(unit));

  it.each(["Other", "Lighting", "Irrigation", "Plants & Soil", "Concrete & Masonry", "Lumber & Hardware", ""])(
    "%s has no usual unit",
    (name) => expect(suggestCategoryUnit(name)).toBeNull(),
  );
});

describe("withCategoryUnit", () => {
  const cats = [
    { id: "pavers", default_unit: "sq ft" },
    { id: "block", default_unit: "piece" },
    { id: "other", default_unit: null },
  ];
  const line = (over: Partial<{ material_category_id: string | null; unit: string; catalog_product_id: string | null; cost_type: string }> = {}) => ({
    cost_type: "material",
    material_category_id: null as string | null,
    unit: "",
    catalog_product_id: null as string | null,
    ...over,
  });

  it("fills an empty unit when the category is set", () => {
    expect(withCategoryUnit(line(), line({ material_category_id: "pavers" }), cats).unit).toBe("sq ft");
  });

  it("swaps the previous category's default for the new one", () => {
    const prev = line({ material_category_id: "pavers", unit: "sq ft" });
    expect(withCategoryUnit(prev, { ...prev, material_category_id: "block" }, cats).unit).toBe("piece");
  });

  it("never overwrites a unit the user chose", () => {
    const prev = line({ material_category_id: "pavers", unit: "pallet" });
    expect(withCategoryUnit(prev, { ...prev, material_category_id: "block" }, cats).unit).toBe("pallet");
  });

  it("keeps a unit set in the same edit (Catalog / Price Book pick, calculator)", () => {
    const prev = line({ material_category_id: "pavers", unit: "sq ft" });
    expect(withCategoryUnit(prev, { ...prev, material_category_id: "block", unit: "pallet" }, cats).unit).toBe("pallet");
    expect(
      withCategoryUnit(prev, { ...prev, material_category_id: "block", catalog_product_id: "p1" }, cats).unit,
    ).toBe("sq ft");
  });

  it("leaves lines alone when the category didn't change, has no default, or isn't a material", () => {
    const prev = line({ material_category_id: "pavers", unit: "" });
    expect(withCategoryUnit(prev, { ...prev }, cats).unit).toBe("");
    expect(withCategoryUnit(line(), line({ material_category_id: "other" }), cats).unit).toBe("");
    expect(withCategoryUnit(line({ cost_type: "subcontractor" }), line({ cost_type: "subcontractor", material_category_id: "pavers" }), cats).unit).toBe("");
  });

  it("gives a new line with a category and no unit the default", () => {
    expect(withCategoryUnit(undefined, line({ material_category_id: "block" }), cats).unit).toBe("piece");
    expect(withCategoryUnit(undefined, line({ material_category_id: "block", unit: "pallet" }), cats).unit).toBe("pallet");
  });
});

describe("removeDraftLine / restoreDraftLine", () => {
  const sections = [{ id: "s1", items: [{ id: "a" }, { id: "b" }, { id: "c" }] }];

  it("puts a deleted line back where it was, once", () => {
    const { sections: after, removed } = removeDraftLine(sections, "s1", "b");
    expect(after[0].items.map((i) => i.id)).toEqual(["a", "c"]);
    const restored = restoreDraftLine(after, "s1", removed!);
    expect(restored[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(restoreDraftLine(restored, "s1", removed!)[0].items).toHaveLength(3);
  });

  it("does nothing for an unknown line", () => {
    expect(removeDraftLine(sections, "s1", "zz").removed).toBeNull();
  });
});
