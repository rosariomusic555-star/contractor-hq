import type { Closeout, CloseoutFeature } from "./closeout";
import type { RecommendationState } from "./api";
import { contextValueLabel, type ContextKey, type JobContext } from "./jobContext";
import { median, usableCloseouts } from "./similarJobs";
import { BUILD_TYPES } from "./buildTypes";

/**
 * Estimating recommendations (Feature 5) — patterns across completed jobs,
 * turned into SUGGESTED changes. Rules, not predictions:
 *
 *   base usage (patios)   actual ÷ planned base tons per job
 *   labor                 actual ÷ planned man-hours per feature
 *                         (only where labor was logged per feature — an
 *                         estimated split never feeds a recommendation)
 *
 * For every build type, and for every single context condition (slope =
 * steep, soil = clay, …) within it, a recommendation appears when:
 *   - at least MIN_JOBS non-excluded jobs have the measurement,
 *   - at least MIN_SAME_DIRECTION of them were off in the same direction
 *     by more than TRIGGER (10%), and
 *   - the median ratio is off by at least TRIGGER.
 * A condition-level one is only raised when it differs from its build
 * type's overall median by at least TRIGGER (otherwise it's the same story).
 *
 * Nothing here writes anything. Applying is always an explicit tap (see
 * applyRecommendation in api.ts), recorded with before/after for undo.
 */

export const MIN_JOBS = 4;
export const MIN_SAME_DIRECTION = 3;
export const TRIGGER = 0.1;

export type RecommendationKind = "base" | "labor";

export interface RecommendationEvidence {
  project_id: string;
  project_name: string;
  feature: string;
  planned: number;
  actual: number;
  ratio: number;
  completed_on: string;
}

export interface Recommendation {
  key: string;
  kind: RecommendationKind;
  build_type: string;
  buildTypeLabel: string;
  /** null = every job of this type. */
  condition: Partial<Pick<JobContext, "slope" | "access" | "soil" | "demo">> | null;
  conditionLabel: string | null;
  median: number;
  overCount: number;
  underCount: number;
  evidence: RecommendationEvidence[];
  /** "On sloped patios you've used 20% more base than planned across 4 jobs." */
  headline: string;
}

const noun = (buildType: string) => (BUILD_TYPES.find((b) => b.id === buildType)?.label ?? buildType).toLowerCase();

const conditionKeys: ContextKey[] = ["slope", "access", "soil", "demo"];

function ratiosFor(kind: RecommendationKind, f: CloseoutFeature): { planned: number; actual: number } | null {
  if (kind === "base") return f.base && f.base.planned_tons > 0 && f.base.actual_tons > 0 ? { planned: f.base.planned_tons, actual: f.base.actual_tons } : null;
  if (f.labor.estimated_split || !f.labor.actual_hours || !(f.labor.planned_hours > 0)) return null;
  return { planned: f.labor.planned_hours, actual: f.labor.actual_hours };
}

function build(
  kind: RecommendationKind,
  buildType: string,
  condition: Recommendation["condition"],
  rows: { c: Closeout; f: CloseoutFeature }[],
): Recommendation | null {
  const evidence: RecommendationEvidence[] = [];
  for (const { c, f } of rows) {
    const r = ratiosFor(kind, f);
    if (!r) continue;
    evidence.push({
      project_id: c.project_id,
      project_name: c.project?.name ?? "Project",
      feature: f.name,
      planned: r.planned,
      actual: r.actual,
      ratio: Math.round((r.actual / r.planned) * 1000) / 1000,
      completed_on: c.completed_on,
    });
  }
  if (evidence.length < MIN_JOBS) return null;
  const m = median(evidence.map((e) => e.ratio))!;
  const over = evidence.filter((e) => e.ratio > 1 + TRIGGER).length;
  const under = evidence.filter((e) => e.ratio < 1 - TRIGGER).length;
  if (Math.abs(m - 1) < TRIGGER) return null;
  if ((m > 1 ? over : under) < MIN_SAME_DIRECTION) return null;

  const condKey = condition ? Object.entries(condition).map(([k, v]) => `${k}=${v}`).join("&") : "all";
  const condLabel = condition
    ? Object.entries(condition)
        .map(([k, v]) => `${contextValueLabel(k as ContextKey, v as string)?.toLowerCase()} ${k === "demo" ? "demo" : k}`)
        .join(", ")
    : null;
  const pct = Math.round(Math.abs(m - 1) * 100);
  const dir = m > 1 ? "more" : "less";
  const scope = condLabel ? `On ${noun(buildType)}s with ${condLabel}` : `On your ${noun(buildType)}s`;
  const headline =
    kind === "base"
      ? `${scope} you've used ${pct}% ${dir} base than planned across ${evidence.length} jobs.`
      : `${scope} labor ran ${pct}% ${m > 1 ? "over" : "under"} plan across ${evidence.length} jobs.`;
  return {
    key: `${kind}:${buildType}:${condKey}`,
    kind,
    build_type: buildType,
    buildTypeLabel: BUILD_TYPES.find((b) => b.id === buildType)?.label ?? buildType,
    condition,
    conditionLabel: condLabel,
    median: Math.round(m * 1000) / 1000,
    overCount: over,
    underCount: under,
    evidence: evidence.sort((a, b) => b.completed_on.localeCompare(a.completed_on)),
    headline,
  };
}

export function computeRecommendations(closeouts: Closeout[]): Recommendation[] {
  const rows = usableCloseouts(closeouts).flatMap((c) => c.features.filter((f) => f.build_type).map((f) => ({ c, f })));
  const out: Recommendation[] = [];
  const types = [...new Set(rows.map((r) => r.f.build_type!))];
  for (const kind of ["base", "labor"] as RecommendationKind[]) {
    for (const bt of types) {
      if (kind === "base" && bt !== "paver_patio" && bt !== "walkway" && bt !== "driveway") continue;
      const ofType = rows.filter((r) => r.f.build_type === bt);
      const overall = build(kind, bt, null, ofType);
      const overallMedian =
        overall?.median ??
        median(ofType.map((r) => ratiosFor(kind, r.f)).filter(Boolean).map((x) => x!.actual / x!.planned)) ??
        1;
      if (overall) out.push(overall);
      for (const key of conditionKeys) {
        const values = [...new Set(ofType.map((r) => r.c.context[key]).filter(Boolean))] as string[];
        for (const v of values) {
          const rec = build(kind, bt, { [key]: v }, ofType.filter((r) => r.c.context[key] === v));
          if (rec && Math.abs(rec.median - overallMedian) >= TRIGGER) out.push(rec);
        }
      }
    }
  }
  return out;
}

/** Does a job's context satisfy an adjustment's condition? ({} = always) */
export function conditionMatches(condition: Record<string, unknown> | null | undefined, ctx: JobContext): boolean {
  if (!condition) return true;
  return Object.entries(condition).every(([k, v]) => (ctx as Record<string, unknown>)[k] === v);
}

/** Round a labor-days default to the nearest half day. */
export const roundHalf = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);

/** Which recommendations to show: open, or snoozed past their date. */
export function openRecommendations(recs: Recommendation[], states: RecommendationState[], now = new Date()): Recommendation[] {
  const byKey = new Map(states.map((s) => [s.key, s]));
  return recs.filter((r) => {
    const s = byKey.get(r.key);
    if (!s || s.status === "open") return true;
    if (s.status === "snoozed") return !s.snooze_until || new Date(s.snooze_until) <= now;
    return false;
  });
}
