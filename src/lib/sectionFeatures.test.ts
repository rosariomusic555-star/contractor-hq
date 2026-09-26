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
      { name: "Techo-Bloc pavers", cost_type: "material" },
      { name: "Skid steer rental", cost_type: "equipment" },
    ]);
    expect(seed.labor).toEqual({ crew_size: 3, days: 4 });
  });

  it("no project types → no sections", () => {
    expect(featureSectionSeeds([], all, [])).toEqual([]);
  });
});
