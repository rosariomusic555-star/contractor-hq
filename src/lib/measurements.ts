import { BUILD_TYPES, type BuildType } from "./buildTypes";

/**
 * Project measurements — the one config for which fields each build type
 * asks for. The Measurements card (opportunity + project pages) renders from
 * this; the Smart Section calculator and Quick Quote can later prefill from
 * the same stored rows via measurementValuesFor().
 *
 * Build types come from BUILD_TYPES (src/lib/buildTypes.ts) — never a second
 * list. A project's selected Project types are the contractor's own editable
 * Job Categories (free-text names), so each category is matched to a build
 * type by name (label + BUILD_TYPE_ALIASES below). A category that matches
 * nothing (e.g. "Drainage", "Other") gets a group of free rows instead.
 *
 * Stored rows (project_measurements, migration 0091) are keyed by
 * (build_type | category_id | general) + field_key, so removing a type just
 * hides its group — its values stay and reappear when it's re-added.
 */

export type MeasurementUnit = "sq_ft" | "linear_ft" | "ft" | "in" | "count" | "cu_yd";

export const MEASUREMENT_UNITS: { id: MeasurementUnit; suffix: string }[] = [
  { id: "sq_ft", suffix: "sq ft" },
  { id: "linear_ft", suffix: "linear ft" },
  { id: "ft", suffix: "ft" },
  { id: "in", suffix: "in" },
  { id: "count", suffix: "count" },
  { id: "cu_yd", suffix: "cu yd" },
];

export const unitSuffix = (unit: string | null): string =>
  unit ? (MEASUREMENT_UNITS.find((u) => u.id === unit)?.suffix ?? unit) : "";

export interface MeasurementField {
  key: string;
  label: string;
  /** null only for "choice" fields (no unit). */
  unit: MeasurementUnit | null;
  /** "choice" stores its pick in value_text; everything else is a number. */
  kind?: "number" | "choice";
  options?: { value: string; label: string }[];
  /** Only shown when another field in the same group has this value. */
  showWhen?: { field: string; equals: string };
}

const area: MeasurementField = { key: "area_sqft", label: "Area", unit: "sq_ft" };

/** Build type id → its fields. A build type missing here falls back to free
 * rows only. */
export const BUILD_TYPE_MEASUREMENTS: Record<string, MeasurementField[]> = {
  paver_patio: [area],
  walkway: [area],
  driveway: [area],
  retaining_wall: [
    { key: "length_lf", label: "Length", unit: "linear_ft" },
    { key: "height_ft", label: "Height", unit: "ft" },
  ],
  seating_wall: [
    { key: "length_lf", label: "Length", unit: "linear_ft" },
    { key: "height_in", label: "Height", unit: "in" },
  ],
  outdoor_kitchen: [
    { key: "counter_length_lf", label: "Counter length", unit: "linear_ft" },
    { key: "counter_depth_in", label: "Counter depth", unit: "in" },
  ],
  fire_pit: [
    {
      key: "shape",
      label: "Shape",
      unit: null,
      kind: "choice",
      options: [
        { value: "round", label: "Round" },
        { value: "square", label: "Square" },
      ],
    },
    { key: "diameter_ft", label: "Diameter", unit: "ft", showWhen: { field: "shape", equals: "round" } },
    { key: "width_ft", label: "Width", unit: "ft", showWhen: { field: "shape", equals: "square" } },
    { key: "length_ft", label: "Length", unit: "ft", showWhen: { field: "shape", equals: "square" } },
  ],
  steps: [
    { key: "step_count", label: "Number of steps", unit: "count" },
    { key: "width_ft", label: "Width", unit: "ft" },
  ],
  pillars: [
    { key: "count", label: "Count", unit: "count" },
    { key: "height_in", label: "Height", unit: "in" },
  ],
  outdoor_lighting: [
    { key: "fixture_count", label: "Fixture count", unit: "count" },
    { key: "wire_run_lf", label: "Wire run", unit: "linear_ft" },
  ],
};

/** Extra category names (beyond the build type's own label) that map to it.
 * Matching is case/punctuation-insensitive — "Fire Pit / Fireplace" and
 * "fire-pit" both hit fire_pit. */
export const BUILD_TYPE_ALIASES: Record<string, string[]> = {
  paver_patio: ["Patio", "Pavers", "Paver"],
  walkway: ["Walkways", "Path", "Pathway", "Sidewalk"],
  driveway: ["Driveways"],
  retaining_wall: ["Retaining Walls"],
  seating_wall: ["Seat Wall", "Seat Walls", "Seating Walls"],
  outdoor_kitchen: ["Kitchen", "BBQ Island", "Grill Island"],
  fire_pit: ["Fire Pit / Fireplace", "Firepit", "Fireplace", "Fire Feature"],
  steps: ["Stairs", "Step"],
  pillars: ["Pillars", "Columns", "Pillar", "Column", "Pillars/Columns"],
  outdoor_lighting: ["Lighting", "Landscape Lighting"],
};

/** The free-row unit picker for "+ Add measurement" / unmapped types. */
export const FREE_ROW_UNITS: MeasurementUnit[] = ["sq_ft", "linear_ft", "ft", "in", "count", "cu_yd"];

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The build type a Job Category name corresponds to, or null. */
export function buildTypeForCategoryName(name: string): BuildType | null {
  const n = normalize(name);
  if (!n) return null;
  return (
    BUILD_TYPES.find(
      (b) => normalize(b.label) === n || (BUILD_TYPE_ALIASES[b.id] ?? []).some((a) => normalize(a) === n),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Rows + groups
// ---------------------------------------------------------------------------

/** One stored measurement (project_measurements). Exactly one of
 * build_type / category_id is set, or neither for the General group. */
export interface MeasurementRow {
  id: string;
  project_id: string;
  build_type: string | null;
  category_id: string | null;
  field_key: string;
  /** Only for free rows ("custom_*" keys) — config fields take their label
   * from BUILD_TYPE_MEASUREMENTS. */
  label: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  sort_order: number;
}

export interface MeasurementGroup {
  key: string;
  title: string;
  build_type: string | null;
  category_id: string | null;
  fields: MeasurementField[];
}

export const GENERAL_GROUP_KEY = "general";

export const groupKeyOf = (r: Pick<MeasurementRow, "build_type" | "category_id">): string =>
  r.build_type ? `bt:${r.build_type}` : r.category_id ? `cat:${r.category_id}` : GENERAL_GROUP_KEY;

export const isFreeRowKey = (fieldKey: string) => fieldKey.startsWith("custom_");

/**
 * One group per selected Project type, in the order selected. Categories
 * that resolve to the same build type share one group (headed by the build
 * type's label); unmapped categories each get their own free-row group
 * headed by the category name.
 */
export function measurementGroupsFor(
  selectedCategoryIds: string[],
  categories: { id: string; name: string }[],
): MeasurementGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups: MeasurementGroup[] = [];
  const seen = new Set<string>();
  for (const cid of selectedCategoryIds) {
    const cat = byId.get(cid);
    if (!cat) continue;
    const bt = buildTypeForCategoryName(cat.name);
    const group: MeasurementGroup = bt
      ? { key: `bt:${bt.id}`, title: bt.label, build_type: bt.id, category_id: null, fields: BUILD_TYPE_MEASUREMENTS[bt.id] ?? [] }
      : { key: `cat:${cat.id}`, title: cat.name, build_type: null, category_id: cat.id, fields: [] };
    if (seen.has(group.key)) continue;
    seen.add(group.key);
    groups.push(group);
  }
  return groups;
}

export const GENERAL_GROUP: MeasurementGroup = {
  key: GENERAL_GROUP_KEY,
  title: "General",
  build_type: null,
  category_id: null,
  fields: [],
};

/** Whether a config field is currently visible given its group's rows. */
export function fieldVisible(field: MeasurementField, groupRows: Pick<MeasurementRow, "field_key" | "value_text">[]): boolean {
  if (!field.showWhen) return true;
  const dep = groupRows.find((r) => r.field_key === field.showWhen!.field);
  return dep?.value_text === field.showWhen.equals;
}

/**
 * Total area in sq ft across the visible groups — every sq-ft-unit value
 * (patio/walkway/driveway area + any free sq ft rows). Kept in
 * projects.size_sqft so the Labor page's productivity metrics keep reading
 * one number. Hidden (deselected) groups don't count.
 */
export function totalAreaSqft(rows: MeasurementRow[], visibleGroupKeys: Set<string>): number | null {
  const total = rows
    .filter((r) => r.unit === "sq_ft" && r.value != null && visibleGroupKeys.has(groupKeyOf(r)))
    .reduce((sum, r) => sum + Number(r.value), 0);
  return total > 0 ? total : null;
}

/** Prefill hook for Smart Section / Quick Quote: a build type's stored
 * config values as { field_key: number | string }. */
export function measurementValuesFor(rows: MeasurementRow[], buildTypeId: string): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const r of rows) {
    if (r.build_type !== buildTypeId || isFreeRowKey(r.field_key)) continue;
    const v = r.value ?? r.value_text;
    if (v != null) out[r.field_key] = v;
  }
  return out;
}
