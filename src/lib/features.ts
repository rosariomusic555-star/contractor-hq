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
}

export const typeNameOf = (f: Pick<ProjectFeature, "category_id">, categories: Pick<Category, "id" | "name">[]) =>
  categories.find((c) => c.id === f.category_id)?.name ?? "Feature";

/** "Paver Patio", or "Paver Patio · Back patio" when it has its own label. */
export function featureName(f: Pick<ProjectFeature, "category_id" | "label">, categories: Pick<Category, "id" | "name">[]): string {
  const type = typeNameOf(f, categories);
  const label = f.label?.trim();
  return label && label.toLowerCase() !== type.toLowerCase() ? `${type} · ${label}` : type;
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
