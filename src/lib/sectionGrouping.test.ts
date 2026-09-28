import { describe, it, expect } from "vitest";
import { groupByType, insertIndexForType, regroupIfAutoAppended } from "./sectionGrouping";

type S = { n: string; k: string | null; g?: boolean };
const key = (s: S) => s.k;
const general = (s: S) => !!s.g;
const names = (xs: S[] | null) => xs?.map((x) => x.n) ?? null;

// The reported test project: SW2 and FP2 appended at the bottom, above General.
const bug: S[] = [
  { n: "Patio", k: "patio" },
  { n: "Kitchen", k: "kitchen" },
  { n: "SW1", k: "sw" },
  { n: "Retaining", k: "rw" },
  { n: "FP1", k: "fp" },
  { n: "Driveway", k: "dw" },
  { n: "Lighting", k: "light" },
  { n: "Steps", k: "steps" },
  { n: "SW2", k: "sw" },
  { n: "FP2", k: "fp" },
  { n: "General", k: null, g: true },
];

describe("section grouping by feature type", () => {
  it("groups each type together, in order, others keep their place", () => {
    expect(names(groupByType(bug.slice(0, 10), key))).toEqual(["Patio", "Kitchen", "SW1", "SW2", "Retaining", "FP1", "FP2", "Driveway", "Lighting", "Steps"]);
  });

  it("a new instance goes right after the last of its type; a new type just above General", () => {
    const grouped = [...groupByType(bug.slice(0, 10), key), bug[10]];
    expect(insertIndexForType(grouped, "sw", key, general)).toBe(4);
    expect(insertIndexForType(grouped, "pergola", key, general)).toBe(10);
    expect(insertIndexForType([{ n: "A", k: "a" }], "b", key)).toBe(1);
  });

  it("fixes the old appended-at-the-bottom layout, General stays last", () => {
    expect(names(regroupIfAutoAppended(bug, key, general))).toEqual([
      "Patio", "Kitchen", "SW1", "SW2", "Retaining", "FP1", "FP2", "Driveway", "Lighting", "Steps", "General",
    ]);
  });

  it("pulls a late instance up past a custom section added in between", () => {
    const xs: S[] = [{ n: "Patio", k: "patio" }, { n: "SW1", k: "sw" }, { n: "Custom", k: null }, { n: "SW2", k: "sw" }];
    expect(names(regroupIfAutoAppended(xs, key))).toEqual(["Patio", "SW1", "SW2", "Custom"]);
  });

  it("leaves already-grouped and hand-arranged orders alone", () => {
    expect(regroupIfAutoAppended(groupByType(bug, key), key, general)).toBeNull();
    // A custom section after the first out-of-place one — the old code never
    // put anything but feature sections there, so a person arranged this.
    const manual: S[] = [{ n: "SW1", k: "sw" }, { n: "FP1", k: "fp" }, { n: "SW2", k: "sw" }, { n: "My notes", k: null }];
    expect(regroupIfAutoAppended(manual, key)).toBeNull();
  });
});
