import { BUILD_TYPES, type BuildType } from "./buildTypes";

/**
 * Project measurements — the one source for what each feature measures, how
 * its totals are computed, and how those totals feed Smart Section, Quick
 * Quote and the Labor page. Pure; no React, no Supabase.
 *
 * Two kinds of stored data, both on the project (shared by the opportunity
 * and project pages):
 *
 * 1. Feature instances (project_feature_measurements, migration 0098) — one
 *    row per patio / wall / kitchen…, with typed `data` (method, shape,
 *    dimensions) and the computed `totals` written alongside it on save so
 *    SQL/reporting can read them without this file. A build type gets
 *    instances only if it has a purpose-built card (FEATURE_KIND below).
 *
 * 2. Custom measurements (project_measurements, migration 0091) — the old
 *    generic label + quantity + unit rows, now informational only (they never
 *    drive a calculation). Grouped by build_type | category_id | general,
 *    same as before.
 *
 * Build types come from BUILD_TYPES (src/lib/buildTypes.ts) — never a second
 * list. A project's selected Project types are the contractor's own Job
 * Categories (free-text names), matched to a build type by name (label +
 * BUILD_TYPE_ALIASES). A category that matches nothing (e.g. "Drainage"), or
 * a build type with no card yet (Pillars), gets custom measurements only.
 */

// ---------------------------------------------------------------------------
// Build type ↔ category name matching
// ---------------------------------------------------------------------------

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
  pergola: ["Pergolas", "Arbor", "Shade Structure"],
  water_feature: ["Water Features", "Fountain", "Pond", "Waterfall"],
  sod: ["Sod Installation", "Turf", "Lawn", "New Lawn"],
  irrigation: ["Sprinklers", "Sprinkler System", "Irrigation System"],
  plants: ["Plantings", "Planting", "Plant Installation", "Landscaping Plants"],
};

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
// Feature data (one instance's typed `data`)
// ---------------------------------------------------------------------------

type Num = number | null;

export type AreaMethod = "dimensions" | "total";
export type PatioShape = "rectangle" | "l_shape" | "u_shape" | "irregular";

/** L-shape, by its four outer edges: A bottom (full length), B left (full
 * depth), C top (the upper arm), D right (the lower arm's depth). The two
 * inner edges follow from these. Area = C·B + (A−C)·D. */
export interface LShapeDims { a: Num; b: Num; c: Num; d: Num }

/** U-shape (opening at the top): A bottom (full length), B left edge, C
 * left arm's top, D right edge, E right arm's top, F the base band's depth
 * (bottom of the opening). Area = C·B + E·D + (A−C−E)·F. */
export interface UShapeDims { a: Num; b: Num; c: Num; d: Num; e: Num; f: Num }

export interface RectArea { id: string; label: string; length_ft: Num; width_ft: Num }

/** Walkway U: a "]"-shaped path of one width — top leg A, side leg B, bottom
 * leg C (same direction as A), each measured along its outer edge. Area =
 * (A + B + C) × width − 2 × width² (the two corner squares are in two legs
 * each). `open_right` only mirrors the diagram. */
export interface PathUDims { a: Num; b: Num; c: Num; width: Num; open_right: boolean }

export interface PatioData {
  method: AreaMethod;
  total_sqft: Num;
  shape: PatioShape;
  // Every shape's dimensions are kept, so flipping the shape back and forth
  // never loses what was typed.
  rect: { length_ft: Num; width_ft: Num };
  l: LShapeDims;
  u: UShapeDims;
  /** Walkway's U-shape (a path), separate from the patio's block `u`. */
  path_u: PathUDims;
  areas: RectArea[];
}

/** Walkway + Driveway — the patio's area builder, limited to the shapes in
 * areaShapesFor() (Straight = the rectangle, L-shape, [U-shape,] Irregular). */
export type FlatworkData = PatioData;

/** Which shapes each area feature offers, and what the rectangle is called.
 * A walkway's U-shape is a path (PathUDims), a patio's a block (u). */
export const AREA_SHAPES: Record<"patio" | "flatwork" | "walkway", { value: PatioShape; label: string }[]> = {
  patio: [
    { value: "rectangle", label: "Rectangle" },
    { value: "l_shape", label: "L-shape" },
    { value: "u_shape", label: "U-shape" },
    { value: "irregular", label: "Irregular" },
  ],
  flatwork: [
    { value: "rectangle", label: "Straight" },
    { value: "l_shape", label: "L-shape" },
    { value: "irregular", label: "Irregular" },
  ],
  walkway: [
    { value: "rectangle", label: "Straight" },
    { value: "l_shape", label: "L-shape" },
    { value: "u_shape", label: "U-shape" },
    { value: "irregular", label: "Irregular" },
  ],
};

export const areaShapesFor = (kind: "patio" | "flatwork", buildType: string | null | undefined) =>
  kind === "flatwork" && buildType === "walkway" ? AREA_SHAPES.walkway : AREA_SHAPES[kind];

/** How the Straight/Rectangle diagram is drawn: a walkway as a tall, narrow
 * strip (length runs top-to-bottom); a patio or driveway as a wide block.
 * Visual only — the math is always length × width. */
export const areaRectStyle = (buildType: string | null | undefined): "tall" | "wide" =>
  buildType === "walkway" ? "tall" : "wide";

/** A run-based feature (Outdoor Kitchen, Seating Wall): a layout plus the
 * length of each run. Straight/Curved use run A, L-shape A–B, U-shape A–C,
 * Custom all of them. Curved is one length measured along the curve. */
export type RunLayout = "straight" | "l_shape" | "u_shape" | "curved" | "custom";
export interface Run {
  id: string;
  length_ft: Num;
  /** Carried over from an old seating wall section's label. */
  label: string;
}
export type KitchenLayout = Exclude<RunLayout, "curved">;
export interface KitchenData {
  layout: KitchenLayout;
  runs: Run[];
  /** null = the contractor's default counter height (Settings › Smart
   * Section templates › Outdoor Kitchen › Default counter height). */
  height_in: Num;
}
export interface SeatingWallData {
  layout: RunLayout;
  runs: Run[];
  /** One height for the whole wall. */
  height_in: Num;
}

/** Walls (seating, retaining) get every layout incl. Curved; a kitchen
 * doesn't curve. */
const WALL_LAYOUTS: { value: RunLayout; label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "l_shape", label: "L-shape" },
  { value: "u_shape", label: "U-shape" },
  { value: "curved", label: "Curved" },
  { value: "custom", label: "Custom" },
];

export const RUN_LAYOUTS: Record<"kitchen" | "seating_wall" | "retaining_wall", { value: RunLayout; label: string }[]> = {
  kitchen: [
    { value: "straight", label: "Straight" },
    { value: "l_shape", label: "L-shape" },
    { value: "u_shape", label: "U-shape" },
    { value: "custom", label: "Custom" },
  ],
  seating_wall: WALL_LAYOUTS,
  retaining_wall: WALL_LAYOUTS,
};

export type RetainingMethod = "lf_height" | "wall_sqft";
export interface RetainingWallData {
  method: RetainingMethod;
  /** LF × Height: the wall's runs (same builder as the Seating Wall) and
   * one average height for the whole wall. */
  layout: RunLayout;
  runs: Run[];
  height_ft: Num;
  /** Wall sq ft method: the face area entered directly. */
  wall_sqft: Num;
}

export type FirePitShape = "round" | "rect" | "custom";
export interface FirePitData {
  shape: FirePitShape;
  diameter_ft: Num;
  length_ft: Num;
  width_ft: Num;
  description: string;
  approx_sqft: Num;
  /** null = the contractor's default (Settings › Smart Section templates ›
   * Fire Pit › Default pit height). */
  height_in: Num;
}

export type FixtureType = "path" | "uplight" | "hardscape" | "step" | "other";
export interface FixtureRow { id: string; type: FixtureType; name: string; qty: Num }
export interface LightingData { fixtures: FixtureRow[] }

export interface StepSection { id: string; label: string; step_count: Num; width_ft: Num }
export interface StepsData { sections: StepSection[] }

export type FeatureKind =
  | "patio"
  | "flatwork"
  | "kitchen"
  | "seating_wall"
  | "retaining_wall"
  | "fire_pit"
  | "lighting"
  | "steps";

export interface FeatureDataByKind {
  patio: PatioData;
  flatwork: FlatworkData;
  kitchen: KitchenData;
  seating_wall: SeatingWallData;
  retaining_wall: RetainingWallData;
  fire_pit: FirePitData;
  lighting: LightingData;
  steps: StepsData;
}
export type FeatureData = FeatureDataByKind[FeatureKind];

/** Build types with a purpose-built card. Anything missing here (Pillars,
 * unmapped categories, new types) gets custom measurements only. */
export const FEATURE_KIND: Record<string, FeatureKind> = {
  paver_patio: "patio",
  walkway: "flatwork",
  driveway: "flatwork",
  outdoor_kitchen: "kitchen",
  seating_wall: "seating_wall",
  retaining_wall: "retaining_wall",
  fire_pit: "fire_pit",
  outdoor_lighting: "lighting",
  steps: "steps",
  // Area card (L×W / L-shape / irregular → sq ft): footprint / coverage.
  pergola: "patio",
  water_feature: "patio",
  sod: "patio",
  irrigation: "patio",
};

export const featureKindOf = (buildType: string | null): FeatureKind | null =>
  (buildType && FEATURE_KIND[buildType]) || null;

/** "Paver Patio" → "+ Add another patio". */
export const INSTANCE_NOUN: Record<string, string> = {
  paver_patio: "patio",
  walkway: "walkway",
  driveway: "driveway",
  outdoor_kitchen: "kitchen",
  seating_wall: "seating wall",
  retaining_wall: "retaining wall",
  fire_pit: "fire pit",
  outdoor_lighting: "lighting area",
  steps: "set of steps",
  pergola: "pergola",
  water_feature: "water feature",
  sod: "lawn area",
  irrigation: "irrigated area",
};

export const FIXTURE_TYPES: { id: FixtureType; label: string }[] = [
  { id: "path", label: "Path light" },
  { id: "uplight", label: "Uplight" },
  { id: "hardscape", label: "Hardscape/ledge light" },
  { id: "step", label: "Step light" },
  { id: "other", label: "Other" },
];

/** App defaults for heights the contractor can override — each is also the
 * shipped value of a Smart Section tunable, so it's edited in Settings ›
 * Smart Section templates next to that build type's other defaults. */
export const DEFAULT_FIRE_PIT_HEIGHT_IN = 18;
export const FIRE_PIT_HEIGHT_TUNABLE = "pit_height_in"; // src/lib/smartSections/firePit.ts
export const DEFAULT_KITCHEN_HEIGHT_IN = 36;
export const KITCHEN_HEIGHT_TUNABLE = "counter_height_in"; // src/lib/smartSections/outdoorKitchen.ts

/** Resolved contractor defaults, passed to computeTotals(). */
export interface MeasurementDefaults {
  firePitHeightIn?: number;
  kitchenHeightIn?: number;
}

export const newId = () => crypto.randomUUID();

const rect = () => ({ length_ft: null, width_ft: null });
const blankRuns = (): Run[] => [0, 1, 2].map(() => ({ id: newId(), length_ft: null, label: "" }));
const blankArea = (): PatioData => ({
  method: "dimensions",
  total_sqft: null,
  shape: "rectangle",
  rect: rect(),
  l: { a: null, b: null, c: null, d: null },
  u: { a: null, b: null, c: null, d: null, e: null, f: null },
  path_u: { a: null, b: null, c: null, width: null, open_right: false },
  areas: [{ id: newId(), label: "", length_ft: null, width_ft: null }],
});

export function blankData<K extends FeatureKind>(kind: K): FeatureDataByKind[K] {
  const data: { [P in FeatureKind]: () => FeatureDataByKind[P] } = {
    patio: blankArea,
    flatwork: blankArea,
    kitchen: () => ({ layout: "straight", runs: blankRuns(), height_in: null }),
    seating_wall: () => ({ layout: "straight", runs: blankRuns(), height_in: null }),
    retaining_wall: () => ({ method: "lf_height", layout: "straight", runs: blankRuns(), height_ft: null, wall_sqft: null }),
    fire_pit: () => ({
      shape: "round",
      diameter_ft: null,
      length_ft: null,
      width_ft: null,
      description: "",
      approx_sqft: null,
      height_in: null,
    }),
    lighting: () => ({ fixtures: [{ id: newId(), type: "path", name: "", qty: null }] }),
    steps: () => ({ sections: [{ id: newId(), label: "", step_count: null, width_ft: null }] }),
  };
  return data[kind]() as FeatureDataByKind[K];
}

/** Most frequent positive value; ties go to the one seen first. */
function mostCommon(values: Num[]): Num {
  const counts = new Map<number, number>();
  for (const v of values) if (typeof v === "number" && v > 0) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: Num = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

/**
 * Rows saved in an earlier data shape, upgraded on read (and written back in
 * the new shape on the next Save — no SQL migration needed):
 *  - Seating wall sections + per-section heights (0098 / first release) →
 *    runs + one height: the wall height if there was one, else the most
 *    common section height. One straight/curved section keeps that layout;
 *    anything else becomes Custom runs, one per section, labels kept.
 *  - Walkway/Driveway plain length × width → the area builder's Straight.
 *  - Retaining wall single linear-feet value → one Straight run.
 */
function upgradeLegacy(kind: FeatureKind, src: Record<string, unknown>): Record<string, unknown> {
  if (kind === "seating_wall" && Array.isArray(src.sections) && !Array.isArray(src.runs)) {
    type OldSection = { id?: string; label?: string; length_lf?: Num; geometry?: string; height_in?: Num };
    const sections = src.sections as OldSection[];
    const sectionHeights = sections.map((x) => x.height_in ?? null);
    const height = src.per_section_height
      ? mostCommon(sectionHeights) ?? (src.height_in as Num) ?? null
      : (src.height_in as Num) ?? mostCommon(sectionHeights);
    const only = sections.length === 1 ? sections[0] : null;
    const layout: RunLayout =
      sections.length === 0 ? "straight" : only ? (only.geometry === "curved" ? "curved" : only.geometry === "l_shape" ? "custom" : "straight") : "custom";
    return {
      layout,
      height_in: height,
      runs: sections.map((x) => ({ id: x.id || newId(), length_ft: x.length_lf ?? null, label: x.label ?? "" })),
    };
  }
  if (kind === "retaining_wall" && "length_lf" in src && !Array.isArray(src.runs)) {
    const { length_lf, ...rest } = src;
    return { ...rest, layout: "straight", runs: [{ id: newId(), length_ft: (length_lf as Num) ?? null, label: "" }] };
  }
  if (kind === "flatwork" && !src.rect && ("length_ft" in src || "width_ft" in src)) {
    const { length_ft, width_ft, ...rest } = src;
    return { ...rest, shape: "rectangle", rect: { length_ft: length_ft ?? null, width_ft: width_ft ?? null } };
  }
  return src;
}

/** Stored JSON → a complete data object (fills anything missing from an
 * older/partial row, e.g. the 0098 backfill, with blanks). */
export function normalizeData<K extends FeatureKind>(kind: K, raw: unknown): FeatureDataByKind[K] {
  const base = blankData(kind) as unknown as Record<string, unknown>;
  const src = upgradeLegacy(kind, raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    const b = base[k];
    // Merge nested dimension objects (rect / l / u) key by key.
    if (b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = { ...(b as object), ...(v as object) };
    } else if (Array.isArray(b)) {
      // Arrays: stored wins (even empty); make sure every row has an id.
      out[k] = Array.isArray(v)
        ? (v as Record<string, unknown>[]).map((row) => ({ ...(b[0] as object), ...row, id: (row?.id as string) || newId() }))
        : b;
    } else {
      out[k] = v;
    }
  }
  // Run layouts need at least three run slots to flip between.
  if (kind === "kitchen" || kind === "seating_wall" || kind === "retaining_wall") {
    const runs = out.runs as Run[];
    while (runs.length < 3) runs.push({ id: newId(), length_ft: null, label: "" });
  }
  return out as unknown as FeatureDataByKind[K];
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/** What an instance (or a whole feature, summed) adds up to. Only the keys
 * that make sense for the feature are set. Stored on each row as `totals`. */
export interface FeatureTotals {
  /** Paver Patio / Walkway / Driveway surface. */
  area_sqft?: number;
  /** Outer edge length where it's known exactly (rectangle, L, U, round,
   * rect fire pit). Absent when only a total sq ft was entered. */
  perimeter_ft?: number;
  /** Kitchen run, seating wall, retaining wall length. */
  linear_ft?: number;
  /** Retaining wall face. */
  wall_sqft?: number;
  /** Fire pit footprint. */
  footprint_sqft?: number;
  height_in?: number;
  fixture_count?: number;
  step_count?: number;
  /** Steps: Σ steps × width — linear feet of tread. */
  tread_lf?: number;
}

const n = (v: Num | undefined): number => (typeof v === "number" && isFinite(v) ? v : 0);
const has = (v: Num | undefined): boolean => typeof v === "number" && isFinite(v) && v > 0;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Area of one L/U, and whether the edges are consistent (arms no wider
 * than the whole). */
export function lShapeArea(d: LShapeDims): { area: number; valid: boolean } {
  const area = n(d.c) * n(d.b) + Math.max(n(d.a) - n(d.c), 0) * n(d.d);
  const valid = !(has(d.a) && has(d.c) && n(d.c) > n(d.a)) && !(has(d.b) && has(d.d) && n(d.d) > n(d.b));
  return { area, valid };
}

/** Walkway U path. Valid when each end leg is at least one width long and
 * the side leg at least two (else the corners would overlap past the legs). */
export function pathUArea(d: PathUDims): { area: number; valid: boolean } {
  const w = n(d.width);
  const legs = n(d.a) + n(d.b) + n(d.c);
  const area = w > 0 && legs > 0 ? Math.max(legs * w - 2 * w * w, 0) : 0;
  const valid = !(w > 0 && ((has(d.a) && n(d.a) < w) || (has(d.c) && n(d.c) < w) || (has(d.b) && n(d.b) < 2 * w)));
  return { area, valid };
}

export function uShapeArea(d: UShapeDims): { area: number; valid: boolean } {
  const middle = Math.max(n(d.a) - n(d.c) - n(d.e), 0);
  const area = n(d.c) * n(d.b) + n(d.e) * n(d.d) + middle * n(d.f);
  const valid =
    !(has(d.a) && n(d.c) + n(d.e) > n(d.a)) &&
    !(has(d.f) && ((has(d.b) && n(d.f) > n(d.b)) || (has(d.d) && n(d.f) > n(d.d))));
  return { area, valid };
}

/** How many runs each fixed layout uses. */
export const RUN_COUNT: Record<Exclude<RunLayout, "custom">, number> = {
  straight: 1,
  curved: 1,
  l_shape: 2,
  u_shape: 3,
};
export const activeRuns = (d: { layout: RunLayout; runs: Run[] }): Run[] =>
  d.layout === "custom" ? d.runs : d.runs.slice(0, RUN_COUNT[d.layout]);

export const runLetter = (i: number) => String.fromCharCode(65 + i);

function clean(t: FeatureTotals): FeatureTotals {
  const out: FeatureTotals = {};
  for (const [k, v] of Object.entries(t)) if (typeof v === "number" && isFinite(v) && v > 0) out[k as keyof FeatureTotals] = round2(v);
  return out;
}

/** One instance's totals. `defaults` resolves the "use default" heights
 * (fire pit, kitchen counter). */
export function computeTotals(kind: FeatureKind, data: FeatureData, defaults: MeasurementDefaults = {}): FeatureTotals {
  switch (kind) {
    case "patio":
    case "flatwork": {
      const d = data as PatioData;
      if (d.method === "total") return clean({ area_sqft: n(d.total_sqft) });
      switch (d.shape) {
        case "rectangle":
          return clean({
            area_sqft: n(d.rect.length_ft) * n(d.rect.width_ft),
            perimeter_ft: has(d.rect.length_ft) && has(d.rect.width_ft) ? 2 * (n(d.rect.length_ft) + n(d.rect.width_ft)) : 0,
          });
        case "l_shape": {
          const complete = [d.l.a, d.l.b, d.l.c, d.l.d].every(has);
          // Any rectilinear L's perimeter is 2 × (full length + full depth).
          return clean({ area_sqft: lShapeArea(d.l).area, perimeter_ft: complete ? 2 * (n(d.l.a) + n(d.l.b)) : 0 });
        }
        case "u_shape": {
          if (kind === "flatwork") {
            const p = d.path_u;
            const complete = [p.a, p.b, p.c, p.width].every(has);
            // Outer edges A+B+C, inner edges (A−w)+(B−2w)+(C−w), two end caps.
            return clean({
              area_sqft: pathUArea(p).area,
              perimeter_ft: complete ? 2 * (n(p.a) + n(p.b) + n(p.c)) - 2 * n(p.width) : 0,
            });
          }
          const u = d.u;
          const complete = [u.a, u.b, u.c, u.d, u.e, u.f].every(has);
          // Walk the outline: A + B + C + (B−F) + (A−C−E) + (D−F) + E + D.
          return clean({
            area_sqft: uShapeArea(u).area,
            perimeter_ft: complete ? 2 * n(u.a) + 2 * n(u.b) + 2 * n(u.d) - 2 * n(u.f) : 0,
          });
        }
        case "irregular":
          return clean({ area_sqft: d.areas.reduce((s, r) => s + n(r.length_ft) * n(r.width_ft), 0) });
      }
      return {};
    }
    case "kitchen": {
      const d = data as KitchenData;
      return clean({
        linear_ft: activeRuns(d).reduce((s, r) => s + n(r.length_ft), 0),
        height_in: has(d.height_in) ? n(d.height_in) : defaults.kitchenHeightIn ?? DEFAULT_KITCHEN_HEIGHT_IN,
      });
    }
    case "seating_wall": {
      const d = data as SeatingWallData;
      return clean({ linear_ft: activeRuns(d).reduce((s, r) => s + n(r.length_ft), 0), height_in: n(d.height_in) });
    }
    case "retaining_wall": {
      const d = data as RetainingWallData;
      if (d.method === "wall_sqft") return clean({ wall_sqft: n(d.wall_sqft) });
      const linear = activeRuns(d).reduce((s, r) => s + n(r.length_ft), 0);
      return clean({ linear_ft: linear, wall_sqft: linear * n(d.height_ft), height_in: n(d.height_ft) * 12 });
    }
    case "fire_pit": {
      const d = data as FirePitData;
      const height = has(d.height_in) ? n(d.height_in) : defaults.firePitHeightIn ?? DEFAULT_FIRE_PIT_HEIGHT_IN;
      if (d.shape === "round") {
        const dia = n(d.diameter_ft);
        return clean({ footprint_sqft: Math.PI * (dia / 2) ** 2, perimeter_ft: Math.PI * dia, height_in: height });
      }
      if (d.shape === "rect") {
        return clean({
          footprint_sqft: n(d.length_ft) * n(d.width_ft),
          perimeter_ft: has(d.length_ft) && has(d.width_ft) ? 2 * (n(d.length_ft) + n(d.width_ft)) : 0,
          height_in: height,
        });
      }
      return clean({ footprint_sqft: n(d.approx_sqft), height_in: height });
    }
    case "lighting":
      return clean({ fixture_count: (data as LightingData).fixtures.reduce((s, f) => s + n(f.qty), 0) });
    case "steps": {
      const d = data as StepsData;
      return clean({
        step_count: d.sections.reduce((s, x) => s + n(x.step_count), 0),
        tread_lf: d.sections.reduce((s, x) => s + n(x.step_count) * n(x.width_ft), 0),
      });
    }
  }
}

/** Σ over instances. Heights are length-weighted where there's a length,
 * else the max; perimeter only sums when every instance has one. */
export function sumTotals(list: FeatureTotals[]): FeatureTotals {
  if (list.length === 0) return {};
  if (list.length === 1) return list[0];
  const out: FeatureTotals = {};
  const additive: (keyof FeatureTotals)[] = [
    "area_sqft",
    "linear_ft",
    "wall_sqft",
    "footprint_sqft",
    "fixture_count",
    "step_count",
    "tread_lf",
  ];
  for (const k of additive) {
    const s = list.reduce((acc, t) => acc + (t[k] ?? 0), 0);
    if (s > 0) out[k] = round2(s);
  }
  if (list.every((t) => t.perimeter_ft)) out.perimeter_ft = round2(list.reduce((s, t) => s + t.perimeter_ft!, 0));
  const withLen = list.filter((t) => t.height_in && t.linear_ft);
  if (withLen.length > 0) {
    const len = withLen.reduce((s, t) => s + t.linear_ft!, 0);
    out.height_in = round2(withLen.reduce((s, t) => s + t.height_in! * t.linear_ft!, 0) / len);
  } else {
    const hs = list.map((t) => t.height_in ?? 0).filter((h) => h > 0);
    if (hs.length) out.height_in = Math.max(...hs);
  }
  return out;
}

/** 240 → "240", 12.25 → "12.3", 1500 → "1,500". */
export const fmt = (v: number | null | undefined) => (v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** The headline number(s) for a feature card / instance: "620 sq ft",
 * "13 LF", "160 wall sq ft", "12 fixtures". */
export function totalsHeadline(kind: FeatureKind, t: FeatureTotals): string | null {
  const parts: string[] = [];
  switch (kind) {
    case "patio":
    case "flatwork":
      if (t.area_sqft) parts.push(`${fmt(t.area_sqft)} sq ft`);
      break;
    case "kitchen":
    case "seating_wall":
      if (t.linear_ft) parts.push(`${fmt(t.linear_ft)} LF${t.height_in ? ` · ${fmt(t.height_in)} in high` : ""}`);
      break;
    case "retaining_wall":
      if (t.linear_ft) parts.push(`${fmt(t.linear_ft)} LF`);
      if (t.wall_sqft) parts.push(`${fmt(t.wall_sqft)} wall sq ft`);
      break;
    case "fire_pit":
      if (t.footprint_sqft) parts.push(`${fmt(t.footprint_sqft)} sq ft footprint`);
      break;
    case "lighting":
      if (t.fixture_count) parts.push(`${fmt(t.fixture_count)} ${t.fixture_count === 1 ? "fixture" : "fixtures"}`);
      break;
    case "steps":
      if (t.step_count) parts.push(`${fmt(t.step_count)} ${t.step_count === 1 ? "step" : "steps"}`);
      break;
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Whether an instance holds anything worth saving (or confirming before
 * removal). Choice fields alone (method, shape…) don't count. */
export function instanceHasData(kind: FeatureKind, data: FeatureData, label?: string | null): boolean {
  if (label?.trim()) return true;
  // Any typed number or text anywhere in the data — a lone dimension that
  // doesn't make a total yet (just a length) still counts.
  const anyValue = (v: unknown, key = ""): boolean => {
    if (typeof v === "number") return v > 0;
    // Skip enum-ish strings (method, shape, type…) and ids.
    if (typeof v === "string") return (key === "description" || key === "label" || key === "name") && !!v.trim();
    if (Array.isArray(v)) return v.some((x) => anyValue(x));
    if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => anyValue(x, k));
    return false;
  };
  return anyValue(data);
}

// ---------------------------------------------------------------------------
// Stored rows
// ---------------------------------------------------------------------------

/** One feature instance (project_feature_measurements, 0098). */
export interface FeatureInstance {
  id: string;
  project_id: string;
  build_type: string;
  /** The project feature this instance measures (0105). */
  feature_id?: string | null;
  label: string | null;
  data: FeatureData;
  totals: FeatureTotals;
  sort_order: number;
}

/** A custom measurement (project_measurements, 0091): label + quantity +
 * unit. Exactly one of build_type / category_id is set, or neither for the
 * General group. Informational only. */
export interface MeasurementRow {
  id: string;
  project_id: string;
  build_type: string | null;
  category_id: string | null;
  field_key: string;
  label: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  sort_order: number;
}

export type MeasurementUnit = "sq_ft" | "linear_ft" | "ft" | "in" | "count" | "cu_yd";

export const MEASUREMENT_UNITS: { id: MeasurementUnit; suffix: string }[] = [
  { id: "sq_ft", suffix: "sq ft" },
  { id: "linear_ft", suffix: "linear ft" },
  { id: "ft", suffix: "ft" },
  { id: "in", suffix: "in" },
  { id: "count", suffix: "count" },
  { id: "cu_yd", suffix: "cu yd" },
];

export const CUSTOM_UNITS: MeasurementUnit[] = MEASUREMENT_UNITS.map((u) => u.id);

export const unitSuffix = (unit: string | null): string =>
  unit ? (MEASUREMENT_UNITS.find((u) => u.id === unit)?.suffix ?? unit) : "";

export const newCustomFieldKey = () => `custom_${newId().replace(/-/g, "")}`;

// ---------------------------------------------------------------------------
// Groups (one feature card per selected Project type)
// ---------------------------------------------------------------------------

export interface MeasurementGroup {
  key: string;
  title: string;
  build_type: string | null;
  category_id: string | null;
  /** null → custom measurements only. */
  kind: FeatureKind | null;
}

export const GENERAL_GROUP_KEY = "general";

export const groupKeyOf = (r: { build_type: string | null; category_id?: string | null }): string =>
  r.build_type ? `bt:${r.build_type}` : r.category_id ? `cat:${r.category_id}` : GENERAL_GROUP_KEY;

/**
 * One group per selected Project type, in the order selected. Categories
 * that resolve to the same build type share one group (headed by the build
 * type's label); unmapped categories each get their own custom-only group
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
      ? { key: `bt:${bt.id}`, title: bt.label, build_type: bt.id, category_id: null, kind: featureKindOf(bt.id) }
      : { key: `cat:${cat.id}`, title: cat.name, build_type: null, category_id: cat.id, kind: null };
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
  kind: null,
};

/** Whether a group holds any saved data — used to confirm before a Project
 * type (and so its card) is removed. */
export function groupHasData(group: Pick<MeasurementGroup, "key" | "kind">, instances: FeatureInstance[], customRows: MeasurementRow[]): boolean {
  const kind = group.kind;
  if (kind && instances.some((i) => groupKeyOf(i) === group.key && instanceHasData(kind, i.data, i.label))) return true;
  return customRows.some((r) => groupKeyOf(r) === group.key && (r.value != null || !!r.label?.trim()));
}

/**
 * projects.size_sqft — the Labor page's productivity metrics (hours/100sf,
 * cost/sf) read this one number. It's the paved surface across visible
 * groups: Paver Patio + Walkway + Driveway area. Wall faces, fire pit
 * footprints and custom measurements don't count (custom rows are
 * informational only).
 */
export function totalSurfaceSqft(instances: FeatureInstance[], visibleGroupKeys: Set<string>): number | null {
  const total = instances
    .filter((i) => visibleGroupKeys.has(groupKeyOf(i)) && (featureKindOf(i.build_type) === "patio" || featureKindOf(i.build_type) === "flatwork"))
    .reduce((s, i) => s + (i.totals.area_sqft ?? 0), 0);
  return total > 0 ? round2(total) : null;
}

// ---------------------------------------------------------------------------
// Prefill for Smart Section calculator + Quick Quote
// ---------------------------------------------------------------------------

/** One choice in the "From site measurements" picker: a single instance, or
 * the sum of all of them. */
export interface PrefillSource {
  id: string;
  label: string;
  totals: FeatureTotals;
}

/** The picker's options for a build type — the sum first when there's more
 * than one instance with data. Instances with nothing useful are skipped. */
export function prefillSources(instances: FeatureInstance[], buildType: string): PrefillSource[] {
  const kind = featureKindOf(buildType);
  if (!kind) return [];
  const noun = INSTANCE_NOUN[buildType] ?? "item";
  const withData = instances
    .filter((i) => i.build_type === buildType)
    // A "use default" height resolves to what the contractor's default was
    // when the row was saved (stored in totals) — callers here don't load
    // Smart Section settings.
    .map((i, idx) => ({
      i,
      idx,
      totals: computeTotals(kind, normalizeData(kind, i.data), {
        firePitHeightIn: i.totals?.height_in,
        kitchenHeightIn: i.totals?.height_in,
      }),
    }))
    .filter(({ totals }) => totalsHeadline(kind, totals));
  const singles = withData.map(({ i, idx, totals }) => ({
    id: i.id,
    label: `${i.label?.trim() || `${capitalize(noun)} ${idx + 1}`} — ${totalsHeadline(kind, totals)}`,
    totals,
  }));
  if (singles.length <= 1) return singles;
  const sum = sumTotals(singles.map((s) => s.totals));
  return [{ id: "sum", label: `All ${singles.length} combined — ${totalsHeadline(kind, sum)}`, totals: sum }, ...singles];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Height ÷ the template's course height, rounded to the nearest whole
 * course (min 1). ASSUMPTION: the measured height is the finished wall /
 * counter height; the contractor can still adjust courses in the calculator. */
const coursesFor = (heightIn: number | undefined, courseHeightIn: number | undefined): Record<string, number> =>
  heightIn && courseHeightIn && courseHeightIn > 0 ? { courses: Math.max(1, Math.round(heightIn / courseHeightIn)) } : {};

/**
 * Smart Section calculator answers a measurement fills in, keyed by the
 * template's question keys (src/lib/smartSections/*). Only size questions
 * (plus courses, derived from a measured height) — product picks and
 * depths stay the contractor's. `area` is the patio's area_or_dimensions
 * answer: { areaSqft, perimeterFt } with perimeterFt null when unknown
 * (the calculator then estimates it). `courseHeightIn` is the template's
 * resolved course_height_in tunable.
 */
export function smartSectionPrefill(
  buildType: string,
  t: FeatureTotals,
  opts: { courseHeightIn?: number } = {},
): Record<string, unknown> {
  switch (buildType) {
    case "paver_patio":
      return t.area_sqft ? { area: { areaSqft: t.area_sqft, perimeterFt: t.perimeter_ft ?? null } } : {};
    case "outdoor_kitchen":
      return t.linear_ft ? { run_ft: t.linear_ft, ...coursesFor(t.height_in, opts.courseHeightIn) } : {};
    case "seating_wall":
      return t.linear_ft ? { length_ft: t.linear_ft, ...coursesFor(t.height_in, opts.courseHeightIn) } : {};
    case "fire_pit":
      return {
        ...(t.perimeter_ft ? { wall_length_ft: t.perimeter_ft } : {}),
        ...(t.footprint_sqft ? { footprint_sqft: t.footprint_sqft } : {}),
      };
    case "outdoor_lighting":
      return t.fixture_count ? { fixture_count: t.fixture_count } : {};
    case "water_feature":
    case "sod":
    case "irrigation":
      return t.area_sqft ? { area: { areaSqft: t.area_sqft, perimeterFt: t.perimeter_ft ?? null } } : {};
    default:
      return {};
  }
}

/** Quick Quote answers a measurement fills in (src/lib/quickQuote/*). */
export function quickQuotePrefill(buildType: string, t: FeatureTotals): Record<string, unknown> {
  switch (buildType) {
    case "paver_patio":
      return t.area_sqft ? { area_sqft: t.area_sqft } : {};
    case "outdoor_kitchen":
      return t.linear_ft ? { run_ft: t.linear_ft } : {};
    case "seating_wall":
      return t.linear_ft ? { length_ft: t.linear_ft } : {};
    case "fire_pit":
      return t.perimeter_ft ? { wall_length_ft: t.perimeter_ft } : {};
    case "outdoor_lighting":
      return t.fixture_count ? { fixture_count: t.fixture_count } : {};
    case "pergola":
    case "water_feature":
    case "sod":
    case "irrigation":
      return t.area_sqft ? { area_sqft: t.area_sqft } : {};
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Collapsed-card summaries
// ---------------------------------------------------------------------------

/** "patio" → "patios", "seating wall" → "seating walls", "set of steps"
 * → "sets of steps". */
const pluralNoun = (noun: string) => (noun.includes(" of ") ? noun.replace(/^(\S+)/, "$1s") : `${noun}s`);

const layoutLabel = (layout: RunLayout) =>
  RUN_LAYOUTS.seating_wall.find((l) => l.value === layout)?.label ?? layout;

/** The one-line summary for one instance, e.g. "L-shape · 420 sq ft",
 * "40 LF × 3 ft = 120 wall sq ft", "Round · 5 ft across · 15.7 LF around".
 * null when there's no total to show yet. */
function instanceSummary(kind: FeatureKind, buildType: string | null, data: FeatureData, t: FeatureTotals): string | null {
  const headline = totalsHeadline(kind, t);
  if (!headline) return null;
  switch (kind) {
    case "patio":
    case "flatwork": {
      const d = data as PatioData;
      if (d.method === "total") return headline;
      const shape = areaShapesFor(kind, buildType).find((s) => s.value === d.shape)?.label;
      return shape ? `${shape} · ${headline}` : headline;
    }
    case "kitchen":
    case "seating_wall":
      return `${layoutLabel((data as KitchenData | SeatingWallData).layout)} · ${headline}`;
    case "retaining_wall": {
      const d = data as RetainingWallData;
      if (d.method === "lf_height" && t.linear_ft && t.wall_sqft && d.height_ft)
        return `${fmt(t.linear_ft)} LF × ${fmt(d.height_ft)} ft = ${fmt(t.wall_sqft)} wall sq ft`;
      return headline;
    }
    case "fire_pit": {
      const d = data as FirePitData;
      if (d.shape === "round" && t.perimeter_ft) return `Round · ${fmt(d.diameter_ft)} ft across · ${fmt(t.perimeter_ft)} LF around`;
      if (d.shape === "rect" && t.perimeter_ft) return `${fmt(d.length_ft)} × ${fmt(d.width_ft)} ft · ${fmt(t.perimeter_ft)} LF around`;
      return `Custom · ≈ ${fmt(t.footprint_sqft)} sq ft`;
    }
    case "steps": {
      const sections = (data as StepsData).sections.filter((x) => (x.step_count ?? 0) > 0).length;
      return sections > 1 ? `${sections} sections · ${headline}` : headline;
    }
    default:
      return headline;
  }
}

/**
 * What a collapsed feature card says after its title. One instance → its
 * own summary; several with data → "2 patios · 680 sq ft" (combined);
 * custom measurements add "· 2 custom". Custom-only groups: "2
 * measurements". Something typed but no total yet → "Partly measured".
 * null → nothing entered ("Not measured yet").
 */
export function featureSummary(
  group: Pick<MeasurementGroup, "kind" | "build_type">,
  instances: Pick<FeatureInstance, "data" | "label">[],
  customRows: Pick<MeasurementRow, "label" | "value">[],
  defaults: MeasurementDefaults = {},
): string | null {
  const customCount = customRows.filter((r) => r.value != null || !!r.label?.trim()).length;
  const kind = group.kind;
  if (!kind) return customCount ? `${customCount} ${customCount === 1 ? "measurement" : "measurements"}` : null;

  const withData = instances.filter((i) => instanceHasData(kind, i.data, i.label));
  const parts: string[] = [];
  if (withData.length === 1) {
    const only = withData[0];
    parts.push(instanceSummary(kind, group.build_type, only.data, computeTotals(kind, only.data, defaults)) ?? "Partly measured");
  } else if (withData.length > 1) {
    const noun = INSTANCE_NOUN[group.build_type ?? ""] ?? "item";
    const sum = totalsHeadline(kind, sumTotals(withData.map((i) => computeTotals(kind, i.data, defaults))));
    parts.push(`${withData.length} ${pluralNoun(noun)}${sum ? ` · ${sum}` : ""}`);
  }
  if (customCount) parts.push(`${customCount} custom`);
  return parts.length ? parts.join(" · ") : null;
}
