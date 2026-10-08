/**
 * Project page "New overview" (command center) — pure helpers over data the
 * app already has. Nothing here invents a number: money comes from
 * jobCostReport (jobCosts.ts → plannedActual.ts) and featurePrice, time from
 * projectDurationStatus, materials from materialsCenterReport, next actions
 * from the Needs you queue + readiness + tasks.
 */
import { quoteTotal, type ChangeOrder, type Project, type ProjectEvent, type ProgressUpdate, type ProjectImage, type Quote, type Task } from "./api";
import type { NeedsYouItem } from "./needsYou";
import { COST_BUCKETS, type CostBucket } from "./costPlanMath";
import { featurePrice } from "./featureFinancials";
import type { JobCostReport, MatrixRow } from "./jobCosts";
import { projectDurationStatus } from "./projectDuration";

// --- Stage + status ----------------------------------------------------------

export type OverviewStage = "estimating" | "before" | "during" | "after";

/** Which part of the job this is — drives what the overview leads with. */
export function overviewStage(p: Pick<Project, "status" | "actual_start_date">): OverviewStage {
  if (p.status === "estimating" || p.status === "lost") return "estimating";
  if (p.status === "complete") return "after";
  if (p.status === "in_progress" || p.actual_start_date) return "during";
  return "before";
}

/**
 * The header's status words. Never "Scheduled" without schedule dates, and
 * "Ready to start" only when every required readiness item is done — the
 * stored status (Won sets "scheduled" before any dates exist) stays as is.
 */
export function overviewStatusLabel(
  p: Pick<Project, "status" | "actual_start_date" | "scheduled_start_date">,
  readinessReady: boolean | null,
): string {
  switch (overviewStage(p)) {
    case "estimating":
      return p.status === "lost" ? "Lost" : "Estimating";
    case "after":
      return "Completed";
    case "during":
      return "In progress";
    default:
      if (!p.scheduled_start_date) return "Won · not scheduled yet";
      return readinessReady ? "Ready to start" : "Scheduled";
  }
}

// --- Time elapsed --------------------------------------------------------------

export type TimeElapsed =
  | { kind: "no_estimate" }
  | { kind: "not_started"; estimate: number }
  | {
      kind: "elapsed";
      /** Working days since the actual start (Mon–Fri, projectDuration.ts). */
      elapsed: number;
      estimate: number;
      /** elapsed ÷ estimate, capped at 100 for the bar. */
      pct: number;
      /** Past the estimate, weather days not counted as running over. */
      overDays: number;
      weatherDays: number;
    }
  | { kind: "final"; total: number; estimate: number; diffDays: number; weatherDays: number };

export function timeElapsed(
  p: Pick<Project, "estimated_duration_days" | "actual_start_date" | "actual_end_date">,
  weatherDays: number,
  now: Date = new Date(),
): TimeElapsed {
  const s = projectDurationStatus(p, now, weatherDays);
  if (s.state === "empty") return { kind: "no_estimate" };
  if (s.state === "not_started") return { kind: "not_started", estimate: s.estimateDays };
  if (s.state === "complete") return { kind: "final", total: s.totalDays, estimate: s.estimateDays, diffDays: s.diffDays, weatherDays: s.weatherDays };
  return {
    kind: "elapsed",
    elapsed: s.elapsedDays,
    estimate: s.estimateDays,
    pct: Math.min(100, Math.round((s.elapsedDays / s.estimateDays) * 100)),
    overDays: s.overDays,
    weatherDays: s.weatherDays,
  };
}

// --- Money ---------------------------------------------------------------------

/**
 * The price the projected profit is measured against — every approved quote
 * (original + add-ons) plus approved change orders, the same base
 * plannedActualReport uses, so profit / price reconciles with the Money tab.
 */
export function profitPrice(quotes: Pick<Quote, "status" | "quote_sections">[], changeOrders: Pick<ChangeOrder, "status" | "change_order_sections">[]): number {
  const q = quotes.filter((x) => x.status === "approved").reduce((s, x) => s + quoteTotal(x.quote_sections), 0);
  const co = changeOrders
    .filter((x) => x.status === "approved")
    .reduce(
      (s, x) =>
        s + (x.change_order_sections ?? []).reduce((a, sec) => a + (sec.change_order_items ?? []).reduce((b, i) => b + Number(i.price) * (i.quantity == null ? 1 : Number(i.quantity)), 0), 0),
      0,
    );
  return Math.round((q + co) * 100) / 100;
}

export function marginPct(profit: number, price: number): number | null {
  return price > 0 ? (profit / price) * 100 : null;
}

// --- Features & profitability ---------------------------------------------------

export interface FeatureProfitRow {
  key: string;
  kind: "feature" | "general" | "labor";
  featureId: string | null;
  name: string;
  /** From the approved quote section(s) + approved change orders; null for labor. */
  price: number | null;
  planned: number;
  actual: number;
  /** actual − planned when over, else 0. */
  overPlan: number;
  /** Projected margin %, or null with `marginWhy` when it can't be worked out honestly. */
  margin: number | null;
  marginWhy?: string;
  /** Labor logged for the whole job: this feature's margin counts labor at plan. */
  laborAtPlan?: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * One row per active feature, then General / unassigned, then (when labor is
 * logged for the whole job) a Labor row — straight from jobCostReport's
 * matrix, so Planned and Actual add up to the report's totals (the Money
 * tab's / Cost plan's numbers). When labor is project-wide, each feature's
 * planned labor moves to the Labor row (never split actuals by guess), and
 * the feature's margin counts its labor at plan.
 *
 * Projected cost per bucket: an open job carries spend below plan at plan
 * (overruns count at once) — plannedActual's rule; delivered material is
 * carried at plan until the job's Complete and reconciled.
 */
export function featureProfitRows(input: {
  report: Pick<JobCostReport, "matrix" | "laborTracking" | "planned" | "actual" | "profit">;
  quotes: Quote[];
  changeOrders: ChangeOrder[];
  jobOpen: boolean;
  materialsCounted: boolean;
}): { rows: FeatureProfitRow[]; total: { price: number; planned: number; actual: number; profit: number; margin: number | null } } {
  const { report, quotes, changeOrders } = input;
  const projectLabor = report.laborTracking === "project";
  const totalPrice = profitPrice(quotes, changeOrders);
  const featureRows = report.matrix.filter((m) => m.featureId !== "labor");
  const featurePriceSum = featureRows.filter((m) => m.featureId).reduce((s, m) => s + featurePrice(m.featureId!, quotes, changeOrders), 0);
  // 0168: material cost is the paid purchases' expenses, like every other type.
  const carried = (_b: CostBucket) => input.jobOpen;
  const projectedOf = (m: MatrixRow, laborAtPlan: boolean) =>
    COST_BUCKETS.reduce((s, b) => {
      const { planned, actual } = m.cells[b];
      if (b === "labor" && laborAtPlan) return s + planned;
      return s + (carried(b) ? Math.max(planned, actual) : actual);
    }, 0);

  let laborPlanned = 0;
  const rows: FeatureProfitRow[] = featureRows.map((m) => {
    const isGeneral = !m.featureId;
    const price = isGeneral ? r2(totalPrice - featurePriceSum) : r2(featurePrice(m.featureId!, quotes, changeOrders));
    const labPlan = projectLabor ? m.cells.labor.planned : 0;
    laborPlanned += labPlan;
    const planned = r2(m.total.planned - labPlan);
    const actual = r2(m.total.actual - (projectLabor ? m.cells.labor.actual : 0));
    const projected = projectedOf(m, projectLabor);
    let margin: number | null = null;
    let marginWhy: string | undefined;
    if (price <= 0) marginWhy = isGeneral ? "No quote price outside the features" : "No approved quote price linked to this feature";
    else if (m.total.planned <= 0 && m.total.actual <= 0) marginWhy = "No planned cost yet";
    else margin = ((price - projected) / price) * 100;
    return {
      key: m.key,
      kind: isGeneral ? "general" : "feature",
      featureId: m.featureId,
      name: isGeneral ? (featureRows.length > 1 ? "General / unassigned" : m.name) : m.name,
      price,
      planned,
      actual,
      overPlan: r2(Math.max(0, actual - planned)),
      margin,
      marginWhy,
      laborAtPlan: projectLabor && labPlan > 0 && !isGeneral,
    };
  });
  const general = rows.filter((r) => r.kind === "general");
  const out = [...rows.filter((r) => r.kind === "feature"), ...general.filter((r) => r.price || r.planned || r.actual)];
  if (projectLabor) {
    const laborRow = report.matrix.find((m) => m.featureId === "labor");
    const actual = r2(laborRow?.total.actual ?? 0);
    out.push({
      key: "labor",
      kind: "labor",
      featureId: "labor",
      name: "Labor (whole job)",
      price: null,
      planned: r2(laborPlanned),
      actual,
      overPlan: r2(Math.max(0, actual - laborPlanned)),
      margin: null,
      marginWhy: "Labor has no price of its own — it's in the features' prices",
    });
  }
  const profit = report.profit.projected;
  return {
    rows: out,
    total: { price: totalPrice, planned: r2(report.planned), actual: r2(report.actual), profit, margin: marginPct(profit, totalPrice) },
  };
}

// --- Next actions -----------------------------------------------------------------

type NeedsYouItemLike = Pick<NeedsYouItem, "key" | "title" | "subtitle" | "href">;

export interface NextAction {
  key: string;
  title: string;
  detail?: string;
  href: string;
  /** Runs the workflow instead of navigating (e.g. "create the deposit invoice"). */
  onClick?: () => void;
  /** A real task — completing it is a checkbox. */
  taskId?: string;
}

/** This project's items from the Needs you queue: anything linking into it. */
export function projectNeedsYou(items: NeedsYouItemLike[], projectId: string, relatedIds: string[]): NeedsYouItemLike[] {
  const ids = [projectId, ...relatedIds];
  return items.filter((i) => ids.some((id) => i.href.includes(id)));
}

export function buildNextActions(input: {
  projectId: string;
  needsYou: NeedsYouItemLike[];
  /** Required readiness items still open (before the job starts). */
  preconOpen: { key: string; label: string; detail?: string }[];
  tasks: Pick<Task, "id" | "title" | "due_at" | "completed" | "project_id">[];
  extras: NextAction[];
}): NextAction[] {
  const out: NextAction[] = [...input.extras];
  const seen = new Set(out.map((a) => a.title.toLowerCase()));
  const push = (a: NextAction) => {
    const k = a.title.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };
  for (const n of input.needsYou) {
    if (n.key.startsWith("task-") || n.key.startsWith("precon-")) continue; // tasks + readiness come in their own form below
    push({ key: `ny-${n.key}`, title: n.title, detail: n.subtitle, href: n.href });
  }
  for (const p of input.preconOpen) push({ key: `precon-${p.key}`, title: p.label, detail: p.detail, href: `/projects/${input.projectId}?tab=schedule#precon` });
  const open = input.tasks
    .filter((t) => t.project_id === input.projectId && !t.completed)
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  for (const t of open) push({ key: `task-${t.id}`, title: t.title, detail: t.due_at ? `Due ${t.due_at.slice(0, 10)}` : undefined, href: "/tasks", taskId: t.id });
  return out;
}

// --- Recent updates ---------------------------------------------------------------

export interface RecentUpdate {
  key: string;
  at: string;
  source: "Crew update" | "Progress update" | "Photo" | "System";
  text: string;
  photoPaths: string[];
}

/** Activity worth surfacing: approvals, payments, schedule changes — not every logged expense. */
const MEANINGFUL_EVENTS = new Set([
  "status_changed",
  "quote_signed",
  "quote_converted",
  "invoice_sent",
  "invoice_paid",
  "change_order_sent",
  "change_order_approved",
  "change_order_rejected",
  "project_started",
  "payment_received",
  "payment_voided",
  "schedule_delay",
  "schedule_delay_undone",
  "client_heads_up",
  "review_requested",
]);

export function recentUpdates(input: {
  progress: Pick<ProgressUpdate, "id" | "created_at" | "author_employee_id" | "milestone" | "note" | "status" | "photos">[];
  images: Pick<ProjectImage, "id" | "created_at" | "storage_path" | "caption">[];
  events: Pick<ProjectEvent, "id" | "created_at" | "kind" | "summary">[];
  limit?: number;
}): RecentUpdate[] {
  const fromUpdates = new Set(input.progress.flatMap((u) => (u.photos ?? []).map((p) => p.storage_path)));
  const items: RecentUpdate[] = [
    ...input.progress.map((u) => ({
      key: `u-${u.id}`,
      at: u.created_at,
      source: (u.author_employee_id ? "Crew update" : "Progress update") as RecentUpdate["source"],
      text: [u.milestone, u.note].filter(Boolean).join(" — ") || "Photo update",
      photoPaths: (u.photos ?? []).slice(0, 3).map((p) => p.storage_path),
    })),
    ...input.images
      .filter((i) => !fromUpdates.has(i.storage_path))
      .map((i) => ({ key: `p-${i.id}`, at: i.created_at, source: "Photo" as const, text: i.caption || "Photo added", photoPaths: [i.storage_path] })),
    ...input.events.filter((e) => MEANINGFUL_EVENTS.has(e.kind)).map((e) => ({ key: `e-${e.id}`, at: e.created_at, source: "System" as const, text: e.summary, photoPaths: [] })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, input.limit ?? 5);
}
