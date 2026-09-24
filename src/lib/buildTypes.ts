/**
 * The hardscape build-type taxonomy shared in spirit by Smart Section
 * (Materials Sheet), Quick Quote (Quotes) and project Measurements
 * (src/lib/measurements.ts) — same job types, same ids,
 * so the two features present a consistent list to the contractor. Their
 * actual data (line-item templates/calculator numbers vs. a single
 * pricing rate) is completely separate and lives in src/lib/smartSections/
 * and src/lib/quickQuote/ respectively; this file exists only so both can
 * agree on what a "build type" is without one depending on the other.
 *
 * Smart Section's own registry (src/lib/smartSections/) is left as-is
 * rather than refactored to import this — it already works and isn't part
 * of this feature. Quick Quote and Measurements consume this list directly.
 *
 * Only the first 5 have Smart Section / Quick Quote templates. The rest
 * were added for Measurements (each has its own field set there); Quick
 * Quote's picker filters to types that have a template, so adding a type
 * here never shows a template-less option in it.
 */
export interface BuildType {
  id: string;
  label: string;
}

export const BUILD_TYPES: BuildType[] = [
  { id: "paver_patio", label: "Paver Patio" },
  { id: "outdoor_kitchen", label: "Outdoor Kitchen" },
  { id: "seating_wall", label: "Seating Wall" },
  { id: "fire_pit", label: "Fire Pit" },
  { id: "outdoor_lighting", label: "Outdoor Lighting" },
  { id: "walkway", label: "Walkway" },
  { id: "driveway", label: "Driveway" },
  { id: "retaining_wall", label: "Retaining Wall" },
  { id: "steps", label: "Steps" },
  { id: "pillars", label: "Pillars / Columns" },
];
