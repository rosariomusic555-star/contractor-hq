import { describe, expect, it } from "vitest";
import { plannedActualReport, profitSentence, varianceTone } from "./plannedActual";
import { findSimilarJobs, averageMetric, MIN_SAMPLE } from "./similarJobs";
import { computeRecommendations, conditionMatches } from "./estimatingInsights";
import { crewSizeFromLabor } from "./jobContext";
import type { Closeout, CloseoutFeature } from "./closeout";

/* eslint-disable @typescript-eslint/no-explicit-any */
const line = (id: string, name: string, qty: number, unitCost: number, unit = "ton") =>
  ({ id, name, quantity: qty, unit_cost: unitCost, unit, waste_percent: 0, cost_type: "material", materials_item_baselines: [], tracked: true }) as any;
const delivered = (lineId: string, qty: number, price: number, unit = "ton") =>
  ({ item: { id: `d-${lineId}-${qty}`, materials_item_id: lineId, quantity: qty, unit, unit_price: price, status: null }, orderStatus: "delivered" }) as any;

const features = [{ id: "patio", project_id: "p", category_id: "cat-patio", label: null, status: "active", source_quote_id: null, sort_order: 0, created_at: "" }] as any;
const categories = [{ id: "cat-patio", name: "Paver Patio" }];
const sections = [
  {
    id: "s1",
    feature_id: "patio",
    feature: { status: "active" },
    labor_mode: "hours",
    labor_man_hours: 100,
    labor_rate: 40,
    materials_items: [line("gravel", "Gravel base", 20, 30), line("pavers", "Pavers", 600, 5, "sq ft")],
  },
];
const quotes = [{ id: "q", status: "approved", kind: "original", quote_sections: [{ id: "qs", feature_id: "patio", is_optional: false, quote_items: [{ price: 20000, quantity: 1, is_optional: false }] }] }] as any;

const base = {
  features,
  categories,
  sections: sections as any,
  quotes,
  changeOrders: [],
  expenses: [],
  expenseCategories: [],
  deliveries: [delivered("gravel", 35, 30), delivered("pavers", 600, 5, "sq ft")],
  usageLogs: [],
  materialsCounted: true,
  overheadRate: 10,
};

describe("planned vs actual", () => {
  it("colors variance by the thresholds", () => {
    const t = { amberPct: 0, redPct: 10 };
    expect(varianceTone(100, 95, t)).toBe("green");
    expect(varianceTone(100, 108, t)).toBe("amber");
    expect(varianceTone(100, 130, t)).toBe("red");
    expect(varianceTone(0, 0, t)).toBe("none");
  });

  it("per-feature labor when logged per feature; bridge adds up to the profit change", () => {
    const r = plannedActualReport({ ...base, laborEntries: [{ cost: 5000, hours: 125, feature_id: "patio" }] });
    expect(r.laborTracking).toBe("per_feature");
    const patio = r.features.find((f) => f.featureId === "patio")!;
    expect(patio.labor).toEqual({ plannedHours: 100, actualHours: 125, estimatedSplit: false });
    expect(patio.buckets.find((b) => b.bucket === "labor")!.dollars).toBe(1000);
    expect(patio.lines.find((l) => l.id === "gravel")!.cost.dollars).toBe(450);
    // expected 20,000 − (600 + 3,000 + 4,000) = 12,400; actual − 450 − 1,000
    expect(r.profit.expected).toBe(12400);
    expect(r.profit.actual).toBe(10950);
    const direct = r.profit.bridge.filter((s) => !s.label.startsWith("Overhead")).reduce((s, x) => s + x.amount, 0);
    expect(direct).toBe(r.profit.actual - r.profit.expected);
    expect(r.profit.expectedFullyLoaded).toBe(12400 - 1000);
    expect(r.profit.actualFullyLoaded).toBe(10950 - 1250);
    expect(r.biggest[0]).toMatchObject({ label: "Labor", dollars: 1000 });
    expect(profitSentence(r)).toBe("Labor (Paver Patio) +$1,000, Gravel base (Paver Patio) +$450, Overhead on extra hours +$250 → Fully loaded profit −$1,700");
  });

  it("labor logged per project → compared project-wide, feature split flagged as estimated", () => {
    const r = plannedActualReport({ ...base, laborEntries: [{ cost: 5000, hours: 125, feature_id: null }] });
    expect(r.laborTracking).toBe("project");
    expect(r.features.find((f) => f.featureId === "patio")!.labor.estimatedSplit).toBe(true);
    expect(r.profit.bridge.some((s) => s.label === "Labor")).toBe(true);
  });

  it("materials not counted until complete + reconciled — lines still show delivered", () => {
    const r = plannedActualReport({ ...base, materialsCounted: false, laborEntries: [] });
    const patio = r.features.find((f) => f.featureId === "patio")!;
    const mat = patio.buckets.find((b) => b.bucket === "material")!;
    expect(mat.pending).toBe(true);
    expect(mat.dollars).toBe(0); // carried at plan — never "$3,600 under"
    expect(r.profit.bridge.some((s) => s.label.startsWith("Material"))).toBe(false);
    expect(patio.lines.find((l) => l.id === "gravel")!.actualQty).toBe(35);
  });

  it("crew size = average distinct workers per day", () => {
    expect(
      crewSizeFromLabor([
        { entry_date: "d1", worker_name: "A", employee_id: null, hours: 8 },
        { entry_date: "d1", worker_name: "B", employee_id: null, hours: 8 },
        { entry_date: "d2", worker_name: "A", employee_id: null, hours: 8 },
        { entry_date: "d2", worker_name: "B", employee_id: null, hours: 8 },
        { entry_date: "d2", worker_name: "C", employee_id: null, hours: 8 },
      ] as any),
    ).toBe(2.5);
  });
});

const feat = (over: Partial<CloseoutFeature>): CloseoutFeature =>
  ({
    feature_id: "f",
    name: "Paver Patio",
    build_type: "paver_patio",
    size: 600,
    size_unit: "sq ft",
    base_depth_in: 6,
    excavation_depth_in: null,
    material_system: null,
    material_family: "Techo-Bloc",
    price: 0,
    planned: {} as any,
    actual: {} as any,
    labor: { planned_hours: 100, actual_hours: 100, estimated_split: false },
    base: { planned_tons: 20, actual_tons: 20 },
    units: {},
    ...over,
  }) as CloseoutFeature;
const co = (id: string, ctx: Closeout["context"], f: Partial<CloseoutFeature>, extra: Partial<Closeout> = {}): Closeout =>
  ({ id, project_id: id, snapshot: {} as any, context: ctx, features: [feat(f)], what_happened: null, excluded: false, superseded_at: null, completed_on: "2026-09-01", created_at: "", project: { name: id }, ...extra }) as Closeout;

describe("similar jobs", () => {
  const pool = [
    co("a", { slope: "moderate", access: "tight", soil: "clay" }, { size: 550, units: { base_tons_per_sqft: 0.09 } }),
    co("b", { slope: "moderate", access: "tight", soil: "normal" }, { size: 650, units: { base_tons_per_sqft: 0.1 } }),
    co("c", { slope: "moderate", access: "easy", soil: "normal" }, { size: 600, units: { base_tons_per_sqft: 0.08 } }),
    co("d", { slope: "flat", access: "easy", soil: "normal" }, { size: 2000 }),
    co("e", { slope: "moderate", access: "tight", soil: "clay" }, { size: 600 }, { excluded: true }),
  ];
  const target = { build_type: "paver_patio", size: 600, size_unit: "sq ft", context: { slope: "moderate" as const, access: "tight" as const, soil: "clay" as const } };

  it("widens one step at a time and says what it widened; excluded jobs never count", () => {
    const r = findSimilarJobs(pool, target);
    expect(r.matches.map((m) => m.closeout.id).sort()).toEqual(["a", "b", "c"]);
    expect(r.widened).toEqual(["any soil", "any access"]);
    expect(r.allOfType).toBe(false);
    const avg = averageMetric(r.matches, (f) => f.units.base_tons_per_sqft);
    expect(avg.n).toBe(MIN_SAMPLE);
    expect(avg.isAverage).toBe(true);
    expect(avg.avg).toBeCloseTo(0.09, 5);
  });

  it("no size yet → size isn't compared, context still is", () => {
    const r = findSimilarJobs(pool, { ...target, size: null });
    expect(r.allOfType).toBe(false);
    expect(r.matches.map((m) => m.closeout.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("fewer than 3 → reference only, from the strictest rule that found any", () => {
    const r = findSimilarJobs(pool, target, 5);
    expect(r.matches.map((m) => m.closeout.id)).toEqual(["a"]);
    expect(averageMetric(r.matches, (f) => f.units.base_tons_per_sqft).isAverage).toBe(false);
  });
});

describe("recommendations", () => {
  const sloped = (id: string, planned: number, actual: number) => co(id, { slope: "steep" }, { base: { planned_tons: planned, actual_tons: actual } });
  const flat = (id: string) => co(id, { slope: "flat" }, { base: { planned_tons: 20, actual_tons: 20 } });

  it("condition-level pattern (sloped patios use more base) needs 4 jobs, 3 in the same direction", () => {
    const recs = computeRecommendations([sloped("s1", 20, 24), sloped("s2", 20, 25), sloped("s3", 20, 23), sloped("s4", 20, 24), flat("f1"), flat("f2"), flat("f3"), flat("f4")]);
    const r = recs.find((x) => x.key === "base:paver_patio:slope=steep")!;
    expect(r).toBeTruthy();
    expect(r.median).toBeCloseTo(1.2, 5);
    expect(r.evidence).toHaveLength(4);
    expect(r.headline).toMatch(/steep slope you've used 20% more base than planned across 4 jobs/);
    expect(recs.find((x) => x.key === "base:paver_patio:all")).toBeUndefined(); // overall median is ~1.1 but only 4/8 over
  });

  it("no recommendation from 3 jobs or from estimated labor splits", () => {
    expect(computeRecommendations([sloped("s1", 20, 30), sloped("s2", 20, 30), sloped("s3", 20, 30)])).toEqual([]);
    const split = (id: string) => co(id, {}, { labor: { planned_hours: 100, actual_hours: 150, estimated_split: true }, base: null });
    expect(computeRecommendations([split("1"), split("2"), split("3"), split("4")])).toEqual([]);
  });

  it("condition matching", () => {
    expect(conditionMatches({ slope: "steep" }, { slope: "steep", access: "easy" })).toBe(true);
    expect(conditionMatches({ slope: "steep" }, { slope: "flat" })).toBe(false);
    expect(conditionMatches({}, { slope: "flat" })).toBe(true);
  });
});
