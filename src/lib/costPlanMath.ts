import { materialsLineTotal } from "./materialsMath";

/**
 * The Cost plan's money math — one module every screen reads, so the
 * builder, quote Est. cost, the quote section chip, Profit Summary, Revenue,
 * change orders and the AI assistant's copy (supabase/functions/
 * assistant-chat/format.ts) never disagree.
 *
 * A Cost plan (stored as a materials sheet) is sections; each section has
 * typed lines (material / subcontractor / equipment / other) plus an
 * optional labor block. One section per plan is "General" (project-wide).
 *
 * Material lines keep their waste % (quantity × (1 + waste) × unit cost);
 * every other line is plain quantity × rate — a lump sum is 1 × amount.
 */

export type LineCostType = "material" | "subcontractor" | "equipment" | "other";
/** Everything a cost can be — a line's type, or labor. Also the type an
 * expense category's actual spend is matched to. */
export type CostBucket = LineCostType | "labor";
export type LaborMode = "crew" | "lump_sum";

export const LINE_COST_TYPES: LineCostType[] = ["material", "subcontractor", "equipment", "other"];
export const COST_BUCKETS: CostBucket[] = ["material", "labor", "subcontractor", "equipment", "other"];

/** The small tag on a line / the Add menu. */
export const COST_TYPE_LABEL: Record<CostBucket, string> = {
  material: "Material",
  labor: "Labor",
  subcontractor: "Subcontractor",
  equipment: "Equipment",
  other: "Other",
};

/** Plural group headings. */
export const COST_TYPE_GROUP_LABEL: Record<CostBucket, string> = {
  material: "Materials",
  labor: "Labor",
  subcontractor: "Subcontractors",
  equipment: "Equipment",
  other: "Other",
};

/** Short names for one-line breakdowns ("Materials $4,200 · Labor $2,880 · Subs $1,500"). */
export const COST_TYPE_SHORT_LABEL: Record<CostBucket, string> = {
  material: "Materials",
  labor: "Labor",
  subcontractor: "Subs",
  equipment: "Equip",
  other: "Other",
};

const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

/** The unit label that marks a non-material line as a lump sum (1 × amount). */
export const LUMP_SUM_UNIT = "lump sum";

export const costTypeOf = (line: { cost_type?: LineCostType | null }): LineCostType => line.cost_type ?? "material";

export interface CostLine {
  quantity: number | string;
  unit_cost: number | string;
  waste_percent?: number | string | null;
  cost_type?: LineCostType | null;
}

/** One line's planned cost. */
export function lineCost(line: CostLine): number {
  return costTypeOf(line) === "material" ? materialsLineTotal(line) : num(line.quantity) * num(line.unit_cost);
}

export interface LaborBlock {
  labor_mode?: LaborMode | null;
  labor_crew_size?: number | string | null;
  labor_days?: number | string | null;
  labor_hours_per_day?: number | string | null;
  labor_rate?: number | string | null;
  labor_lump_sum?: number | string | null;
}

/** crew × days × hours/day × rate, or the lump sum. 0 when no labor. */
export function sectionLaborCost(s: LaborBlock): number {
  if (s.labor_mode === "lump_sum") return num(s.labor_lump_sum);
  if (s.labor_mode === "crew") return num(s.labor_crew_size) * num(s.labor_days) * num(s.labor_hours_per_day) * num(s.labor_rate);
  return 0;
}

/** Planned labor hours (crew mode, or a lump sum that kept its hours). */
export function sectionLaborHours(s: LaborBlock): number {
  if (!s.labor_mode) return 0;
  return num(s.labor_crew_size) * num(s.labor_days) * num(s.labor_hours_per_day);
}

export function hasLabor(s: LaborBlock): boolean {
  return !!s.labor_mode && (sectionLaborCost(s) > 0 || sectionLaborHours(s) > 0);
}

const fmtMoney = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 === 0 ? 0 : 2 });
const fmtNum = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "3 guys × 4 days × 8 hrs × $30 = $2,880" (or "Lump sum $2,500"). */
export function laborFormula(s: LaborBlock): string | null {
  if (s.labor_mode === "lump_sum") return s.labor_lump_sum ? `Lump sum ${fmtMoney(num(s.labor_lump_sum))}` : null;
  if (s.labor_mode !== "crew") return null;
  const crew = num(s.labor_crew_size);
  const days = num(s.labor_days);
  const hrs = num(s.labor_hours_per_day);
  const rate = num(s.labor_rate);
  if (!crew && !days) return null;
  return `${fmtNum(crew)} ${crew === 1 ? "person" : "guys"} × ${fmtNum(days)} ${days === 1 ? "day" : "days"} × ${fmtNum(hrs)} hrs × ${fmtMoney(rate)} = ${fmtMoney(sectionLaborCost(s))}`;
}

export type CostTotals = Record<CostBucket, number> & { total: number };

const emptyTotals = (): CostTotals => ({ material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0, total: 0 });

export interface CostSection extends LaborBlock {
  /** DB rows call it materials_items; the builder draft calls it items. */
  materials_items?: CostLine[];
  items?: CostLine[];
}

/** One section's planned cost, by type. */
export function sectionTotals(section: CostSection): CostTotals {
  const t = emptyTotals();
  for (const line of section.materials_items ?? section.items ?? []) t[costTypeOf(line)] += lineCost(line);
  t.labor += sectionLaborCost(section);
  t.total = t.material + t.labor + t.subcontractor + t.equipment + t.other;
  return t;
}

/** Several sections (a whole cost plan, or a quote section's linked
 * sections), by type. */
export function sumSectionTotals(sections: CostSection[]): CostTotals {
  const t = emptyTotals();
  for (const s of sections) {
    const st = sectionTotals(s);
    for (const k of COST_BUCKETS) t[k] += st[k];
  }
  t.total = t.material + t.labor + t.subcontractor + t.equipment + t.other;
  return t;
}

/** The cost plan total — every type, labor included. What quote Est.
 * cost, Profit Summary, Revenue and change orders all mean by "cost". */
export function costPlanTotal(sections: CostSection[] = []): number {
  return sumSectionTotals(sections).total;
}

/** Whether a cost plan has anything planned in it at all. */
export function costPlanHasEntries(sections: CostSection[] = []): boolean {
  return sections.some((s) => (s.materials_items ?? s.items ?? []).length > 0 || hasLabor(s));
}

/** "Materials $4,200 · Labor $2,880 · Subs $1,500 · Equip $900" — only the
 * non-zero types, in the fixed order. */
export function costBreakdownLabel(t: CostTotals, format: (v: number) => string = fmtMoney): string {
  return COST_BUCKETS.filter((k) => t[k] > 0)
    .map((k) => `${COST_TYPE_SHORT_LABEL[k]} ${format(t[k])}`)
    .join(" · ");
}

/** The fixed order line groups appear in within a section. */
export function groupLinesByType<L extends { cost_type?: LineCostType | null }>(lines: L[]): { type: LineCostType; lines: L[] }[] {
  return LINE_COST_TYPES.map((type) => ({ type, lines: lines.filter((l) => costTypeOf(l) === type) })).filter((g) => g.lines.length > 0);
}
