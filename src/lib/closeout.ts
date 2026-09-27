import type { MaterialsItem, MaterialsUsageLog, ProductCatalogItem } from "./api";
import { buildTypeForCategoryName, type FeatureInstance, type FeatureTotals } from "./measurements";
import { countsTowardTotals } from "./features";
import { deliveredQuantity, effectiveEstimate, usedQuantity, type DeliveryLineWithOrderStatus } from "./materialTracking";
import type { JobContext } from "./jobContext";
import type { PlannedActualReport } from "./plannedActual";
import type { CostBucket } from "./costPlanMath";

/**
 * Closeout (0114) — the frozen planned-vs-actual result of a completed job,
 * plus per-feature "comparable units": what similar-job matching and the
 * estimating recommendations read. Built once, when the job is closed out;
 * later edits to the project never change it.
 */

export type SizeUnit = "sq ft" | "face sq ft" | "LF" | "tread LF" | "fixtures" | "units";

export interface CloseoutFeature {
  feature_id: string | null;
  name: string;
  build_type: string | null;
  size: number | null;
  size_unit: SizeUnit | null;
  /** From the calculator inputs saved on the section (0114), else null. */
  base_depth_in: number | null;
  excavation_depth_in: number | null;
  /** "Techo-Bloc Blu 60" — the main Catalog product. */
  material_system: string | null;
  /** "Techo-Bloc" — what matching compares. */
  material_family: string | null;
  price: number;
  planned: Record<CostBucket | "total", number>;
  actual: Record<CostBucket | "total", number>;
  labor: { planned_hours: number; actual_hours: number | null; estimated_split: boolean };
  base: { planned_tons: number; actual_tons: number } | null;
  units: {
    base_tons_per_sqft?: number;
    planned_base_tons_per_sqft?: number;
    labor_hours_per_unit?: number;
    planned_labor_hours_per_unit?: number;
    /** actual ÷ planned man-hours (only when labor was logged per feature). */
    labor_ratio?: number;
    cost_per_unit?: number;
    price_per_unit?: number;
    material_cost_per_unit?: number;
  };
}

export interface CloseoutSnapshot {
  version: 1;
  report: PlannedActualReport;
  materials_reconciled: boolean;
  unreconciled_lines: number;
  /** Duration at closeout (0120). Weather delay days are tagged separately
   * so estimates aren't judged on rain; absent on older closeouts. */
  schedule?: {
    estimated_days: number | null;
    actual_working_days: number | null;
    weather_delay_days: number;
    other_delay_days: number;
  };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** The size a feature is compared by, from its measurements. */
export function featureSize(buildType: string | null, t: FeatureTotals | null | undefined): { size: number | null; unit: SizeUnit | null } {
  if (!t) return { size: null, unit: null };
  switch (buildType) {
    case "paver_patio":
    case "walkway":
    case "driveway":
      return { size: t.area_sqft || null, unit: "sq ft" };
    case "retaining_wall":
      return t.wall_sqft ? { size: t.wall_sqft, unit: "face sq ft" } : { size: t.linear_ft || null, unit: "LF" };
    case "seating_wall":
      return t.linear_ft && t.height_in ? { size: r2((t.linear_ft * t.height_in) / 12), unit: "face sq ft" } : { size: t.linear_ft || null, unit: "LF" };
    case "outdoor_kitchen":
      return { size: t.linear_ft || null, unit: "LF" };
    case "steps":
      return { size: t.tread_lf || null, unit: "tread LF" };
    case "outdoor_lighting":
      return { size: t.fixture_count || null, unit: "fixtures" };
    case "fire_pit":
      return { size: 1, unit: "units" };
    default:
      return { size: t.area_sqft || t.linear_ft || null, unit: t.area_sqft ? "sq ft" : t.linear_ft ? "LF" : null };
  }
}

const isBaseLine = (l: Pick<MaterialsItem, "name" | "unit">) =>
  /\bbase\b|gravel|crusher|aggregate|\bgab\b|road ?base|\bdga\b/i.test(l.name) && !/bedding|sand|polymeric/i.test(l.name);

const tonsOf = (qty: number, unit: string | null) => (/ton/i.test(unit ?? "") ? qty : /yd|yard/i.test(unit ?? "") ? qty * 1.4 : null);

export function closeoutFeatures(input: {
  report: PlannedActualReport;
  categories: { id: string; name: string }[];
  sections: { id?: string; feature_id?: string | null; feature?: { status: string } | null; smart_inputs?: Record<string, unknown> | null; materials_items?: MaterialsItem[] }[];
  measurements: FeatureInstance[];
  deliveries: DeliveryLineWithOrderStatus[];
  usageLogs: MaterialsUsageLog[];
  catalog: Pick<ProductCatalogItem, "id" | "manufacturer" | "name">[];
}): CloseoutFeature[] {
  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  return input.report.features.map((f) => {
    const categoryName = input.categories.find((c) => c.id === f.categoryId)?.name ?? null;
    const buildType = categoryName ? (buildTypeForCategoryName(categoryName)?.id ?? null) : null;
    const instances = input.measurements.filter((m) => (m.feature_id ?? null) === f.featureId);
    const totals = instances.length
      ? instances.reduce<FeatureTotals>((acc, m) => {
          for (const [k, v] of Object.entries(m.totals ?? {})) (acc as Record<string, number>)[k] = ((acc as Record<string, number>)[k] ?? 0) + (Number(v) || 0);
          return acc;
        }, {})
      : null;
    const { size, unit } = featureSize(buildType, totals);

    const secs = input.sections.filter(countsTowardTotals as (s: unknown) => boolean).filter((s) => (s.feature_id ?? null) === f.featureId);
    const inputs = secs.map((s) => s.smart_inputs).find((x) => x && typeof x === "object") as Record<string, unknown> | undefined;
    const baseDepth = inputs && Number(inputs.base_depth_in) > 0 ? Number(inputs.base_depth_in) : null;
    const excavation = inputs && Number(inputs.excavation_depth_in) > 0 ? Number(inputs.excavation_depth_in) : null;

    const lines = secs.flatMap((s) => s.materials_items ?? []).filter((l) => (l.cost_type ?? "material") === "material");
    const productId =
      (inputs && typeof inputs.paver === "string" ? (inputs.paver as string) : null) ??
      [...lines].filter((l) => l.catalog_product_id).sort((a, b) => Number(b.quantity) * Number(b.unit_cost) - Number(a.quantity) * Number(a.unit_cost))[0]?.catalog_product_id ??
      null;
    const product = productId ? catalogById.get(productId) : undefined;

    let base: CloseoutFeature["base"] = null;
    for (const l of lines.filter(isBaseLine)) {
      const est = effectiveEstimate(l);
      const used = usedQuantity(l, input.usageLogs);
      const act = used > 0 ? used : deliveredQuantity(l, input.deliveries);
      const p = tonsOf(est.quantity, est.unit ?? l.unit);
      const a = tonsOf(act, est.unit ?? l.unit);
      if (p == null || a == null) continue;
      base = { planned_tons: r2((base?.planned_tons ?? 0) + p), actual_tons: r2((base?.actual_tons ?? 0) + a) };
    }

    const planned = Object.fromEntries([...f.buckets.map((b) => [b.bucket, b.planned]), ["total", f.total.planned]]) as CloseoutFeature["planned"];
    const actual = Object.fromEntries([...f.buckets.map((b) => [b.bucket, b.actual]), ["total", f.total.actual]]) as CloseoutFeature["actual"];
    for (const k of ["material", "labor", "subcontractor", "equipment", "other"] as const) {
      planned[k] ??= 0;
      actual[k] ??= 0;
    }

    const units: CloseoutFeature["units"] = {};
    const sq = size && size > 0 ? size : null;
    if (sq && base && base.actual_tons > 0 && unit === "sq ft") {
      units.base_tons_per_sqft = r3(base.actual_tons / sq);
      units.planned_base_tons_per_sqft = r3(base.planned_tons / sq);
    }
    const actualHours = f.labor.estimatedSplit ? null : f.labor.actualHours;
    if (sq && actualHours && actualHours > 0) units.labor_hours_per_unit = r3(actualHours / sq);
    if (sq && f.labor.plannedHours > 0) units.planned_labor_hours_per_unit = r3(f.labor.plannedHours / sq);
    if (actualHours && actualHours > 0 && f.labor.plannedHours > 0) units.labor_ratio = r3(actualHours / f.labor.plannedHours);
    if (sq && f.total.actual > 0) units.cost_per_unit = r2(f.total.actual / sq);
    if (sq && f.price > 0) units.price_per_unit = r2(f.price / sq);
    if (sq && actual.material > 0) units.material_cost_per_unit = r2(actual.material / sq);

    return {
      feature_id: f.featureId,
      name: f.name,
      build_type: buildType,
      size: size ?? null,
      size_unit: size ? unit : null,
      base_depth_in: baseDepth,
      excavation_depth_in: excavation,
      material_system: product ? `${product.manufacturer} ${product.name}` : null,
      material_family: product?.manufacturer ?? null,
      price: f.price,
      planned,
      actual,
      labor: { planned_hours: f.labor.plannedHours, actual_hours: actualHours, estimated_split: f.labor.estimatedSplit },
      base,
      units,
    };
  });
}

/** The per-unit actuals worth showing for a feature, as readable lines. */
export function unitHighlights(f: CloseoutFeature): string[] {
  const out: string[] = [];
  const u = f.units;
  const per = f.size_unit ?? "unit";
  if (u.base_tons_per_sqft != null)
    out.push(`Base: ${u.base_tons_per_sqft} tons/sq ft actual${u.planned_base_tons_per_sqft != null ? ` (planned ${u.planned_base_tons_per_sqft})` : ""}`);
  if (u.labor_hours_per_unit != null)
    out.push(`Labor: ${u.labor_hours_per_unit} man-hours/${per} actual${u.planned_labor_hours_per_unit != null ? ` (planned ${u.planned_labor_hours_per_unit})` : ""}`);
  if (u.labor_ratio != null) out.push(`Labor took ${u.labor_ratio}× the planned hours`);
  if (u.cost_per_unit != null) out.push(`Cost: $${u.cost_per_unit}/${per}${u.price_per_unit != null ? ` · price $${u.price_per_unit}/${per}` : ""}`);
  return out;
}

export interface Closeout {
  id: string;
  project_id: string;
  snapshot: CloseoutSnapshot;
  context: JobContext;
  features: CloseoutFeature[];
  what_happened: string | null;
  excluded: boolean;
  superseded_at: string | null;
  completed_on: string;
  created_at: string;
  project?: { name: string } | null;
}
