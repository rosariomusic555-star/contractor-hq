import { lineCostWithTax, taxableByDefault, sectionLaborCost, laborFormula, type CostLine, type LaborBlock, type LineCostType, type LaborMode } from "./costPlanMath";

/**
 * A change order's planned-cost side (0107): each change is an add / edit /
 * remove of one Cost plan line on the feature's section, or a change to the
 * section's labor. Nothing is applied until the change order is approved
 * (apply_change_order_to_features, in SQL); until then these deltas drive the
 * builder's totals, the Project impact panel and the Cost plan's "Pending
 * CO" overlay. Pure — same line math as costPlanMath.
 */

export type CostChangeKind = "add" | "edit" | "remove" | "labor";

/** A line's values as a change stores them. */
export interface CostChangeLine {
  name?: string;
  quantity?: number;
  unit?: string | null;
  unit_cost?: number;
  waste_percent?: number;
  cost_type?: LineCostType;
  vendor?: string | null;
  /** 0163 — the line's sales tax, so the delta is after tax like the plan. */
  taxable?: boolean;
  tax_rate?: number;
}

/** Labor fields as a change stores them. */
export interface CostChangeLabor {
  labor_mode: LaborMode | null;
  labor_crew_size: number | null;
  labor_days: number | null;
  labor_hours_per_day: number | null;
  labor_rate: number | null;
  labor_lump_sum: number | null;
  labor_man_hours?: number | null;
}

export interface CostChangeLike {
  kind: CostChangeKind;
  /** add / edit: the new values; labor: the new labor fields. */
  line: CostChangeLine | CostChangeLabor | Record<string, unknown>;
  /** edit / remove: the line as it was; labor: the labor as it was. */
  before?: CostChangeLine | CostChangeLabor | Record<string, unknown> | null;
}

const asLine = (v: unknown): CostLine => {
  const l = (v ?? {}) as CostChangeLine;
  return {
    quantity: Number(l.quantity ?? 0),
    unit_cost: Number(l.unit_cost ?? 0),
    waste_percent: Number(l.waste_percent ?? 0),
    cost_type: l.cost_type ?? "material",
    // An added line with no say yet follows its type's default, like the
    // DB does when the change is applied.
    taxable: l.taxable ?? taxableByDefault(l.cost_type ?? "material"),
    tax_rate: Number(l.tax_rate ?? 0),
  };
};

/** The planned-cost change one change makes (+ adds cost, − saves it). */
export function costChangeDelta(c: CostChangeLike): number {
  switch (c.kind) {
    case "add":
      return lineCostWithTax(asLine(c.line));
    case "remove":
      return -lineCostWithTax(asLine(c.before));
    case "edit": {
      const before = asLine(c.before);
      const after = asLine({ ...(c.before ?? {}), ...(c.line ?? {}) });
      return lineCostWithTax(after) - lineCostWithTax(before);
    }
    case "labor":
      return sectionLaborCost((c.line ?? {}) as LaborBlock) - sectionLaborCost((c.before ?? {}) as LaborBlock);
  }
}

export const costChangesDelta = (changes: CostChangeLike[]) => changes.reduce((s, c) => s + costChangeDelta(c), 0);

const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 === 0 ? 0 : 2 });
const signed = (v: number) => `${v < 0 ? "−" : "+"}${money(Math.abs(v))}`;

/** One-line description for the Cost plan overlay and history. */
export function describeCostChange(c: CostChangeLike): string {
  const line = (c.line ?? {}) as CostChangeLine;
  const before = (c.before ?? {}) as CostChangeLine;
  const delta = signed(costChangeDelta(c));
  switch (c.kind) {
    case "add":
      return `Add ${line.name || "line"} · ${Number(line.quantity ?? 0)}${line.unit ? ` ${line.unit}` : ""} · ${delta}`;
    case "remove":
      return `Remove ${before.name || "line"} · ${delta}`;
    case "edit": {
      const parts: string[] = [];
      if (line.quantity != null && Number(line.quantity) !== Number(before.quantity))
        parts.push(`qty ${Number(before.quantity ?? 0)} → ${Number(line.quantity)}`);
      if (line.unit_cost != null && Number(line.unit_cost) !== Number(before.unit_cost))
        parts.push(`${money(Number(before.unit_cost ?? 0))} → ${money(Number(line.unit_cost))}`);
      if (line.name && line.name !== before.name) parts.push(`→ ${line.name}`);
      return `Change ${before.name || "line"}${parts.length ? ` (${parts.join(", ")})` : ""} · ${delta}`;
    }
    case "labor": {
      const f = laborFormula((c.line ?? {}) as LaborBlock);
      return `Labor → ${f ?? "none"} · ${delta}`;
    }
  }
}

/** What a change order charges the client: Σ its lines' quantity × price —
 * the builder's total AND the saved `amount` (what the contract, the
 * client's page and invoices use). No sales tax: nothing charges one, same
 * as quotes. Rounded to the cent so float noise never reaches the amount. */
export function changeOrderDraftTotal(sections: { items: { price: number; quantity: number }[] }[]): number {
  const t = sections.reduce((sum, s) => sum + s.items.reduce((x, i) => x + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0), 0);
  return Math.round(t * 100) / 100;
}
