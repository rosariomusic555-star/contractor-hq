import { describe, expect, it, beforeEach } from "vitest";
import {
  configBuildType,
  configSummary,
  configTotals,
  describeFormula,
  formulaQuantity,
  keyFrom,
  quickQuoteFromConfig,
  setTypeConfigs,
  smartTemplateFromConfig,
  type TypeConfig,
} from "./typeConfig";
import { configFromBuiltIn } from "./typeConfigPresets";
import { featureKindOf, featureSummary, groupKeyOf, measurementGroupsFor, normalizeData, computeTotals } from "./measurements";
import { findQuickQuoteTemplate } from "./quickQuote";
import { findSmartSectionTemplate, resolveEffectiveLineItems } from "./smartSections";

const mulch: TypeConfig = {
  category_id: "mulch",
  based_on: null,
  fields: [
    { key: "beds", kind: "area", label: "Bed area" },
    { key: "edging", kind: "runs", label: "Edging" },
    { key: "depth", kind: "depth", label: "Depth" },
    { key: "color", kind: "select", label: "Color", options: ["Black", "Brown"] },
  ],
  summary_keys: ["beds", "color"],
  line_items: [
    { id: "l1", name: "Mulch", cost_type: "material", formula: { total: "beds", op: "per", factor: { tunable: "sqft_per_yard" }, round: "up" } },
    { id: "l2", name: "Steel edging", cost_type: "material", formula: { total: "edging", op: "times", factor: 1.1, round: "none" } },
    { id: "l3", name: "Delivery", cost_type: "subcontractor", formula: { total: null, op: "times", factor: 1, round: "none" } },
    { id: "l4", name: "Weed fabric", cost_type: "material", formula: null },
  ],
  tunables: [{ key: "sqft_per_yard", label: "Coverage per yard", unit: "sq ft", value: 100 }],
  quick_quote: { total_key: "beds", rate: 2.5, unit_label: "sf" },
};
const data = { cfg: "mulch", values: { beds: { mode: "dims", length_ft: 20, width_ft: 15, sqft: null }, edging: [30, 12.5], depth: 3, color: "Black" } };

beforeEach(() => setTypeConfigs([{ config: mulch, label: "Mulch beds" }]));

describe("custom type setups", () => {
  it("totals and summary from the building blocks", () => {
    expect(configTotals(mulch, data)).toEqual({ beds: 300, edging: 42.5, depth: 3 });
    expect(configSummary(mulch, data)).toBe("300 sq ft · Black");
  });

  it("formulas: total ÷ tunable rounded up, total × factor, fixed", () => {
    const totals = configTotals(mulch, data);
    const tun = { sqft_per_yard: 100 };
    expect(formulaQuantity(mulch.line_items[0].formula!, totals, tun)).toBe(3);
    expect(formulaQuantity(mulch.line_items[1].formula!, totals, tun)).toBe(46.75);
    expect(formulaQuantity(mulch.line_items[2].formula!, totals, tun)).toBe(1);
    expect(formulaQuantity(mulch.line_items[0].formula!, totals, { sqft_per_yard: 0 })).toBe(0);
    expect(describeFormula(mulch.line_items[0].formula, mulch)).toBe("Bed area ÷ Coverage per yard, rounded up");
  });

  it("becomes a Smart Section template the existing calculator can run", () => {
    const t = smartTemplateFromConfig(mulch, "Mulch beds")!;
    expect(findSmartSectionTemplate(configBuildType("mulch"))?.id).toBe("cfg:mulch");
    expect(t.questions.map((q) => q.key)).toEqual(["beds", "edging"]);
    const lines = t.calculate({ beds: 300, edging: 42.5, sqft_per_yard: 100 });
    expect(lines.map((l) => [l.slotKey, l.quantity])).toEqual([
      ["l1", 3],
      ["l2", 46.75],
      ["l3", 1],
    ]);
    expect(resolveEffectiveLineItems(t, null).find((li) => li.slot_key === "l3")?.cost_type).toBe("subcontractor");
  });

  it("becomes a Quick Quote priced per sq ft", () => {
    const q = quickQuoteFromConfig(mulch, "Mulch beds")!;
    expect(findQuickQuoteTemplate("cfg:mulch")?.defaultRate).toBe(2.5);
    expect(q.pricingUnit).toBe("$ / sq ft");
    expect(q.quantity({ beds: 300 })).toBe(300);
  });

  it("the measurement card: a cat: group of kind config, instances saved as cfg:", () => {
    const [g] = measurementGroupsFor(["mulch"], [{ id: "mulch", name: "Mulch beds" }]);
    expect(g).toMatchObject({ key: "cat:mulch", kind: "config", category_id: "mulch" });
    expect(featureKindOf("cfg:mulch")).toBe("config");
    expect(groupKeyOf({ build_type: "cfg:mulch" })).toBe("cat:mulch");
    const d = normalizeData("config", data);
    expect(computeTotals("config", d)).toEqual({ beds: 300, edging: 42.5, depth: 3 });
    expect(featureSummary({ kind: "config", build_type: null }, [{ data: d, label: null }], [])).toBe("300 sq ft · Black");
  });

  it("a type whose name matches a built-in keeps the built-in card", () => {
    setTypeConfigs([{ config: { ...mulch, category_id: "pp" }, label: "Paver Patio" }]);
    expect(measurementGroupsFor(["pp"], [{ id: "pp", name: "Paver Patio" }])[0].kind).toBe("patio");
  });

  it("copies a built-in type as a starting setup", () => {
    const c = configFromBuiltIn("x", "paver_patio");
    expect(c.fields[0]).toMatchObject({ kind: "area" });
    expect(c.line_items.map((l) => l.name)).toContain("Geotextile Fabric");
    expect(c.tunables.find((t) => t.key === "geotextile_coverage_sqft_per_roll")?.value).toBe(900);
    expect(c.quick_quote).toMatchObject({ total_key: "area" });
  });

  it("keys from labels never collide", () => {
    expect(keyFrom("Bed area", ["bed_area"])).toBe("bed_area_2");
  });
});
