import { describe, expect, it } from "vitest";
import { subsForSection, suggestedCategoryFor } from "./possibleSubs";
import type { PossibleSub } from "./api";

const sub = (id: string, label: string, category_id: string | null): PossibleSub => ({ id, kind: "custom", label, note: null, category_id });

describe("suggestedCategoryFor", () => {
  const types = [
    { id: "fp", name: "Fire Pit" },
    { id: "ok", name: "Outdoor Kitchen" },
  ];
  it("links a preset to the first matching type on the job", () => {
    expect(suggestedCategoryFor("gas_line", types)).toBe("ok");
    expect(suggestedCategoryFor("gas_line", [{ id: "fp", name: "fire pit" }])).toBe("fp");
  });
  it("is General (null) with no match", () => {
    expect(suggestedCategoryFor("tree_removal", types)).toBeNull();
    expect(suggestedCategoryFor("irrigation", types)).toBeNull();
  });
});

describe("subsForSection", () => {
  const subs = [sub("1", "Gas line", "ok"), sub("2", "Tree removal", null), sub("3", "Electrical", "gone")];
  const job = ["ok", "fp"];
  it("matches a feature section by type", () => {
    expect(subsForSection(subs, { categoryId: "ok", isGeneral: false, lineNames: [] }, job).map((s) => s.id)).toEqual(["1"]);
  });
  it("General gets unlinked subs and ones whose type left the job", () => {
    expect(subsForSection(subs, { categoryId: null, isGeneral: true, lineNames: [] }, job).map((s) => s.id)).toEqual(["2", "3"]);
  });
  it("hides a sub already added as a line", () => {
    expect(subsForSection(subs, { categoryId: "ok", isGeneral: false, lineNames: ["gas line"] }, job)).toEqual([]);
  });
});
