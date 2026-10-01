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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The job's type a preset most likely belongs to, or null (General). */
export function suggestedCategoryFor(kind: string, jobTypes: { id: string; name: string }[]): string | null {
  const preset = SUB_PRESETS.find((p) => p.kind === kind);
  for (const name of preset?.suggests ?? []) {
    const hit = jobTypes.find((c) => norm(c.name) === norm(name));
    if (hit) return hit.id;
  }
  return null;
}

/**
 * Which possible subs to suggest on a Cost plan section: those linked to
 * the section's project type (or, for General / an unmatched section, the
 * unlinked ones), minus any whose name is already a line in that section.
 */
export function subsForSection(
  subs: PossibleSub[],
  section: { categoryId: string | null; isGeneral: boolean; lineNames: string[] },
  jobCategoryIds: string[],
): PossibleSub[] {
  const have = new Set(section.lineNames.map(norm));
  return subs.filter((s) => {
    if (have.has(norm(s.label))) return false;
    // A sub tied to a type that's no longer on the job falls back to General.
    const target = s.category_id && jobCategoryIds.includes(s.category_id) ? s.category_id : null;
    return section.isGeneral ? target === null : !!section.categoryId && target === section.categoryId;
  });
}
