import { describe, expect, it } from "vitest";
import type { Category } from "./api";
import {
  categoryForSectionName,
  featureSectionSeeds,
  isAutofilledSectionName,
  sectionFeatureOptions,
  withCommittedSectionName,
  withSectionType,
} from "./sectionFeatures";

const cat = (id: string, name: string) => ({ id, name }) as Category;
const patio = cat("c-patio", "Paver Patio");
const kitchen = cat("c-kitchen", "Outdoor Kitchen");
const drainage = cat("c-drain", "Drainage");
const all = [patio, kitchen, drainage];

describe("section feature picker", () => {
  it("lists the project's types first, then other categories + uncovered build types", () => {
    const { primary, other } = sectionFeatureOptions([patio, kitchen], all);
    expect(primary.map((o) => o.label)).toEqual(["Paver Patio", "Outdoor Kitchen"]);
    expect(other[0]).toEqual({ key: "c-drain", label: "Drainage", categoryId: "c-drain" });
    // Build types with no category yet come along name-only…
    expect(other.find((o) => o.label === "Fire Pit")).toMatchObject({ categoryId: null });
    // …but covered ones aren't repeated.
    expect(other.some((o) => o.label === "Paver Patio")).toBe(false);
  });

  it("matches a typed name to a feature (case, plural and aliases)", () => {
    expect(categoryForSectionName("Outdoor kitchen", [patio], all)).toBe("c-kitchen");
    expect(categoryForSectionName("outdoor kitchens", [patio], all)).toBe("c-kitchen");
    expect(categoryForSectionName("Patio", [patio], all)).toBe("c-patio"); // alias
    expect(categoryForSectionName("Back patio", [patio], all)).toBeNull();
  });

  it("the name follows the type chip only while it's autofilled", () => {
    const auto = { name: "Paver Patio", job_category_id: "c-patio" };
    expect(withSectionType(auto, "c-kitchen", all)).toEqual({ name: "Outdoor Kitchen", job_category_id: "c-kitchen" });
    const blank = { name: "", job_category_id: null };
    expect(withSectionType(blank, "c-patio", all).name).toBe("Paver Patio");
    const custom = { name: "Back patio", job_category_id: "c-patio" };
    expect(withSectionType(custom, "c-kitchen", all)).toEqual({ name: "Back patio", job_category_id: "c-kitchen" });
    // Clearing the type keeps whatever name is there.
    expect(withSectionType(auto, null, all)).toEqual({ name: "Paver Patio", job_category_id: null });
    expect(isAutofilledSectionName("paver patio", "Paver Patio")).toBe(true);
  });

  it("committing a name that matches a feature types an untyped section — never retypes a typed one", () => {
    expect(withCommittedSectionName({ name: "Outdoor kitchen", job_category_id: null }, [patio], all).job_category_id).toBe("c-kitchen");
    const typed = { name: "Outdoor kitchen", job_category_id: "c-patio" };
    expect(withCommittedSectionName(typed, [patio], all)).toBe(typed);
    const unmatched = { name: "Back patio", job_category_id: null };
    expect(withCommittedSectionName(unmatched, [patio], all)).toBe(unmatched);
  });
});

describe("new sheet: one section per project feature", () => {
  it("follows the project's order; Smart Section items where there's a template, plain otherwise", () => {
    const seeds = featureSectionSeeds(["c-kitchen", "c-drain", "c-patio", "missing"], all, []);
    expect(seeds.map((x) => [x.name, x.job_category_id, x.smart_section_build_type])).toEqual([
      ["Outdoor Kitchen", "c-kitchen", "outdoor_kitchen"],
      ["Drainage", "c-drain", null],
      ["Paver Patio", "c-patio", "paver_patio"],
    ]);
    expect(seeds[0].items.length).toBeGreaterThan(0);
    expect(seeds[1].items).toEqual([]);
    expect(seeds[2].items.map((i) => i.name)).toContain("Pavers");
  });

  it("uses the contractor's own template line items when customized", () => {
    const settings = [
      {
        build_type: "paver_patio",
        line_items: [
          { slot_key: "pavers", name: "Techo-Bloc pavers" },
          { slot_key: null, name: "Skid steer rental", cost_type: "equipment" as const },
        ],
        tunables: {},
        labor_default: { crew_size: 3, days: 4 },
      },
    ];
    const [seed] = featureSectionSeeds(["c-patio"], all, settings);
    expect(seed.items).toEqual([
      { name: "Techo-Bloc pavers", cost_type: "material", material_category_id: null, internal_description: null, unit: null },
      { name: "Skid steer rental", cost_type: "equipment", material_category_id: null, internal_description: null, unit: null },
    ]);
    expect(seed.labor).toEqual({ crew_size: 3, days: 4 });
  });

  it("template lines come in categorized (0162): default by name, the contractor's choice, deleted → none", () => {
    const mats = [
      { id: "m-pavers", name: "Pavers" },
      { id: "m-base", name: "base gravel" },
      { id: "m-mine", name: "My sand" },
    ];
    const [plain] = featureSectionSeeds(["c-patio"], all, [], mats);
    const cat = (name: string) => plain.items.find((i) => i.name === name)?.material_category_id;
    expect(cat("Pavers")).toBe("m-pavers");
    expect(cat("Border/Edge Pavers")).toBe("m-pavers");
    expect(cat("Base Material")).toBe("m-base"); // name match ignores case
    expect(cat("Bedding Sand")).toBeNull(); // no "Bedding Sand" category here

    const settings = [
      {
        build_type: "paver_patio",
        line_items: [
          { slot_key: "bedding_sand", name: "Bedding Sand", material_category_id: "m-mine", description: "Concrete sand, 1 in." },
          { slot_key: "pavers", name: "Pavers", material_category_id: "deleted-id" },
          { slot_key: null, name: "Skid steer", cost_type: "equipment" as const, material_category_id: "m-mine" },
        ],
        tunables: {},
      },
    ];
    const [custom] = featureSectionSeeds(["c-patio"], all, settings, mats);
    expect(custom.items).toEqual([
      { name: "Bedding Sand", cost_type: "material", material_category_id: "m-mine", internal_description: "Concrete sand, 1 in.", unit: null },
      { name: "Pavers", cost_type: "material", material_category_id: null, internal_description: null, unit: null },
      { name: "Skid steer", cost_type: "equipment", material_category_id: null, internal_description: null, unit: null },
    ]);
  });

  it("no project types → no sections", () => {
    expect(featureSectionSeeds([], all, [])).toEqual([]);
  });
});

// Clutter bug (2026-09-28, live test): feature sections were seeded with the
// optional add-on lines (Backrest Caps on every seating wall, Backsplash on
// every kitchen) even when nothing was measured for them.
import { featureSeeds } from "./sectionFeatures";
describe("feature sections start without add-on lines", () => {
  it("no Backrest Caps / Backsplash / Strip Lighting until measured", () => {
    const cats = [
      { id: "c-sw", name: "Seating Wall" },
      { id: "c-k", name: "Outdoor Kitchen" },
      { id: "c-l", name: "Outdoor Lighting" },
    ] as never[];
    const feats = ["c-sw", "c-k", "c-l"].map((c, i) => ({ id: `f${i}`, project_id: "p", category_id: c, label: null, status: "active", source_quote_id: null, sort_order: i, created_at: "" })) as never[];
    const names = featureSeeds(feats, cats, []).flatMap((s) => s.items.map((i) => i.name));
    expect(names).toContain("Wall Block");
    expect(names).not.toContain("Backrest Caps");
    expect(names).not.toContain("Backsplash");
    expect(names).not.toContain("Strip Lighting");
  });
});
