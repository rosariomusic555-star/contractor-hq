import type { Category } from "./api";
import { buildTypeForCategoryName } from "./measurements";

/**
 * Project features (0105) — one record per thing being built on a job
 * ("Paver Patio · Back patio", a second patio, the fire pit). Its type is a
 * Job Category; measurements, Cost plan sections and quote sections point at
 * it by feature_id. Pure helpers only — storage is in api.ts.
 *
 *   active   — part of the job's scope (original, or an approved add-on)
 *   proposed — on an add-on quote that isn't approved yet: shown, but never
 *              counted in project totals, tracking or profit
 *   removed  — deselected / declined: hidden, kept for history
 */

export type FeatureStatus = "proposed" | "active" | "removed";

export interface ProjectFeature {
  id: string;
  project_id: string;
  category_id: string | null;
  label: string | null;
  status: FeatureStatus;
  /** Null = original scope; the add-on quote that proposed it otherwise. */
  source_quote_id: string | null;
  sort_order: number;
  created_at: string;
  /** This job's own progress milestones (0138); null/undefined = the presets. */
  milestones?: string[] | null;
}

export const typeNameOf = (f: Pick<ProjectFeature, "category_id">, categories: Pick<Category, "id" | "name">[]) =>
  categories.find((c) => c.id === f.category_id)?.name ?? "Feature";

/** "Paver Patio", or "Paver Patio · Back patio" when it has its own label. */
export function featureName(f: Pick<ProjectFeature, "category_id" | "label">, categories: Pick<Category, "id" | "name">[]): string {
  const type = typeNameOf(f, categories);
  const label = f.label?.trim();
  return label && label.toLowerCase() !== type.toLowerCase() ? `${type} · ${label}` : type;
}

/** featureName for a list, numbering features whose names would repeat
 * ("Fire Pit 1", "Fire Pit 2" for two unlabeled fire pits), in list order. */
export function distinctFeatureNames(
  features: Pick<ProjectFeature, "id" | "category_id" | "label">[],
  categories: Pick<Category, "id" | "name">[],
): Map<string, string> {
  const base = features.map((f) => [f.id, featureName(f, categories)] as const);
  const totals = new Map<string, number>();
  for (const [, n] of base) totals.set(n, (totals.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(
    base.map(([id, n]) => {
      if ((totals.get(n) ?? 0) < 2) return [id, n];
      const k = (seen.get(n) ?? 0) + 1;
      seen.set(n, k);
      return [id, `${n} ${k}`];
    }),
  );
}

/** The Smart Section / measurement build type behind a feature's type. */
export const featureBuildType = (f: Pick<ProjectFeature, "category_id">, categories: Pick<Category, "id" | "name">[]) =>
  buildTypeForCategoryName(typeNameOf(f, categories))?.id ?? null;

/** Features in scope (active + proposed), in display order. */
export const liveFeatures = (features: ProjectFeature[]) =>
  features
    .filter((f) => f.status !== "removed")
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

export const activeFeatures = (features: ProjectFeature[]) => liveFeatures(features).filter((f) => f.status === "active");

/** A section / line counts toward project totals, tracking and profit only
 * when it belongs to no feature (General) or to an active one. */
export const countsTowardTotals = (s: { feature?: { status: FeatureStatus } | null }) =>
  !s.feature || s.feature.status === "active";

/** A catch-all Job Category ("Other / Uncategorized", "General", "Misc") —
 * not a customer-facing feature; project-wide costs live in the Cost plan's
 * General section. Hidden from the feature pickers. */
export function isCatchAllCategoryName(name: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return /^(other|uncategori[sz]ed|general|misc|miscellaneous)( |$)/.test(n) || n === "other uncategorized";
}

/**
 * Project types in the job's feature order (project_features.sort_order) —
 * the order of the Measurements cards on the opportunity and project pages.
 * A type with no live feature yet keeps its place in `categoryIds` (the
 * order it was added), after the ordered ones.
 */
export function orderCategoryIdsByFeatures(categoryIds: string[], features: ProjectFeature[]): string[] {
  const rank = new Map<string, number>();
  for (const [i, f] of liveFeatures(features).entries()) {
    if (f.category_id && !rank.has(f.category_id)) rank.set(f.category_id, i);
  }
  const ranked = categoryIds.filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  return [...ranked, ...categoryIds.filter((id) => !rank.has(id))];
}

/**
 * The sort_order writes that put a job's features in `orderedCategoryIds`
 * order (all of a type's features move together, keeping their own order).
 * Live features not in the list follow, then removed ones — so a type that's
 * unchecked and checked again comes back at the end. Only changed rows.
 */
export function featureSortUpdates(
  features: ProjectFeature[],
  orderedCategoryIds: string[],
): { id: string; sort_order: number }[] {
  const live = liveFeatures(features);
  const pos = new Map(orderedCategoryIds.map((id, i) => [id, i]));
  const inList = live
    .filter((f) => f.category_id != null && pos.has(f.category_id))
    .sort((a, b) => pos.get(a.category_id!)! - pos.get(b.category_id!)!);
  const rest = live.filter((f) => !inList.includes(f));
  const removed = features
    .filter((f) => f.status === "removed")
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  return [...inList, ...rest, ...removed]
    .map((f, i) => ({ id: f.id, sort_order: i, before: f.sort_order }))
    .filter((u) => u.sort_order !== u.before)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

/** `ids` with the item at `from` moved to `to`. */
export function moveId(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
