import type { Closeout, CloseoutFeature } from "./closeout";
import { contextPhrase, SLOPE_ORDER, type JobContext } from "./jobContext";

/**
 * Similar jobs (Feature 5) — simple, explainable matching over closeouts.
 * No prediction: a match is a completed, non-excluded job with the same
 * feature type whose context passes the current rule set. Rules start
 * strict and widen one step at a time, and every widening is said out loud.
 *
 *   step 0  size ±30%, same slope, same access, same soil,
 *           base depth ±1" (when both known), same material family (when both known)
 *   step 1  …any soil
 *   step 2  …any access
 *   step 3  …slope within one step
 *   step 4  …any base depth / material
 *   step 5  …size ±50%
 *   step 6  every past job of this type — labeled "no context match"
 *
 * An average needs MIN_SAMPLE jobs; with fewer it's "Based on N similar
 * job(s)" — a reference, never an average.
 */

export const MIN_SAMPLE = 3;

export interface SimilarTarget {
  build_type: string;
  size: number | null;
  /** "sq ft" — for the description only. */
  size_unit?: string | null;
  context: JobContext;
  base_depth_in?: number | null;
  material_family?: string | null;
  /** Leave the job being estimated out. */
  excludeProjectId?: string | null;
}

export interface SimilarMatch {
  closeout: Closeout;
  feature: CloseoutFeature;
}

export interface SimilarResult {
  matches: SimilarMatch[];
  /** What was relaxed to get here, in plain words ([] = strict match). */
  widened: string[];
  /** Human description of the matched group. */
  description: string;
  allOfType: boolean;
}

interface Rule {
  sizeTol: number;
  soil: boolean;
  access: boolean;
  slope: "same" | "near";
  depthAndMaterial: boolean;
  label?: string;
}

const RULES: Rule[] = [
  { sizeTol: 0.3, soil: true, access: true, slope: "same", depthAndMaterial: true },
  { sizeTol: 0.3, soil: false, access: true, slope: "same", depthAndMaterial: true, label: "any soil" },
  { sizeTol: 0.3, soil: false, access: false, slope: "same", depthAndMaterial: true, label: "any access" },
  { sizeTol: 0.3, soil: false, access: false, slope: "near", depthAndMaterial: true, label: "slope within one step" },
  { sizeTol: 0.3, soil: false, access: false, slope: "near", depthAndMaterial: false, label: "any base depth / material" },
  { sizeTol: 0.5, soil: false, access: false, slope: "near", depthAndMaterial: false, label: "size ±50%" },
];

const sameOrUnknown = <T,>(a: T | null | undefined, b: T | null | undefined) => a == null || b == null || a === b;

function passes(rule: Rule, t: SimilarTarget, c: Closeout, f: CloseoutFeature): boolean {
  // Sizes in different units (LF vs face sq ft) never compare.
  if (t.size_unit && f.size_unit && t.size_unit !== f.size_unit) return false;
  // Size is compared when the job being estimated has one (a past job with
  // no size can't be shown to be similar); with no size yet, any size.
  if (t.size) {
    if (!f.size || Math.abs(f.size - t.size) / t.size > rule.sizeTol) return false;
  }
  if (rule.slope === "same" ? !sameOrUnknown(t.context.slope, c.context.slope) : !slopeNear(t.context.slope, c.context.slope)) return false;
  if (rule.access && !sameOrUnknown(t.context.access, c.context.access)) return false;
  if (rule.soil && !sameOrUnknown(t.context.soil, c.context.soil)) return false;
  if (rule.depthAndMaterial) {
    if (t.base_depth_in && f.base_depth_in && Math.abs(t.base_depth_in - f.base_depth_in) > 1) return false;
    if (!sameOrUnknown(t.material_family, f.material_family)) return false;
  }
  return true;
}

function slopeNear(a: string | null | undefined, b: string | null | undefined) {
  if (a == null || b == null) return true;
  return Math.abs(SLOPE_ORDER.indexOf(a as never) - SLOPE_ORDER.indexOf(b as never)) <= 1;
}

/** Usable closeouts: current (not superseded), not excluded. */
export const usableCloseouts = (closeouts: Closeout[]) => closeouts.filter((c) => !c.superseded_at && !c.excluded);

export function findSimilarJobs(closeouts: Closeout[], target: SimilarTarget, need = MIN_SAMPLE): SimilarResult {
  const pool: SimilarMatch[] = usableCloseouts(closeouts)
    .filter((c) => c.project_id !== target.excludeProjectId)
    .flatMap((c) => c.features.filter((f) => f.build_type === target.build_type).map((f) => ({ closeout: c, feature: f })));
  const widened: string[] = [];
  let best: SimilarMatch[] = [];
  for (const rule of RULES) {
    if (rule.label) widened.push(rule.label);
    const m = pool.filter(({ closeout, feature }) => passes(rule, target, closeout, feature));
    if (m.length > best.length) best = m;
    if (m.length >= need) return { matches: m, widened: [...widened], description: describe(target, rule), allOfType: false };
  }
  if (best.length > 0) {
    // Fewer than `need` even widened — report the strictest set that found
    // anything, as a reference only.
    const first = RULES.findIndex((r) => pool.some(({ closeout, feature }) => passes(r, target, closeout, feature)));
    const rule = RULES[first];
    return { matches: pool.filter(({ closeout, feature }) => passes(rule, target, closeout, feature)), widened: RULES.slice(1, first + 1).map((r) => r.label!), description: describe(target, rule), allOfType: false };
  }
  return { matches: pool, widened: ["no context match — every past job of this type"], description: "all past jobs of this type", allOfType: true };
}

function describe(t: SimilarTarget, rule: Rule): string {
  const parts: string[] = [];
  if (t.size) {
    const lo = Math.round(t.size * (1 - rule.sizeTol));
    const hi = Math.round(t.size * (1 + rule.sizeTol));
    parts.push(`${lo.toLocaleString()}–${hi.toLocaleString()}${t.size_unit ? ` ${t.size_unit}` : ""}`);
  }
  const ctx = contextPhrase(
    { slope: rule.slope === "same" ? t.context.slope : null, access: rule.access ? t.context.access : null, soil: rule.soil ? t.context.soil : null },
    ["slope", "access", "soil"],
  );
  return [parts.join(""), ctx].filter(Boolean).join(", ");
}

/** Average of a unit metric over the matches that have it. */
export function averageMetric(matches: SimilarMatch[], pick: (f: CloseoutFeature) => number | null | undefined) {
  const values = matches.map((m) => pick(m.feature)).filter((v): v is number => typeof v === "number" && isFinite(v));
  const n = values.length;
  return { n, avg: n ? values.reduce((s, v) => s + v, 0) / n : null, values, isAverage: n >= MIN_SAMPLE };
}

export const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** "3 similar patios (500–700 sq ft, moderate slope)" / "Based on 1 similar patio". */
export function sampleLabel(n: number, noun: string, description: string): string {
  const d = description ? ` (${description})` : "";
  if (n >= MIN_SAMPLE) return `${n} similar ${noun}s${d}`;
  return `Based on ${n} similar ${noun}${n === 1 ? "" : "s"}${d}`;
}

/** "3 similar paver patios (500–700 sq ft, moderate slope)" / "Based on 1
 * similar paver patio (…)" / "Based on all 2 past paver patios (no context
 * match)". `label` is the build type's label ("Paver Patio"). */
export function similarSampleText(res: SimilarResult, n: number, label: string): string {
  const noun = label.toLowerCase();
  if (res.allOfType) {
    const what = `all ${n} past ${noun}${n === 1 ? "" : "s"} (no context match)`;
    return n >= MIN_SAMPLE ? `${what[0].toUpperCase()}${what.slice(1)}` : `Based on ${what}`;
  }
  const d = res.description ? ` (${res.description})` : "";
  return n >= MIN_SAMPLE ? `${n} similar ${noun}s${d}` : `Based on ${n} similar ${noun}${n === 1 ? "" : "s"}${d}`;
}
