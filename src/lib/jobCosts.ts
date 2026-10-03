/**
 * Job costs (project Expenses view) — the one place that turns a project's
 * actual-cost sources into the view's numbers. Pure, over already-fetched
 * rows, and built on the same helpers every other money screen uses, so
 * nothing here can disagree with them:
 *
 *   planned            costPlanSummary (Cost plan incl. approved change
 *                      orders / add-ons, + a not-yet-approved quote's picks)
 *   actual to date     expenses (split lines per line) + labor (approved AND
 *                      pending timesheets, like the project's Profit summary)
 *                      + delivered material cost once the job is Complete
 *                      and reconciled (the app's rule — until then
 *                      deliveries are tracked, not totalled, so a supplier
 *                      bill logged as an expense isn't counted twice)
 *   variance / profit  plannedActualReport (open-job rule: spend below plan
 *                      is carried at plan, overruns show at once; fully
 *                      loaded via the job's overhead rate)
 *
 * Internal only — never serialized for a client or crew.
 */
import type {
  ChangeOrder,
  Category,
  Expense,
  ExpenseCategory,
  LaborEntry,
  MaterialOrder,
  MaterialsItem,
  MaterialsSection,
  MaterialsUsageLog,
  Project,
  Quote,
} from "./api";
import { COST_BUCKETS, COST_TYPE_LABEL, costTypeOf, lineCostWithTax, sectionLaborCost, sectionLaborHours, type CostBucket } from "./costPlanMath";
import { costPlanSummary, expenseBucket } from "./costPlan";
import { activeFeatures, countsTowardTotals, featureName, type ProjectFeature } from "./features";
import {
  deliveredQuantity,
  effectiveDeliveryStatus,
  effectiveEstimate,
  lineActualCost,
  lineTaxFactor,
  usedQuantity,
  type DeliveryLineWithOrderStatus,
} from "./materialTracking";
import { DEFAULT_VARIANCE_THRESHOLDS, plannedActualReport, varianceTone, type VarianceThresholds, type VarianceTone } from "./plannedActual";
import { countWorkingDays } from "./projectDuration";

const r2 = (v: number) => Math.round(v * 100) / 100;
const GENERAL = "general";

export type CostSource = "expense" | "delivery" | "labor" | "credit";
export const COST_SOURCE_LABEL: Record<CostSource, string> = { expense: "Expense", delivery: "Delivery", labor: "Labor", credit: "Credit" };

/** One row of the "All costs" list. A split expense is one row whose
 * `lines` are its split lines. */
export interface CostRow {
  key: string;
  source: CostSource;
  date: string;
  description: string;
  vendor: string | null;
  /** null = General (or several, for a split parent). */
  featureId: string | null;
  costType: CostBucket | null;
  categoryId: string | null;
  amount: number;
  receiptPath: string | null;
  /** Counted in "actual to date" (deliveries only once reconciled + Complete). */
  inTotals: boolean;
  /** Short note shown under the row (e.g. "pending approval"). */
  note: string | null;
  expenseId?: string;
  orderId?: string;
  lines?: CostRow[];
  /** A manual expense / split line with no feature on a job that has features. */
  unassigned: boolean;
}

export interface MatrixCell {
  planned: number;
  actual: number;
  tone: VarianceTone;
}
export interface MatrixRow {
  key: string;
  /** Feature id, null for General, "labor" for the whole-job labor row, or a cost type (by-type view). */
  featureId: string | null;
  name: string;
  cells: Record<CostBucket, MatrixCell>;
  total: MatrixCell;
}

export interface LaborPerson {
  name: string;
  approvedHours: number;
  regHours: number;
  otHours: number;
  approvedCost: number;
  pendingHours: number;
  pendingCost: number;
}

export interface MaterialLineRow {
  id: string;
  name: string;
  featureId: string | null;
  sectionId: string;
  unit: string | null;
  plannedQty: number;
  plannedCost: number;
  deliveredQty: number;
  usedQty: number;
  deliveredCost: number;
  /** delivered cost − planned cost, once the line is fully delivered (a
   * partial delivery would read as a saving). */
  variance: number | null;
  /** Some, not all, delivered. */
  partial: boolean;
}

export interface DeliveryRow {
  orderId: string;
  supplier: string | null;
  date: string | null;
  status: string;
  deliveredAmount: number;
  lineCount: number;
  unplannedLines: number;
}

export type JobCostStatus = "on_track" | "over" | "under" | "ahead";

export interface JobCostReport {
  actual: number;
  planned: number;
  remaining: number;
  spentPct: number | null;
  /** Overruns so far (open job) / final variance (complete): projected − planned. */
  variance: number;
  variancePct: number | null;
  status: JobCostStatus;
  profit: { expected: number; projected: number; expectedFullyLoaded: number | null; projectedFullyLoaded: number | null; overheadRate: number | null };
  progress: { estimateDays: number | null; elapsedDays: number | null; weatherDays: number; pct: number | null; started: boolean; spendAhead: boolean };
  laborTracking: "per_feature" | "project" | "none";
  matrix: MatrixRow[];
  byType: MatrixRow[];
  labor: {
    approvedHours: number;
    regHours: number;
    otHours: number;
    approvedCost: number;
    pendingHours: number;
    pendingCost: number;
    plannedHours: number;
    plannedCost: number;
    variance: number;
    people: LaborPerson[];
    /** Manual expenses typed as Labor while timesheet labor exists — likely counted twice. */
    manualLaborExpenses: number;
    manualLaborCount: number;
  };
  materials: {
    lines: MaterialLineRow[];
    deliveries: DeliveryRow[];
    deliveredTotal: number;
    unplannedDeliveredCost: number;
    /** Return credits + pallet deposits back (0152). */
    supplierCredits: number;
    /** Manual expenses typed Material — bought outside a tracked delivery. */
    materialExpenses: number;
    materialExpenseCount: number;
    counted: boolean;
  };
  rows: CostRow[];
  vendors: { name: string; total: number; count: number }[];
  /** Cumulative actual (in-totals rows) by date. */
  series: { date: string; actual: number }[];
  unassignedCount: number;
  topTypes: { type: CostBucket; amount: number }[];
  /** Budget left per feature key (id or "general") × cost type — for the add-expense pickers. */
  remainingBudget: (featureId: string | null, type: CostBucket) => { planned: number; actual: number; remaining: number };
}

const emptyCells = (): Record<CostBucket, MatrixCell> =>
  Object.fromEntries(COST_BUCKETS.map((b) => [b, { planned: 0, actual: 0, tone: "none" as VarianceTone }])) as Record<CostBucket, MatrixCell>;

const APPROVED: string[] = ["approved"];
/** A labor entry is pending while its timesheet isn't approved (entries with no timesheet — owner-logged — count as approved). */
export const laborIsPending = (l: Pick<LaborEntry, "timesheet_id" | "timesheet">) =>
  !!l.timesheet_id && !APPROVED.includes(l.timesheet?.status ?? "");

const mondayOf = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function jobCostReport(input: {
  project: Pick<Project, "id" | "status" | "estimated_duration_days" | "actual_start_date" | "actual_end_date" | "scheduled_start_date">;
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  expenseCategories: Pick<ExpenseCategory, "id" | "cost_type" | "name">[];
  sections: MaterialsSection[];
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  expenses: Expense[];
  laborEntries: LaborEntry[];
  materialOrders: MaterialOrder[];
  usageLogs: MaterialsUsageLog[];
  /** Delivered material cost counts in the totals (Complete + reconciled). */
  materialsCounted: boolean;
  overheadRate: number | null;
  weatherDays: number;
  thresholds?: VarianceThresholds;
  today: string;
}): JobCostReport {
  const t = input.thresholds ?? DEFAULT_VARIANCE_THRESHOLDS;
  const live = activeFeatures(input.features);
  const liveIds = new Set(live.map((f) => f.id));
  const keyOf = (fid: string | null | undefined) => (fid && liveIds.has(fid) ? fid : GENERAL);
  const counted = input.sections.filter(countsTowardTotals);
  const hasFeatures = live.length > 0;
  const bucketOf = (e: { cost_type?: CostBucket | null; expense_category_id: string | null }) =>
    e.cost_type ?? expenseBucket(e.expense_category_id, input.expenseCategories);

  // --- Planned: the Cost plan, per feature × type --------------------------
  const summary = costPlanSummary(input.quotes, input.changeOrders, input.sections);
  const plannedBy = new Map<string, Record<CostBucket, number>>();
  const plannedRow = (k: string) => {
    let r = plannedBy.get(k);
    if (!r) plannedBy.set(k, (r = { material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 }));
    return r;
  };
  for (const s of counted) {
    const row = plannedRow(keyOf(s.feature_id));
    for (const l of s.materials_items ?? []) row[costTypeOf(l)] += lineCostWithTax(l);
    row.labor += sectionLaborCost(s);
  }
  if (summary.pendingSelections) plannedRow(GENERAL).other += summary.pendingSelections;

  // --- Actual: expenses per feature × type ---------------------------------
  const actualBy = new Map<string, Record<CostBucket, number>>();
  const actualRow = (k: string) => {
    let r = actualBy.get(k);
    if (!r) actualBy.set(k, (r = { material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 }));
    return r;
  };
  const rows: CostRow[] = [];
  let unassignedCount = 0;
  let manualLaborExpenses = 0;
  let manualLaborCount = 0;
  let materialExpenses = 0;
  let materialExpenseCount = 0;
  for (const e of input.expenses) {
    const lines = e.expense_lines ?? [];
    const date = (e.date ?? e.created_at).slice(0, 10);
    const base = { source: "expense" as const, date, vendor: e.vendor ?? null, receiptPath: e.receipt_path ?? null, inTotals: true, note: e.notes ?? null, expenseId: e.id };
    if (lines.length > 1) {
      const children: CostRow[] = lines.map((l) => {
        const type = bucketOf(l);
        actualRow(keyOf(l.feature_id))[type] += Number(l.amount) || 0;
        const unassigned = hasFeatures && !(l.feature_id && liveIds.has(l.feature_id));
        if (unassigned) unassignedCount++;
        if (type === "labor") { manualLaborExpenses += Number(l.amount) || 0; manualLaborCount++; }
        if (type === "material") { materialExpenses += Number(l.amount) || 0; materialExpenseCount++; }
        return {
          ...base,
          key: `line-${l.id}`,
          description: l.description || e.name,
          featureId: l.feature_id && liveIds.has(l.feature_id) ? l.feature_id : null,
          costType: type,
          categoryId: l.expense_category_id,
          amount: Number(l.amount) || 0,
          unassigned,
          note: null,
        };
      });
      rows.push({
        ...base,
        key: `exp-${e.id}`,
        description: e.name,
        featureId: null,
        costType: null,
        categoryId: null,
        amount: Number(e.amount) || 0,
        lines: children,
        unassigned: children.some((c) => c.unassigned),
      });
    } else {
      const type = bucketOf(e);
      actualRow(keyOf(e.feature_id))[type] += Number(e.amount) || 0;
      const unassigned = hasFeatures && !(e.feature_id && liveIds.has(e.feature_id));
      if (unassigned) unassignedCount++;
      if (type === "labor") { manualLaborExpenses += Number(e.amount) || 0; manualLaborCount++; }
      if (type === "material") { materialExpenses += Number(e.amount) || 0; materialExpenseCount++; }
      rows.push({
        ...base,
        key: `exp-${e.id}`,
        description: e.name,
        featureId: e.feature_id && liveIds.has(e.feature_id) ? e.feature_id : null,
        costType: type,
        categoryId: e.expense_category_id,
        amount: Number(e.amount) || 0,
        unassigned,
      });
    }
  }

  // --- Labor: timesheets / labor log ---------------------------------------
  const totalHours = input.laborEntries.reduce((s, l) => s + (Number(l.hours) || 0), 0);
  const taggedHours = input.laborEntries.filter((l) => l.feature_id && liveIds.has(l.feature_id)).reduce((s, l) => s + (Number(l.hours) || 0), 0);
  const laborTracking: JobCostReport["laborTracking"] =
    input.laborEntries.length === 0 ? "none" : hasFeatures && taggedHours >= totalHours * 0.8 ? "per_feature" : "project";
  const people = new Map<string, LaborPerson>();
  let approvedHours = 0, regHours = 0, otHours = 0, approvedCost = 0, pendingHours = 0, pendingCost = 0;
  const laborWeeks = new Map<string, { hours: number; cost: number; pendingCost: number; people: Set<string> }>();
  for (const l of input.laborEntries) {
    const hours = Number(l.hours) || 0;
    const cost = Number(l.cost) || 0;
    const pending = laborIsPending(l);
    const name = l.worker_name?.trim() || "Crew";
    const p = people.get(name) ?? { name, approvedHours: 0, regHours: 0, otHours: 0, approvedCost: 0, pendingHours: 0, pendingCost: 0 };
    if (pending) {
      p.pendingHours += hours; p.pendingCost += cost; pendingHours += hours; pendingCost += cost;
    } else {
      const reg = l.reg_hours != null ? Number(l.reg_hours) : hours;
      const ot = l.ot_hours != null ? Number(l.ot_hours) : 0;
      p.approvedHours += hours; p.regHours += reg; p.otHours += ot; p.approvedCost += cost;
      approvedHours += hours; regHours += reg; otHours += ot; approvedCost += cost;
    }
    people.set(name, p);
    if (laborTracking === "per_feature") actualRow(keyOf(l.feature_id)).labor += cost;
    const wk = mondayOf(l.entry_date);
    const w = laborWeeks.get(wk) ?? { hours: 0, cost: 0, pendingCost: 0, people: new Set<string>() };
    w.hours += hours; w.cost += cost; if (pending) w.pendingCost += cost; w.people.add(name);
    laborWeeks.set(wk, w);
  }
  const laborActual = approvedCost + pendingCost;
  for (const [wk, w] of laborWeeks) {
    rows.push({
      key: `labor-${wk}`,
      source: "labor",
      date: wk,
      description: `Labor · week of ${new Date(`${wk}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${r2(w.hours)} h`,
      vendor: null,
      featureId: null,
      costType: "labor",
      categoryId: null,
      amount: r2(w.cost),
      receiptPath: null,
      inTotals: true,
      note: `${[...w.people].join(", ")}${w.pendingCost > 0 ? ` · $${r2(w.pendingCost).toLocaleString("en-US")} pending approval` : ""}`,
      unassigned: false,
    });
  }
  const plannedLaborHours = counted.reduce((s, sec) => s + sectionLaborHours(sec), 0);
  const plannedLaborCost = counted.reduce((s, sec) => s + sectionLaborCost(sec), 0);

  // --- Materials: Cost plan lines vs deliveries / usage -------------------
  const deliveries: DeliveryLineWithOrderStatus[] = input.materialOrders.flatMap((o) =>
    o.material_order_items.map((item) => ({ item, orderStatus: o.status })),
  );
  const allLines: (MaterialsItem & { __section: MaterialsSection })[] = counted.flatMap((s) =>
    (s.materials_items ?? []).filter((l) => costTypeOf(l) === "material").map((l) => ({ ...l, __section: s })),
  );
  const lineById = new Map(allLines.map((l) => [l.id, l]));
  const materialLines: MaterialLineRow[] = allLines.map((l) => {
    const est = effectiveEstimate(l);
    const deliveredQty = deliveredQuantity(l, deliveries);
    // After tax, like the plan's totals (0163).
    const taxFactor = lineTaxFactor(l);
    const deliveredCost = lineActualCost(l, deliveries) * taxFactor;
    const plannedCost = est.quantity * est.unit_cost * taxFactor;
    return {
      id: l.id,
      name: l.name,
      featureId: l.__section.feature_id && liveIds.has(l.__section.feature_id) ? l.__section.feature_id : null,
      sectionId: l.__section.id,
      unit: est.unit ?? l.unit ?? null,
      plannedQty: r2(est.quantity),
      plannedCost: r2(plannedCost),
      deliveredQty: r2(deliveredQty),
      usedQty: r2(usedQuantity(l, input.usageLogs)),
      deliveredCost: r2(deliveredCost),
      variance: deliveredQty > 0 && deliveredQty >= est.quantity - 1e-9 ? r2(deliveredCost - plannedCost) : null,
      partial: deliveredQty > 0 && deliveredQty < est.quantity - 1e-9,
    };
  });
  let unplannedDeliveredCost = 0;
  const deliveryRows: DeliveryRow[] = input.materialOrders.map((o) => {
    let amount = 0;
    let unplanned = 0;
    for (const item of o.material_order_items) {
      if (effectiveDeliveryStatus(item, o.status) !== "delivered") continue;
      const line = item.materials_item_id ? lineById.get(item.materials_item_id) : undefined;
      if (line) {
        const c = lineActualCost(line, [{ item, orderStatus: o.status }]) * lineTaxFactor(line);
        amount += c;
        if (input.materialsCounted) actualRow(keyOf(line.__section.feature_id)).material += c;
      } else {
        const c = Number(item.quantity) * (item.unit_price != null ? Number(item.unit_price) : 0);
        amount += c;
        unplanned++;
        unplannedDeliveredCost += c;
        if (input.materialsCounted) actualRow(GENERAL).material += c;
      }
    }
    return {
      orderId: o.id,
      supplier: o.supplier,
      date: o.expected_delivery_date,
      status: o.status,
      deliveredAmount: r2(amount),
      lineCount: o.material_order_items.length,
      unplannedLines: o.material_order_items.filter((i) => !i.materials_item_id).length,
    };
  });
  for (const d of deliveryRows) {
    if (d.deliveredAmount <= 0) continue;
    rows.push({
      key: `delivery-${d.orderId}`,
      source: "delivery",
      date: (d.date ?? input.today).slice(0, 10),
      description: `Delivery${d.supplier ? ` · ${d.supplier}` : ""} · ${d.lineCount} line${d.lineCount === 1 ? "" : "s"}`,
      vendor: d.supplier,
      featureId: null,
      costType: "material",
      categoryId: null,
      amount: d.deliveredAmount,
      receiptPath: null,
      inTotals: input.materialsCounted,
      note: input.materialsCounted ? null : "Tracked — counts in the totals once the job is Complete and reconciled",
      orderId: d.orderId,
      unassigned: false,
    });
  }
  const deliveredTotal = r2(deliveryRows.reduce((s, d) => s + d.deliveredAmount, 0));

  // Supplier credits (0152) — returned leftovers (reconciled line credit) and
  // pallet deposits back; a pallet deposit charged is a cost. Same rule as
  // deliveries: in the totals once the job is Complete and reconciled.
  const creditNote = input.materialsCounted ? null : "Tracked — counts in the totals once the job is Complete and reconciled";
  let supplierCredits = 0;
  for (const l of allLines) {
    const credit = l.disposition === "returned" ? Number(l.return_credit ?? 0) : 0;
    if (credit <= 0) continue;
    supplierCredits += credit;
    if (input.materialsCounted) actualRow(keyOf(l.__section.feature_id)).material -= credit;
    rows.push({
      key: `credit-return-${l.id}`,
      source: "credit",
      date: (l.reconciled_at ?? input.today).slice(0, 10),
      description: `Return credit · ${l.name}`,
      vendor: null,
      featureId: l.__section.feature_id && liveIds.has(l.__section.feature_id) ? l.__section.feature_id : null,
      costType: "material",
      categoryId: null,
      amount: -r2(credit),
      receiptPath: null,
      inTotals: input.materialsCounted,
      note: creditNote,
      unassigned: false,
    });
  }
  for (const o of input.materialOrders) {
    const each = Number(o.pallet_deposit_each ?? 0);
    if (!each) continue;
    const charged = (o.pallets_delivered ?? 0) * each;
    const back = (o.pallets_returned ?? 0) * each;
    for (const [kind, amt] of [["charge", charged], ["back", -back]] as const) {
      if (!amt) continue;
      if (kind === "back") supplierCredits += back;
      if (input.materialsCounted) actualRow(GENERAL).material += amt;
      rows.push({
        key: `pallet-${kind}-${o.id}`,
        source: kind === "back" ? "credit" : "delivery",
        date: ((kind === "back" ? o.updated_at : o.delivered_on ?? o.expected_delivery_date) ?? input.today).slice(0, 10),
        description: kind === "back" ? `Pallet deposit back · ${o.pallets_returned} pallet${o.pallets_returned === 1 ? "" : "s"}` : `Pallet deposit · ${o.pallets_delivered} pallet${o.pallets_delivered === 1 ? "" : "s"}`,
        vendor: o.supplier,
        featureId: null,
        costType: "material",
        categoryId: null,
        amount: r2(amt),
        receiptPath: null,
        inTotals: input.materialsCounted,
        note: creditNote,
        orderId: o.id,
        unassigned: false,
      });
    }
  }

  // --- Matrix (feature × type) --------------------------------------------
  const cellOf = (planned: number, actual: number): MatrixCell => ({ planned: r2(planned), actual: r2(actual), tone: varianceTone(planned, actual, t) });
  const buildRow = (key: string, featureId: string | null, name: string, planned: Record<CostBucket, number>, actual: Record<CostBucket, number>): MatrixRow => {
    const cells = emptyCells();
    for (const b of COST_BUCKETS) cells[b] = cellOf(planned[b], actual[b]);
    const pT = COST_BUCKETS.reduce((s, b) => s + planned[b], 0);
    const aT = COST_BUCKETS.reduce((s, b) => s + actual[b], 0);
    return { key, featureId, name, cells, total: cellOf(pT, aT) };
  };
  const zero = (): Record<CostBucket, number> => ({ material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 });
  const matrix: MatrixRow[] = [
    ...live.map((f) => buildRow(f.id, f.id, featureName(f, input.categories), plannedBy.get(f.id) ?? zero(), actualBy.get(f.id) ?? zero())),
    buildRow(GENERAL, null, hasFeatures ? "General" : "Whole job", plannedBy.get(GENERAL) ?? zero(), actualBy.get(GENERAL) ?? zero()),
  ].filter((r) => r.featureId !== null || r.total.planned > 0 || r.total.actual > 0 || !hasFeatures);
  if (laborTracking === "project") {
    // Labor is logged for the whole job — its own row, never split by guess.
    matrix.push(buildRow("labor", "labor", "Labor (whole job)", zero(), { ...zero(), labor: laborActual }));
  }
  const typeTotals = (which: "planned" | "actual") => {
    const out = zero();
    for (const r of matrix) for (const b of COST_BUCKETS) out[b] += r.cells[b][which];
    return out;
  };
  const plannedTypes = typeTotals("planned");
  const actualTypes = typeTotals("actual");
  const byType: MatrixRow[] = COST_BUCKETS.map((b) => {
    const p = { ...zero(), [b]: plannedTypes[b] };
    const a = { ...zero(), [b]: actualTypes[b] };
    return buildRow(b, b, COST_TYPE_LABEL[b], p, a);
  }).filter((r) => r.total.planned > 0 || r.total.actual > 0);

  // --- Totals, variance, profit -------------------------------------------
  const planned = r2(summary.planned.total);
  const actual = r2(COST_BUCKETS.reduce((s, b) => s + actualTypes[b], 0));
  const pa = plannedActualReport({
    features: input.features,
    categories: input.categories,
    sections: input.sections,
    quotes: input.quotes,
    changeOrders: input.changeOrders,
    expenses: input.expenses,
    expenseCategories: input.expenseCategories,
    laborEntries: input.laborEntries,
    deliveries,
    usageLogs: input.usageLogs,
    materialsCounted: input.materialsCounted,
    overheadRate: input.overheadRate,
    thresholds: t,
  });
  const variance = r2(pa.project.total.actual - pa.project.total.planned);
  const variancePct = pa.project.total.planned > 0 ? (variance / pa.project.total.planned) * 100 : null;

  // --- Progress (time) vs spend --------------------------------------------
  const estimateDays = input.project.estimated_duration_days ?? null;
  const start = input.project.actual_start_date ?? null;
  const end = input.project.actual_end_date ?? null;
  const elapsedRaw = start ? countWorkingDays(start, (end ?? input.today).slice(0, 10)) : null;
  const elapsedDays = elapsedRaw == null ? null : Math.max(0, elapsedRaw - input.weatherDays);
  const progressPct =
    input.project.status === "complete" ? 100 : estimateDays && elapsedDays != null ? Math.min(100, (elapsedDays / estimateDays) * 100) : start ? null : 0;
  const spentPct = planned > 0 ? (actual / planned) * 100 : null;
  const spendAhead = spentPct != null && progressPct != null && input.project.status !== "complete" && spentPct - progressPct > 15;

  const status: JobCostStatus =
    variance > 0 ? "over" : input.project.status === "complete" && planned > 0 && actual < planned * 0.97 ? "under" : spendAhead ? "ahead" : "on_track";

  // --- Vendors, series, top types ------------------------------------------
  const vendors = new Map<string, { name: string; total: number; count: number }>();
  for (const r of rows) {
    if (r.source === "labor" || !r.vendor?.trim()) continue;
    const k = r.vendor.trim().toLowerCase();
    const v = vendors.get(k) ?? { name: r.vendor.trim(), total: 0, count: 0 };
    v.total += r.amount;
    v.count++;
    vendors.set(k, v);
  }
  const byDate = new Map<string, number>();
  for (const r of rows) if (r.inTotals) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.amount);
  let run = 0;
  const series = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amt]) => ({ date, actual: r2((run += amt)) }));
  const topTypes = COST_BUCKETS.map((b) => ({ type: b, amount: r2(actualTypes[b]) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

  return {
    actual,
    planned,
    remaining: r2(planned - actual),
    spentPct,
    variance,
    variancePct,
    status,
    profit: {
      expected: pa.profit.expected,
      projected: pa.profit.actual,
      expectedFullyLoaded: pa.profit.expectedFullyLoaded,
      projectedFullyLoaded: pa.profit.actualFullyLoaded,
      overheadRate: input.overheadRate,
    },
    progress: { estimateDays, elapsedDays, weatherDays: input.weatherDays, pct: progressPct, started: !!start, spendAhead },
    laborTracking,
    matrix,
    byType,
    labor: {
      approvedHours: r2(approvedHours),
      regHours: r2(regHours),
      otHours: r2(otHours),
      approvedCost: r2(approvedCost),
      pendingHours: r2(pendingHours),
      pendingCost: r2(pendingCost),
      plannedHours: r2(plannedLaborHours),
      plannedCost: r2(plannedLaborCost),
      // Open job: only an overrun is a variance (unlogged hours aren't a saving).
      variance: input.project.status === "complete" ? r2(laborActual - plannedLaborCost) : r2(Math.max(0, laborActual - plannedLaborCost)),
      people: [...people.values()].sort((a, b) => b.approvedCost + b.pendingCost - (a.approvedCost + a.pendingCost)),
      manualLaborExpenses: input.laborEntries.length > 0 ? r2(manualLaborExpenses) : 0,
      manualLaborCount: input.laborEntries.length > 0 ? manualLaborCount : 0,
    },
    materials: {
      lines: materialLines,
      deliveries: deliveryRows,
      deliveredTotal,
      unplannedDeliveredCost: r2(unplannedDeliveredCost),
      supplierCredits: r2(supplierCredits),
      materialExpenses: r2(materialExpenses),
      materialExpenseCount,
      counted: input.materialsCounted,
    },
    rows,
    vendors: [...vendors.values()].map((v) => ({ ...v, total: r2(v.total) })).sort((a, b) => b.total - a.total),
    series,
    unassignedCount,
    topTypes,
    remainingBudget: (featureId, type) => {
      const k = keyOf(featureId);
      const p = plannedBy.get(k)?.[type] ?? 0;
      // Labor logged for the whole job isn't in any feature's cell.
      const a = actualBy.get(k)?.[type] ?? 0;
      return { planned: r2(p), actual: r2(a), remaining: r2(p - a) };
    },
  };
}

export const JOB_COST_STATUS_META: Record<JobCostStatus, { label: string; className: string }> = {
  on_track: { label: "On track", className: "badge-status badge-paid" },
  over: { label: "Over plan", className: "badge-status badge-overdue" },
  under: { label: "Under plan", className: "badge-status badge-paid" },
  ahead: { label: "Spending ahead", className: "badge-status badge-pending" },
};
