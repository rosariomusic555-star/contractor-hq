import { describe, it, expect } from "vitest";
import { BUILD_TYPES } from "./buildTypes";
import { QUICK_QUOTE_TEMPLATES as quickQuoteTemplates } from "./quickQuote";
import { SMART_SECTION_TEMPLATES as smartSectionTemplates } from "./smartSections";
import {
  FEATURE_KIND,
  areaRectStyle,
  areaShapesFor,
  blankData,
  buildTypeForCategoryName,
  computeTotals,
  featureSummary,
  groupHasData,
  instanceHasData,
  measurementGroupsFor,
  normalizeData,
  pathUArea,
  prefillSources,
  prefillSourcesForFeature,
  quickQuotePrefill,
  smartSectionPrefill,
  sumTotals,
  totalSurfaceSqft,
  totalsHeadline,
  type FeatureInstance,
  type FeatureKind,
  type MeasurementRow,
  type PatioData,
} from "./measurements";

const patio = (patch: Partial<PatioData>): PatioData => ({ ...blankData("patio"), ...patch });

const inst = (build_type: string, data: unknown, label: string | null = null): FeatureInstance => {
  const kind = FEATURE_KIND[build_type];
  const d = normalizeData(kind, data);
  return { id: Math.random().toString(), project_id: "p", build_type, label, data: d, totals: computeTotals(kind, d), sort_order: 0 };
};

const custom = (p: Partial<MeasurementRow>): MeasurementRow => ({
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

describe("category → card mapping", () => {
  it("matches the default Job Category names to build types", () => {
    expect(buildTypeForCategoryName("Paver Patio")?.id).toBe("paver_patio");
    expect(buildTypeForCategoryName("Fire Pit / Fireplace")?.id).toBe("fire_pit");
    expect(buildTypeForCategoryName("steps")?.id).toBe("steps");
    expect(buildTypeForCategoryName("Drainage")).toBeNull();
  });

  it("gives every spec'd feature a purpose-built card, and Pillars custom-only", () => {
    for (const id of ["paver_patio", "outdoor_kitchen", "seating_wall", "retaining_wall", "fire_pit", "walkway", "driveway", "outdoor_lighting", "steps"]) {
      expect(FEATURE_KIND[id]).toBeTruthy();
    }
    expect(FEATURE_KIND.pillars).toBeUndefined();
    // Plants is counted per plant (custom measurements), not measured.
    expect(BUILD_TYPES.every((b) => b.id in FEATURE_KIND || b.id === "pillars" || b.id === "plants")).toBe(true);
  });

  it("builds one group per selected type, merging duplicates and keeping unmapped ones", () => {
    const cats = [
      { id: "a", name: "Paver Patio" },
      { id: "b", name: "Patio" },
      { id: "c", name: "Drainage" },
      { id: "d", name: "Pillars" },
    ];
    const groups = measurementGroupsFor(["a", "b", "c", "d"], cats);
    expect(groups.map((g) => [g.key, g.kind])).toEqual([
      ["bt:paver_patio", "patio"],
      ["cat:c", null],
      ["bt:pillars", null],
    ]);
  });
});

describe("paver patio", () => {
  it("rectangle: area and perimeter", () => {
    const t = computeTotals("patio", patio({ rect: { length_ft: 20, width_ft: 12 } }));
    expect(t).toEqual({ area_sqft: 240, perimeter_ft: 64 });
  });

  it("total sq ft method ignores dimensions and has no perimeter", () => {
    const t = computeTotals("patio", patio({ method: "total", total_sqft: 300, rect: { length_ft: 20, width_ft: 12 } }));
    expect(t).toEqual({ area_sqft: 300 });
  });

  it("L-shape = two rectangles", () => {
    // 20 long, 16 deep; upper arm 12 wide; lower right part 10 deep.
    const t = computeTotals("patio", patio({ shape: "l_shape", l: { a: 20, b: 16, c: 12, d: 10 } }));
    expect(t.area_sqft).toBe(12 * 16 + 8 * 10);
    expect(t.perimeter_ft).toBe(72);
  });

  it("U-shape = three rectangles", () => {
    const t = computeTotals("patio", patio({ shape: "u_shape", u: { a: 30, b: 20, c: 8, d: 20, e: 8, f: 6 } }));
    expect(t.area_sqft).toBe(8 * 20 + 8 * 20 + 14 * 6);
    // Outline: 30 + 20 + 8 + 14 + 14 + 14 + 8 + 20
    expect(t.perimeter_ft).toBe(128);
  });

  it("irregular sums its rectangles", () => {
    const t = computeTotals(
      "patio",
      patio({
        shape: "irregular",
        areas: [
          { id: "1", label: "", length_ft: 10, width_ft: 10 },
          { id: "2", label: "", length_ft: 5, width_ft: 4 },
        ],
      }),
    );
    expect(t).toEqual({ area_sqft: 120 });
  });
});

describe("other features", () => {
  it("kitchen counts only the layout's runs, with the contractor's default height", () => {
    const d = { layout: "l_shape", runs: [{ id: "a", length_ft: 8 }, { id: "b", length_ft: 5 }, { id: "c", length_ft: 99 }] };
    expect(computeTotals("kitchen", normalizeData("kitchen", d))).toEqual({ linear_ft: 13, height_in: 36 });
    expect(computeTotals("kitchen", normalizeData("kitchen", d), { kitchenHeightIn: 34 }).height_in).toBe(34);
    expect(computeTotals("kitchen", normalizeData("kitchen", { ...d, height_in: 42 }), { kitchenHeightIn: 34 }).height_in).toBe(42);
    expect(totalsHeadline("kitchen", { linear_ft: 13, height_in: 36 })).toBe("13 LF · 36 in high");
  });

  it("seating wall uses the same run layouts, incl. one curved length", () => {
    const runs = [{ id: "a", length_ft: 12 }, { id: "b", length_ft: 6 }, { id: "c", length_ft: 6 }];
    expect(computeTotals("seating_wall", normalizeData("seating_wall", { layout: "u_shape", runs, height_in: 20 }))).toEqual({ linear_ft: 24, height_in: 20 });
    expect(computeTotals("seating_wall", normalizeData("seating_wall", { layout: "curved", runs })).linear_ft).toBe(12);
  });

  it("upgrades old seating wall sections to runs + one height", () => {
    const sections = [
      { id: "1", label: "Back", length_lf: 10, geometry: "straight", height_in: 18 },
      { id: "2", label: "", length_lf: 30, geometry: "curved", height_in: 22 },
      { id: "3", label: "", length_lf: 5, geometry: "straight", height_in: 22 },
    ];
    // Per-section heights → the most common one.
    const perSection = normalizeData("seating_wall", { per_section_height: true, height_in: null, sections });
    expect(perSection.layout).toBe("custom");
    expect(perSection.height_in).toBe(22);
    expect(perSection.runs.map((x) => [x.length_ft, x.label])).toEqual([[10, "Back"], [30, ""], [5, ""]]);
    expect(computeTotals("seating_wall", perSection).linear_ft).toBe(45);
    // A wall height wins when there was one; a single curved section stays curved.
    const one = normalizeData("seating_wall", { height_in: 20, sections: [{ length_lf: 14, geometry: "curved", height_in: null }] });
    expect(one).toMatchObject({ layout: "curved", height_in: 20 });
    expect(computeTotals("seating_wall", one)).toEqual({ linear_ft: 14, height_in: 20 });
  });

  it("walkway/driveway use the area builder; old length × width becomes Straight", () => {
    const old = normalizeData("flatwork", { method: "dimensions", length_ft: 25, width_ft: 4 });
    expect(old.shape).toBe("rectangle");
    expect(computeTotals("flatwork", old).area_sqft).toBe(100);
    // L-walkway: 20 along the bottom, 12 up the side, legs 4 and 3 wide.
    const l = normalizeData("flatwork", { shape: "l_shape", l: { a: 20, b: 12, c: 4, d: 3 } });
    expect(computeTotals("flatwork", l).area_sqft).toBe(4 * 12 + 16 * 3);
    expect(computeTotals("flatwork", normalizeData("flatwork", { method: "total", total_sqft: 600 }))).toEqual({ area_sqft: 600 });
  });

  it("retaining wall: runs × one average height, or wall sq ft", () => {
    const runs = [{ id: "a", length_ft: 25 }, { id: "b", length_ft: 15 }, { id: "c", length_ft: 99 }];
    const l = normalizeData("retaining_wall", { method: "lf_height", layout: "l_shape", runs, height_ft: 3, wall_sqft: 999 });
    expect(computeTotals("retaining_wall", l)).toEqual({ linear_ft: 40, wall_sqft: 120, height_in: 36 });
    expect(totalsHeadline("retaining_wall", computeTotals("retaining_wall", l))).toBe("40 LF · 120 wall sq ft");
    // Wall sq ft method ignores the builder entirely.
    expect(computeTotals("retaining_wall", { ...l, method: "wall_sqft", wall_sqft: 120 })).toEqual({ wall_sqft: 120 });
  });

  it("upgrades an old single LF retaining wall to one Straight run", () => {
    const old = normalizeData("retaining_wall", { method: "lf_height", length_lf: 40, height_ft: 3 });
    expect(old.layout).toBe("straight");
    expect(old.runs[0].length_ft).toBe(40);
    expect("length_lf" in old).toBe(false);
    expect(computeTotals("retaining_wall", old)).toEqual({ linear_ft: 40, wall_sqft: 120, height_in: 36 });
  });

  it("fire pit uses the contractor default height unless overridden", () => {
    const round = normalizeData("fire_pit", { shape: "round", diameter_ft: 4 });
    const t = computeTotals("fire_pit", round, { firePitHeightIn: 20 });
    expect(t.height_in).toBe(20);
    expect(t.footprint_sqft).toBeCloseTo(12.57, 2);
    expect(t.perimeter_ft).toBeCloseTo(12.57, 2);
    expect(computeTotals("fire_pit", { ...round, height_in: 16 }, { firePitHeightIn: 20 }).height_in).toBe(16);
  });

  it("lighting counts fixtures; steps count steps and tread", () => {
    expect(computeTotals("lighting", { fixtures: [{ id: "1", type: "path", name: "", qty: 8 }, { id: "2", type: "uplight", name: "", qty: 4 }] })).toEqual({ fixture_count: 12 });
    expect(
      computeTotals("steps", { sections: [{ id: "1", label: "", step_count: 3, width_ft: 6 }, { id: "2", label: "", step_count: 2, width_ft: 4 }] }),
    ).toEqual({ step_count: 5, tread_lf: 26 });
  });

  it("instances roll up per feature", () => {
    expect(sumTotals([{ area_sqft: 240, perimeter_ft: 64 }, { area_sqft: 100 }])).toEqual({ area_sqft: 340 });
    expect(sumTotals([{ area_sqft: 240, perimeter_ft: 64 }, { area_sqft: 100, perimeter_ft: 40 }])).toEqual({ area_sqft: 340, perimeter_ft: 104 });
  });
});

describe("empty vs. has data", () => {
  it("blank data (only default choices) is empty for every kind", () => {
    for (const kind of Object.values(FEATURE_KIND) as FeatureKind[]) expect(instanceHasData(kind, blankData(kind))).toBe(false);
  });

  it("a lone dimension, a label or a description counts", () => {
    expect(instanceHasData("patio", patio({ rect: { length_ft: 20, width_ft: null } }))).toBe(true);
    expect(instanceHasData("patio", blankData("patio"), "Back patio")).toBe(true);
    expect(instanceHasData("fire_pit", { ...blankData("fire_pit"), shape: "custom", description: "Keyhole" })).toBe(true);
  });

  it("groupHasData looks at instances and custom rows", () => {
    const g = { key: "bt:paver_patio", kind: "patio" as const };
    expect(groupHasData(g, [], [])).toBe(false);
    expect(groupHasData(g, [inst("paver_patio", { method: "total", total_sqft: 50 })], [])).toBe(true);
    expect(groupHasData(g, [], [custom({ build_type: "paver_patio", label: "Border", value: 82 })])).toBe(true);
  });
});

describe("downstream", () => {
  it("job size = patio + walkway + driveway area in visible groups only", () => {
    const list = [
      inst("paver_patio", { method: "total", total_sqft: 400 }),
      inst("walkway", { method: "dimensions", length_ft: 25, width_ft: 4 }),
      inst("driveway", { method: "total", total_sqft: 600 }),
      inst("retaining_wall", { method: "wall_sqft", wall_sqft: 500 }),
    ];
    expect(totalSurfaceSqft(list, new Set(["bt:paver_patio", "bt:walkway", "bt:retaining_wall"]))).toBe(500);
    expect(totalSurfaceSqft([], new Set())).toBeNull();
  });

  it("prefill offers the sum first when there are several instances", () => {
    const list = [
      inst("paver_patio", { method: "total", total_sqft: 300 }, "Back patio"),
      inst("paver_patio", { rect: { length_ft: 10, width_ft: 10 } }),
      inst("paver_patio", {}), // blank — skipped
    ];
    const sources = prefillSources(list, "paver_patio");
    expect(sources.map((s) => s.id)[0]).toBe("sum");
    expect(sources).toHaveLength(3);
    expect(sources[0].totals.area_sqft).toBe(400);
    expect(sources[1].label).toBe("Back patio — 300 sq ft");
    expect(sources[2].label).toBe("Patio 2 — 100 sq ft");
    expect(prefillSources([list[0]], "paver_patio").map((s) => s.id)).toEqual([list[0].id]);
  });

  it("prefill keys match real Smart Section and Quick Quote question keys", () => {
    const totals = { area_sqft: 1, perimeter_ft: 1, linear_ft: 1, footprint_sqft: 1, fixture_count: 1, height_in: 24, backsplash_sqft: 1, backrest_lf: 1, backrest_height_in: 18, strip_lf: 1 };
    for (const t of smartSectionTemplates) {
      const keys = new Set([...t.questions.map((q) => q.key)]);
      for (const k of Object.keys(smartSectionPrefill(t.id, totals, { courseHeightIn: 8 }))) expect(keys, `${t.id}.${k}`).toContain(k);
      // Pergola needs length and width separately (an area can't give them);
      // Plants is counted, not measured — no prefill for either calculator.
      if (t.id !== "pergola" && t.id !== "plants") expect(Object.keys(smartSectionPrefill(t.id, totals)).length, t.id).toBeGreaterThan(0);
    }
    for (const t of quickQuoteTemplates) {
      const keys = new Set(t.questions.map((q) => q.key));
      for (const k of Object.keys(quickQuotePrefill(t.id, totals))) expect(keys, `${t.id}.${k}`).toContain(k);
      if (t.id !== "plants") expect(Object.keys(quickQuotePrefill(t.id, totals)).length, t.id).toBeGreaterThan(0);
    }
  });

  it("normalizes a partial 0098-backfilled row", () => {
    const d = normalizeData("seating_wall", { height_in: 20, per_section_height: false, sections: [{ id: "x", label: "", length_lf: 30, geometry: "straight", height_in: null }] });
    expect(d.layout).toBe("straight");
    expect(d.runs[0]).toMatchObject({ id: "x", length_ft: 30 });
    expect(d.runs).toHaveLength(3); // padded so the layout can be flipped
    expect(computeTotals("seating_wall", d)).toEqual({ linear_ft: 30, height_in: 20 });
  });

  it("height → courses for the kitchen and seating wall calculators", () => {
    expect(smartSectionPrefill("outdoor_kitchen", { linear_ft: 13, height_in: 36 }, { courseHeightIn: 8 })).toEqual({ run_ft: 13, courses: 5 });
    expect(smartSectionPrefill("seating_wall", { linear_ft: 20, height_in: 20 }, { courseHeightIn: 6 })).toEqual({ length_ft: 20, courses: 3 });
    expect(smartSectionPrefill("seating_wall", { linear_ft: 20 }, { courseHeightIn: 6 })).toEqual({ length_ft: 20 });
  });
});

describe("fire pit vs fireplace", () => {
  it("are separate build types; the old combined name stays Fire Pit", () => {
    expect(buildTypeForCategoryName("Fire Pit")?.id).toBe("fire_pit");
    expect(buildTypeForCategoryName("Fire Pit / Fireplace")?.id).toBe("fire_pit");
    expect(buildTypeForCategoryName("Fireplace")?.id).toBe("fireplace");
    expect(buildTypeForCategoryName("Outdoor Fireplace")?.id).toBe("fireplace");
    expect(FEATURE_KIND.fireplace).toBe("fireplace");
  });

  it("fireplace: footprint, perimeter, height and veneer (4 or 3 sides)", () => {
    const d = { ...blankData("fireplace"), width_ft: 6, depth_ft: 3, height_ft: 10 };
    expect(computeTotals("fireplace", d)).toEqual({ footprint_sqft: 18, perimeter_ft: 18, height_in: 120, wall_sqft: 180 });
    expect(computeTotals("fireplace", { ...d, veneer_sides: "three" }).wall_sqft).toBe(120); // (6 + 2×3) × 10
    expect(instanceHasData("fireplace", blankData("fireplace"))).toBe(false);
    expect(totalsHeadline("fireplace", computeTotals("fireplace", d))).toBe("18 sq ft footprint · 10 ft tall");
  });

  it("fireplace prefill drives its own calculator", () => {
    const t = computeTotals("fireplace", { ...blankData("fireplace"), width_ft: 6, depth_ft: 3, height_ft: 10 });
    const answers = smartSectionPrefill("fireplace", t);
    expect(answers).toEqual({ footprint_sqft: 18, perimeter_ft: 18, height_ft: 10, veneer_sqft: 180 });
    const template = smartSectionTemplates.find((x) => x.id === "fireplace")!;
    const qty = (k: string) => template.calculate(answers).find((l) => l.slotKey === k)?.quantity;
    expect(qty("cmu_core")).toBe(Math.ceil(180 / 0.89));
    expect(qty("flue")).toBe(7); // 10 ft − 3 ft firebox
    expect(qty("veneer")).toBe(180); // the measured area; +10% waste rides on the line's Waste %
    expect(template.calculate(answers).find((l) => l.slotKey === "veneer")?.wastePercent).toBe(10);
    expect(qty("firebox")).toBe(1);
    expect(quickQuotePrefill("fireplace", t)).toEqual({ fireplace_count: 1 });
  });
});

describe("backsplash, backrest, strip lighting", () => {
  const runs = [{ id: "a", length_ft: 12 }, { id: "b", length_ft: 6 }, { id: "c", length_ft: 6 }];

  it("kitchen backsplash = length (blank = counter run) × height in inches", () => {
    const k = (patch: object) => computeTotals("kitchen", normalizeData("kitchen", { layout: "straight", runs, ...patch }));
    expect(k({ backsplash: false, backsplash_height_in: 18 }).backsplash_sqft).toBeUndefined();
    expect(k({ backsplash: true, backsplash_height_in: 18 }).backsplash_sqft).toBe(18); // 12 ft × 1.5 ft
    expect(k({ backsplash: true, backsplash_length_ft: 8, backsplash_height_in: 6 }).backsplash_sqft).toBe(4);
    expect(smartSectionPrefill("outdoor_kitchen", { linear_ft: 12, height_in: 36, backsplash_sqft: 18 }, { courseHeightIn: 8 })).toEqual({ run_ft: 12, courses: 5, backsplash_sqft: 18 });
  });

  it("seating wall backrest: length defaults to the wall, height → extra courses", () => {
    const w = (patch: object) => computeTotals("seating_wall", normalizeData("seating_wall", { layout: "u_shape", runs, height_in: 18, ...patch }));
    expect(w({ backrest: true }).backrest_lf).toBeUndefined(); // no height yet
    expect(w({ backrest: true, backrest_height_in: 18 })).toMatchObject({ backrest_lf: 24, backrest_height_in: 18 });
    expect(w({ backrest: true, backrest_length_ft: 10, backrest_height_in: 18 }).backrest_lf).toBe(10);
    expect(smartSectionPrefill("seating_wall", { linear_ft: 24, height_in: 18, backrest_lf: 10, backrest_height_in: 18 }, { courseHeightIn: 9 })).toEqual({
      length_ft: 24,
      courses: 2,
      backrest_lf: 10,
      backrest_courses: 2,
    });
  });

  it("seating wall calculator adds backrest blocks to the wall block line and a Backrest Caps line", () => {
    const t = smartSectionTemplates.find((x) => x.id === "seating_wall")!;
    const base = { length_ft: 24, courses: 2, block_face_length_in: 8, cap_length_in: 12 };
    const without = t.calculate(base);
    const withBack = t.calculate({ ...base, backrest_lf: 10, backrest_courses: 2 });
    const qty = (lines: typeof without, k: string) => lines.find((l) => l.slotKey === k)?.quantity;
    expect(qty(without, "wall_block")).toBe(72);
    expect(qty(withBack, "wall_block")).toBe(72 + 30); // 10 ft / 8 in = 15 blocks × 2 courses
    expect(qty(without, "backrest_caps")).toBeUndefined();
    expect(qty(withBack, "backrest_caps")).toBe(10);
    expect(qty(withBack, "caps")).toBe(24); // the seat keeps its own cap
  });

  it("kitchen and lighting calculators add Backsplash / Strip Lighting only when measured", () => {
    const kitchen = smartSectionTemplates.find((x) => x.id === "outdoor_kitchen")!;
    const lighting = smartSectionTemplates.find((x) => x.id === "outdoor_lighting")!;
    expect(kitchen.calculate({ run_ft: 12 }).some((l) => l.slotKey === "backsplash")).toBe(false);
    const splash = kitchen.calculate({ run_ft: 12, backsplash_sqft: 18, backsplash_waste_pct: 10 }).find((l) => l.slotKey === "backsplash");
    expect(splash).toMatchObject({ quantity: 18, wastePercent: 10 }); // waste on the line, not in the quantity
    expect(lighting.calculate({ fixture_count: 4 }).some((l) => l.slotKey === "strip_lighting")).toBe(false);
    expect(lighting.calculate({ fixture_count: 4, strip_lf: 22.5 }).find((l) => l.slotKey === "strip_lighting")?.quantity).toBe(23);
  });

  it("a Strip lighting fixture row is linear feet, not a fixture count", () => {
    const d = normalizeData("lighting", {
      fixtures: [
        { id: "1", type: "path", name: "", qty: 6 },
        { id: "2", type: "strip", name: "", qty: 18.5 },
        { id: "3", type: "strip", name: "", qty: 11.5 },
      ],
    });
    const t = computeTotals("lighting", d);
    expect(t).toEqual({ fixture_count: 6, strip_lf: 30 });
    expect(totalsHeadline("lighting", t)).toBe("6 fixtures · 30 LF strip");
    expect(smartSectionPrefill("outdoor_lighting", t)).toEqual({ fixture_count: 6, strip_lf: 30 });
    expect(sumTotals([t, { fixture_count: 2, strip_lf: 5 }])).toMatchObject({ fixture_count: 8, strip_lf: 35 });
  });

  it("moves the old separate strip lighting field into a Strip lighting row", () => {
    // Real fixtures kept, strip appended.
    const a = normalizeData("lighting", { fixtures: [{ id: "1", type: "path", name: "", qty: 6 }], strip_lf: 30 });
    expect("strip_lf" in a).toBe(false);
    expect(a.fixtures.map((f) => [f.type, f.qty])).toEqual([["path", 6], ["strip", 30]]);
    expect(computeTotals("lighting", a)).toEqual({ fixture_count: 6, strip_lf: 30 });
    // Only a blank starter row → it's replaced, not left empty above the strip.
    const b = normalizeData("lighting", { fixtures: [{ id: "1", type: "path", name: "", qty: null }], strip_lf: 12 });
    expect(b.fixtures.map((f) => [f.type, f.qty])).toEqual([["strip", 12]]);
    // Empty old field → just dropped, rows untouched.
    const c = normalizeData("lighting", { fixtures: [{ id: "1", type: "path", name: "", qty: null }], strip_lf: null });
    expect("strip_lf" in c).toBe(false);
    expect(c.fixtures).toHaveLength(1);
  });
});

describe("collapsed summaries", () => {
  const g = (build_type: string) => ({ build_type, kind: FEATURE_KIND[build_type] });

  it("matches the spec's examples", () => {
    expect(featureSummary(g("paver_patio"), [inst("paver_patio", { shape: "l_shape", l: { a: 20, b: 16, c: 12, d: 10 } })], [])).toBe("L-shape · 272 sq ft");
    expect(featureSummary(g("retaining_wall"), [inst("retaining_wall", { method: "lf_height", runs: [{ id: "a", length_ft: 40 }], height_ft: 3 })], [])).toBe(
      "40 LF × 3 ft = 120 wall sq ft",
    );
    expect(featureSummary(g("outdoor_lighting"), [inst("outdoor_lighting", { fixtures: [{ id: "1", type: "path", name: "", qty: 21 }] })], [])).toBe("21 fixtures");
    const steps = { sections: [1, 2, 3].map((i) => ({ id: String(i), label: "", step_count: 3, width_ft: 4 })) };
    expect(featureSummary(g("steps"), [inst("steps", steps)], [])).toBe("3 sections · 9 steps");
  });

  it("combines multiple instances with a count", () => {
    const two = [inst("paver_patio", { method: "total", total_sqft: 400 }), inst("paver_patio", { method: "total", total_sqft: 280 })];
    expect(featureSummary(g("paver_patio"), two, [])).toBe("2 patios · 680 sq ft");
    const walls = [inst("seating_wall", { runs: [{ id: "a", length_ft: 10 }] }), inst("seating_wall", { runs: [{ id: "a", length_ft: 5 }] })];
    expect(featureSummary(g("seating_wall"), walls, [])).toBe("2 seating walls · 15 LF");
  });

  it("empty → null (Not measured yet); partial and custom-only cases", () => {
    expect(featureSummary(g("paver_patio"), [inst("paver_patio", {})], [])).toBeNull();
    expect(featureSummary(g("paver_patio"), [inst("paver_patio", { rect: { length_ft: 20, width_ft: null } })], [])).toBe("Partly measured");
    expect(featureSummary({ build_type: "pillars", kind: null }, [], [custom({ label: "Count", value: 4 })])).toBe("1 measurement");
    expect(featureSummary(g("outdoor_kitchen"), [inst("outdoor_kitchen", { runs: [{ id: "a", length_ft: 10 }] })], [custom({ label: "Counter depth", value: 36 })])).toBe(
      "Straight · 10 LF · 36 in high · 1 custom",
    );
  });
});

describe("walkway U-shape + corner rule", () => {
  it("U = (A + B + C) × width − 2 × width²", () => {
    const d = normalizeData("flatwork", { shape: "u_shape", path_u: { a: 12, b: 20, c: 14, width: 4 } });
    expect(computeTotals("flatwork", d).area_sqft).toBe(152);
    // Flipping is visual only.
    expect(computeTotals("flatwork", { ...d, path_u: { ...d.path_u, open_right: true } }).area_sqft).toBe(152);
    expect(pathUArea({ a: 3, b: 20, c: 14, width: 4, open_right: false }).valid).toBe(false); // A shorter than the width
    expect(pathUArea({ a: 12, b: 6, c: 14, width: 4, open_right: false }).valid).toBe(false); // B under two widths
  });

  it("the walkway L already subtracts its one corner: (A + B) × w − w² when both legs are w wide", () => {
    const w = 4;
    const l = normalizeData("flatwork", { shape: "l_shape", l: { a: 20, b: 12, c: w, d: w } });
    expect(computeTotals("flatwork", l).area_sqft).toBe((20 + 12) * w - w * w);
  });

  it("only the walkway offers U-shape and the tall Straight diagram; the patio's U stays a block", () => {
    expect(areaShapesFor("flatwork", "walkway").map((x) => x.label)).toEqual(["Straight", "L-shape", "U-shape", "Irregular"]);
    expect(areaShapesFor("flatwork", "driveway").map((x) => x.label)).toEqual(["Straight", "L-shape", "Irregular"]);
    expect(areaRectStyle("walkway")).toBe("tall");
    expect(areaRectStyle("driveway")).toBe("wide");
    expect(areaRectStyle("paver_patio")).toBe("wide");
    const patioU = normalizeData("patio", { shape: "u_shape", u: { a: 30, b: 20, c: 8, d: 20, e: 8, f: 6 }, path_u: { a: 12, b: 20, c: 14, width: 4 } });
    expect(computeTotals("patio", patioU).area_sqft).toBe(8 * 20 + 8 * 20 + 14 * 6);
  });

  it("collapsed summary reads U-shape", () => {
    const walk = inst("walkway", { shape: "u_shape", path_u: { a: 12, b: 20, c: 14, width: 4 } });
    expect(featureSummary({ build_type: "walkway", kind: "flatwork" }, [walk], [])).toBe("U-shape · 152 sq ft");
  });
});

// Math bug (2026-09-28, live test): each seating wall has its own Cost plan
// section, but every section's calculator prefilled "all seating walls
// combined" — 26 LF in Seating Wall 1's section AND Seating Wall 2's, so
// the walls' block was counted twice across the plan.
describe("a feature's section prefills its own measurement", () => {
  const sw = (id: string, feature_id: string, lf: number, h: number) => ({ ...inst("seating_wall", { layout: "straight", height_in: h, runs: [{ id: `r${id}`, length_ft: lf }] }, null), id, feature_id });
  const list = [sw("a", "F1", 16, 18), sw("b", "F2", 10, 20)];
  it("defaults to that feature's wall; the others and the combined total stay pickable", () => {
    const s2 = prefillSourcesForFeature(list, "seating_wall", "F2");
    expect(s2[0].id).toBe("b");
    expect(s2[0].totals.linear_ft).toBe(10);
    expect(s2.map((s) => s.id)).toEqual(["b", "sum", "a"]);
    expect(prefillSourcesForFeature(list, "seating_wall", "F1")[0].totals.linear_ft).toBe(16);
  });
  it("no feature (or nothing measured for it) keeps the old order: combined first", () => {
    expect(prefillSourcesForFeature(list, "seating_wall", null)[0].id).toBe("sum");
    expect(prefillSourcesForFeature(list, "seating_wall", "F9")[0].id).toBe("sum");
  });
});

