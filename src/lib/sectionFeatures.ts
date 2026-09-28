import type { Category, SmartSectionLaborDefault, SmartSectionSettings } from "./api";
import { featureName, liveFeatures, typeNameOf, type ProjectFeature } from "./features";
import type { LineCostType } from "./costPlanMath";
import { findSmartSectionSettings, findSmartSectionTemplate, startingLineItems } from "./smartSections";
import { BUILD_TYPES } from "./buildTypes";
import { buildTypeForCategoryName } from "./measurements";

/**
 * Quote / Materials Sheet section headers: the section name field doubles
 * as the feature (project type) picker. Picking a feature sets the name and
 * the section's type tag (`job_category_id`) together; a hand-typed name
 * ("Back patio") is kept as-is. Pure — shared by both builders.
 */

export interface SectionFeatureOption {
  /** Stable React key. */
  key: string;
  label: string;
  /** The Job Category to tag the section with — null for a build type the
   * contractor has no category for yet (sets the name only). */
  categoryId: string | null;
  /** A project feature (0105) this option is — the section then plans /
   * prices exactly that feature. */
  featureId?: string | null;
  /** Picking it adds a new feature of `categoryId` to the project (created
   * on Save). */
  newFeature?: boolean;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");

/**
 * The picker's two groups: the project's own types first ("primary"), then
 * "Other features…" — the contractor's other Job Categories, plus any
 * build type (Paver Patio, Fire Pit…) no category covers yet.
 */
export function sectionFeatureOptions(
  projectTypes: Category[],
  allCategories: Category[],
): { primary: SectionFeatureOption[]; other: SectionFeatureOption[] } {
  const primary = projectTypes.map((c) => ({ key: c.id, label: c.name, categoryId: c.id }));
  const primaryIds = new Set(projectTypes.map((c) => c.id));
  const other: SectionFeatureOption[] = allCategories
    .filter((c) => !primaryIds.has(c.id))
    .map((c) => ({ key: c.id, label: c.name, categoryId: c.id }));
  // Build types already covered by a category (by name or alias) aren't repeated.
  const coveredBuildTypes = new Set(
    allCategories.map((c) => buildTypeForCategoryName(c.name)?.id).filter(Boolean) as string[],
  );
  for (const b of BUILD_TYPES) {
    if (!coveredBuildTypes.has(b.id)) other.push({ key: `bt:${b.id}`, label: b.label, categoryId: null });
  }
  return { primary, other };
}

/**
 * The picker for a project's sections once it has feature records (0105):
 * its features without a section yet first, then "Other features…" — any
 * Job Category as a new feature ("Another Paver Patio" when it already has
 * one), plus build types no category covers (name only).
 */
export function featurePickerOptions(
  features: ProjectFeature[],
  allCategories: Category[],
  usedFeatureIds: Set<string>,
): { primary: SectionFeatureOption[]; other: SectionFeatureOption[] } {
  const live = liveFeatures(features);
  const primary = live
    .filter((f) => !usedFeatureIds.has(f.id))
    .map((f) => ({ key: f.id, label: featureName(f, allCategories), categoryId: f.category_id, featureId: f.id }));
  const typesOnProject = new Set(live.map((f) => f.category_id));
  const other: SectionFeatureOption[] = allCategories.map((c) => ({
    key: `new:${c.id}`,
    label: typesOnProject.has(c.id) ? `Another ${c.name}` : c.name,
    categoryId: c.id,
    newFeature: true,
  }));
  const coveredBuildTypes = new Set(
    allCategories.map((c) => buildTypeForCategoryName(c.name)?.id).filter(Boolean) as string[],
  );
  for (const b of BUILD_TYPES) {
    if (!coveredBuildTypes.has(b.id)) other.push({ key: `bt:${b.id}`, label: b.label, categoryId: null });
  }
  return { primary, other };
}

/** The Job Category a typed name means ("Outdoor kitchen" → the "Outdoor
 * Kitchen" category; aliases like "Patio" → "Paver Patio" too). Project
 * types win over other categories. null when nothing matches. */
export function categoryForSectionName(name: string, projectTypes: Category[], allCategories: Category[]): string | null {
  const n = norm(name);
  if (!n) return null;
  const byName = (list: Category[]) => list.find((c) => norm(c.name) === n);
  const direct = byName(projectTypes) ?? byName(allCategories);
  if (direct) return direct.id;
  // Alias route: both the name and a category resolve to the same build type.
  const bt = buildTypeForCategoryName(name)?.id;
  if (!bt) return null;
  const viaBuildType = (list: Category[]) => list.find((c) => buildTypeForCategoryName(c.name)?.id === bt);
  return (viaBuildType(projectTypes) ?? viaBuildType(allCategories))?.id ?? null;
}

/** The category a build type maps to (project types first, then every
 * category) — the same alias mapping sections use. Quick Quote tags its line
 * item with it so Revenue by category counts it. */
export function categoryIdForBuildType(buildType: string, projectTypes: Category[], allCategories: Category[]): string | null {
  const via = (list: Category[]) => list.find((c) => buildTypeForCategoryName(c.name)?.id === buildType);
  return (via(projectTypes) ?? via(allCategories))?.id ?? null;
}

/** A name counts as autofilled (safe to follow the type) when it's empty or
 * is exactly the current type's name — anything else was typed by hand. */
export function isAutofilledSectionName(name: string, typeName: string | null | undefined): boolean {
  return !name.trim() || (!!typeName && norm(name) === norm(typeName));
}

/**
 * The section after its type chip changes: the name follows the new type
 * only while it's still autofilled; clearing the type leaves the name.
 */
export function withSectionType<S extends { name: string; job_category_id?: string | null }>(
  section: S,
  categoryId: string | null,
  allCategories: Category[],
): S {
  const nameOf = (id: string | null | undefined) => (id ? allCategories.find((c) => c.id === id)?.name ?? null : null);
  const next = { ...section, job_category_id: categoryId };
  const newName = nameOf(categoryId);
  if (newName && isAutofilledSectionName(section.name, nameOf(section.job_category_id))) next.name = newName;
  return next;
}

/** The section after its name is committed (Enter / blur): an untyped
 * section whose name matches a feature gets that type. */
export function withCommittedSectionName<S extends { name: string; job_category_id?: string | null }>(
  section: S,
  projectTypes: Category[],
  allCategories: Category[],
): S {
  if (section.job_category_id) return section;
  const id = categoryForSectionName(section.name, projectTypes, allCategories);
  return id ? { ...section, job_category_id: id } : section;
}

// ---------------------------------------------------------------------------
// New materials sheets: one section per project feature
// ---------------------------------------------------------------------------

/** A section a new materials sheet starts with. */
export interface FeatureSectionSeed {
  name: string;
  job_category_id: string | null;
  /** The project feature this section plans (0105). */
  feature_id?: string | null;
  /** The Smart Section template it came from, when the feature has one
   * (so its header gets the calculator) — null for a feature without a
   * template (Walkway, Drainage…), which starts as a plain named section. */
  smart_section_build_type: string | null;
  /** Template lines — names + cost type only, blank quantity/price, as
   * Smart Sections start. */
  items: { name: string; cost_type: LineCostType }[];
  /** The template's labor default (Settings), if any. */
  labor: SmartSectionLaborDefault | null;
}

/**
 * One section per project type, in the project's own order: named and
 * tagged after it, and — where the feature has a Smart Section template —
 * filled with this contractor's template line items (their customized
 * list from Settings, else the shipped defaults).
 */
export function featureSectionSeeds(
  categoryIds: string[],
  allCategories: Category[],
  smartSettings: SmartSectionSettings[],
): FeatureSectionSeed[] {
  const byId = new Map(allCategories.map((c) => [c.id, c]));
  const seeds: FeatureSectionSeed[] = [];
  for (const id of categoryIds) {
    const cat = byId.get(id);
    if (!cat) continue;
    const template = findSmartSectionTemplate(buildTypeForCategoryName(cat.name)?.id ?? null);
    seeds.push({
      name: cat.name,
      job_category_id: cat.id,
      smart_section_build_type: template?.id ?? null,
      items: template
        ? startingLineItems(template, findSmartSectionSettings(smartSettings, template.id)).map((li) => ({
            name: li.name,
            cost_type: li.cost_type ?? "material",
          }))
        : [],
      labor: template ? (findSmartSectionSettings(smartSettings, template.id)?.labor_default ?? null) : null,
    });
  }
  return seeds;
}

/** The same seeds, one per project feature (0105): named after the feature
 * ("Paver Patio · Back patio"), tagged with its type and feature_id. */
export function featureSeeds(
  features: ProjectFeature[],
  allCategories: Category[],
  smartSettings: SmartSectionSettings[],
): FeatureSectionSeed[] {
  return features.map((f) => {
    const typeName = typeNameOf(f, allCategories);
    const template = findSmartSectionTemplate(buildTypeForCategoryName(typeName)?.id ?? null);
    const settings = template ? findSmartSectionSettings(smartSettings, template.id) : null;
    return {
      name: featureName(f, allCategories),
      job_category_id: f.category_id,
      feature_id: f.id,
      smart_section_build_type: template?.id ?? null,
      items: template
        ? startingLineItems(template, settings).map((li) => ({ name: li.name, cost_type: li.cost_type ?? "material" }))
        : [],
      labor: settings?.labor_default ?? null,
    };
  });
}
