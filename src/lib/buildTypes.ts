/**
 * The hardscape build-type taxonomy shared in spirit by Smart Section
 * (Materials Sheet) and Quick Quote (Quotes) — same 5 job types, same ids,
 * so the two features present a consistent list to the contractor. Their
 * actual data (line-item templates/calculator numbers vs. a single
 * pricing rate) is completely separate and lives in src/lib/smartSections/
 * and src/lib/quickQuote/ respectively; this file exists only so both can
 * agree on what a "build type" is without one depending on the other.
 *
 * Smart Section's own registry (src/lib/smartSections/) is left as-is
 * rather than refactored to import this — it already works and isn't part
 * of this feature. Only Quick Quote consumes this list directly.
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
];
