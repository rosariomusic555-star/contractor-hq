import { describe, expect, it } from "vitest";
import {
  combinedLineName,
  liveCategoryIds,
  placeSubSuggestions,
  sectionForCategory,
  suggestedCategoryFor,
  type SubPlanSection,
} from "./possibleSubs";
import type { PossibleSub } from "./api";

const sub = (id: string, label: string, category_ids: string[], lines: PossibleSub["lines"] = []): PossibleSub => ({
  id,
  kind: "custom",
  label,
  note: null,
  category_ids,
  lines,
});
const section = (id: string, categoryId: string | null, extra: Partial<SubPlanSection> = {}): SubPlanSection => ({
  id,
  categoryId,
  isGeneral: false,
  lineNames: [],
  subIds: [],
  ...extra,
});
const general = (extra: Partial<SubPlanSection> = {}) => section("gen", null, { isGeneral: true, ...extra });
const placed = (m: Map<string, { sub: PossibleSub; alsoCategoryIds: string[] }[]>) =>
  Object.fromEntries([...m].map(([k, v]) => [k, v.map((x) => `${x.sub.id}${x.alsoCategoryIds.length ? `+${x.alsoCategoryIds.join(",")}` : ""}`)]));

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

describe("live features", () => {
  it("only features still on the job count, in the item's order", () => {
    expect(liveCategoryIds(sub("1", "Gas line", ["ok", "gone", "fp"]), ["fp", "ok"])).toEqual(["ok", "fp"]);
  });
});

describe("placeSubSuggestions", () => {
  const job = ["fp", "ok"];
  const plan = [section("s-fp", "fp"), section("s-ok", "ok"), general()];

  it("a one-feature item goes on its feature's section", () => {
    expect(placed(placeSubSuggestions([sub("1", "Electrical", ["ok"])], plan, job))).toEqual({ "s-ok": ["1"] });
  });
  it("General gets unlinked items and ones whose features all left the job", () => {
    const subs = [sub("1", "Tree removal", []), sub("2", "Electrical", ["gone"])];
    expect(placed(placeSubSuggestions(subs, plan, job))).toEqual({ gen: ["1", "2"] });
  });
  it("a multi-feature item shows once, on the first linked section in plan order, with the rest as Also for", () => {
    expect(placed(placeSubSuggestions([sub("1", "Gas line", ["ok", "fp"])], plan, job))).toEqual({ "s-fp": ["1+ok"] });
  });
  it("falls back to General when none of its features has a section", () => {
    expect(placed(placeSubSuggestions([sub("1", "Gas line", ["ok", "fp"])], [general()], job))).toEqual({ gen: ["1+ok,fp"] });
  });
  it("disappears everywhere once any line in the plan was added from it", () => {
    const p = [section("s-fp", "fp"), section("s-ok", "ok", { subIds: ["1"] }), general()];
    expect(placed(placeSubSuggestions([sub("1", "Gas line", ["fp", "ok"])], p, job))).toEqual({});
  });
  it("a line saved in another of the job's plans counts as added; one in this plan follows the draft", () => {
    const elsewhere = sub("1", "Gas line", ["fp"], [{ id: "l", section_id: "other-plan-section" }]);
    expect(placed(placeSubSuggestions([elsewhere], plan, job))).toEqual({});
    const deletedHere = sub("2", "Gas line", ["fp"], [{ id: "l", section_id: "s-fp" }]);
    expect(placed(placeSubSuggestions([deletedHere], plan, job))).toEqual({ "s-fp": ["2"] });
  });
  it("still hides a one-feature item added before 0160 (same-name line, no id)", () => {
    const p = [section("s-ok", "ok", { lineNames: ["gas line"] }), general()];
    expect(placed(placeSubSuggestions([sub("1", "Gas line", ["ok"])], p, job))).toEqual({});
  });
});

describe("adding a multi-feature item", () => {
  it("one line names every feature", () => {
    expect(combinedLineName("Gas line", ["Fire Pit", "Outdoor Kitchen"])).toBe("Gas line (Fire Pit, Outdoor Kitchen)");
  });
  it("a split line goes on its feature's section, else General", () => {
    const plan = [section("s-fp", "fp"), general()];
    expect(sectionForCategory(plan, "fp")?.id).toBe("s-fp");
    expect(sectionForCategory(plan, "ok")?.id).toBe("gen");
  });
});
