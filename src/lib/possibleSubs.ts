import type { PossibleSub } from "./api";

/** Common subcontracted work spotted at a site visit (0155). `suggests` =
 * project type names it usually belongs to (first match on the job wins). */
export const SUB_PRESETS: { kind: string; label: string; suggests: string[] }[] = [
  { kind: "gas_line", label: "Gas line", suggests: ["Outdoor Kitchen", "Fire Pit", "Fireplace"] },
  { kind: "electrical", label: "Electrical", suggests: ["Outdoor Lighting", "Outdoor Kitchen", "Water Feature", "Pergola"] },
  { kind: "plumbing", label: "Water / plumbing line", suggests: ["Outdoor Kitchen", "Water Feature"] },
  { kind: "irrigation", label: "Irrigation", suggests: ["Irrigation", "Sod", "Plants"] },
  { kind: "drainage", label: "Drainage", suggests: ["Drainage", "Paver Patio", "Retaining Wall"] },
  { kind: "tree_removal", label: "Tree removal", suggests: [] },
  { kind: "excavation", label: "Excavation / hauling", suggests: [] },
  { kind: "permits", label: "Permits / engineering", suggests: ["Retaining Wall", "Pergola"] },
  { kind: "other", label: "Other", suggests: [] },
];

/** React Query key for an opportunity's possible subs (listPossibleSubs). */
export const possibleSubsKey = (opportunityId: string) => ["possible-subs", opportunityId] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The job's type a preset most likely belongs to, or null (General) —
 * the starting selection when a preset is added. */
export function suggestedCategoryFor(kind: string, jobTypes: { id: string; name: string }[]): string | null {
  const preset = SUB_PRESETS.find((p) => p.kind === kind);
  for (const name of preset?.suggests ?? []) {
    const hit = jobTypes.find((c) => norm(c.name) === norm(name));
    if (hit) return hit.id;
  }
  return null;
}

/** An item's features that are still on the job, in the item's order. */
export const liveCategoryIds = (sub: Pick<PossibleSub, "category_ids">, jobCategoryIds: string[]): string[] =>
  sub.category_ids.filter((c) => jobCategoryIds.includes(c));

/**
 * The feature picker's toggle. "General" (null) = not tied to a feature:
 * picking it clears every feature; picking a feature drops General
 * implicitly (an empty list is General).
 */
export function toggleSubCategory(current: string[], id: string | null): string[] {
  if (id === null) return [];
  return current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
}

/** "Gas line (Fire Pit, Outdoor Kitchen)" — one line covering several features. */
export const combinedLineName = (label: string, featureNames: string[]): string =>
  featureNames.length ? `${label} (${featureNames.join(", ")})` : label;

export interface SubPlanSection {
  id: string;
  /** The section's project type; null for General / an untyped section. */
  categoryId: string | null;
  isGeneral: boolean;
  /** Line names (without the " — note" part), for lines added before 0160. */
  lineNames: string[];
  /** possible_sub_id of each line in the section (draft). */
  subIds: (string | null)[];
}

export interface SubSuggestion {
  sub: PossibleSub;
  /** The item's live features (in its order) — more than one = ask how to add. */
  categoryIds: string[];
  /** Linked features other than the section's own ("Also for: …"). */
  alsoCategoryIds: string[];
}

/**
 * Where each possible sub is suggested in a Cost plan: once, never on every
 * linked section.
 * - Already added (a line with its id in this plan, or saved in another of
 *   the job's plans) → nowhere.
 * - No live features → General.
 * - Otherwise → the first section, in plan order, of any of its features;
 *   General when none of them has a section.
 * Lines added before 0160 carried no id, so a one-feature item also hides
 * when its target section has a line of the same name (the old rule).
 */
export function placeSubSuggestions(
  subs: PossibleSub[],
  sections: SubPlanSection[],
  jobCategoryIds: string[],
): Map<string, SubSuggestion[]> {
  const out = new Map<string, SubSuggestion[]>();
  const planSectionIds = new Set(sections.map((s) => s.id));
  const inPlan = new Set(sections.flatMap((s) => s.subIds).filter((x): x is string => !!x));
  const general = sections.find((s) => s.isGeneral) ?? null;

  for (const sub of subs) {
    if (inPlan.has(sub.id)) continue;
    // Saved lines in this plan follow the draft (deleting one brings the
    // suggestion back); lines in another plan count as added.
    if (sub.lines.some((l) => !planSectionIds.has(l.section_id))) continue;
    const live = liveCategoryIds(sub, jobCategoryIds);
    const target = live.length ? (sections.find((s) => !s.isGeneral && s.categoryId && live.includes(s.categoryId)) ?? general) : general;
    if (!target) continue;
    if (live.length <= 1 && target.lineNames.some((n) => norm(n) === norm(sub.label))) continue;
    const also = live.filter((c) => c !== target.categoryId);
    const list = out.get(target.id) ?? [];
    list.push({ sub, categoryIds: live, alsoCategoryIds: also });
    out.set(target.id, list);
  }
  return out;
}

/** Where a split line for one feature goes: that feature's first section,
 * else General. */
export function sectionForCategory(sections: SubPlanSection[], categoryId: string): SubPlanSection | null {
  return sections.find((s) => !s.isGeneral && s.categoryId === categoryId) ?? sections.find((s) => s.isGeneral) ?? null;
}
