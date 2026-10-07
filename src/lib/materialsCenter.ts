/**
 * Materials command center (project Material orders view) — the one place
 * that turns the Cost plan's material lines, orders / deliveries, usage and
 * suppliers into the view's numbers. Pure, over fetched rows, and built on
 * the helpers every other materials screen uses, so nothing disagrees:
 *
 *   planned / ordered / delivered / used   effectiveEstimate, orderedQuantity,
 *                                          deliveredQuantity, usedQuantity
 *   still to order + readiness             materialSignals — the exact
 *                                          pre-construction "Materials
 *                                          ordered" / "Deliveries scheduled"
 *                                          rules (same tracked line set)
 *   cost                                   lineActualCost (delivered × price)
 *   leftovers                              leftoverQuantity + reconcile state
 *
 * An order row is also its delivery (status ordered → delivered); a partial
 * delivery is a delivered line plus an open remainder (logDelivery).
 */
import {
  DELIVERY_ISSUE_LABEL,
  type DeliveryIssueKind,
  type MaterialOrder,
  type MaterialOrderItem,
  type MaterialsItem,
  type MaterialsSection,
  type MaterialsUsageLog,
  type ProductCatalogItem,
  type ScheduleDelay,
  type Supplier,
} from "./api";
import { costTypeOf } from "./costPlanMath";
import { countsTowardTotals } from "./features";
import {
  deliveredQuantity,
  effectiveDeliveryStatus,
  effectiveEstimate,
  lineActualCost,
  lineTaxFactor,
  orderedQuantity,
  orderingStatus,
  overEstimate,
  usageStatus,
  usedQuantity,
  type DeliveryLineWithOrderStatus,
  type LineStatus,
} from "./materialTracking";
import { materialLineLabel } from "./materialsMath";
import { nextOrderableQuantity } from "./catalogOrdering";
import { materialSignals } from "./preconSignals";
import { countWorkingDays } from "./projectDuration";

const EPS = 1e-6;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export type OrderState = "ordered" | "scheduled" | "partial" | "delivered" | "delayed";
export const ORDER_STATE_META: Record<OrderState, { label: string; className: string }> = {
  ordered: { label: "Ordered", className: "badge-status badge-pending" },
  scheduled: { label: "Scheduled", className: "badge-status badge-info" },
  partial: { label: "Partially delivered", className: "badge-status badge-pending" },
  delivered: { label: "Delivered", className: "badge-status badge-paid" },
  delayed: { label: "Delayed", className: "badge-status badge-overdue" },
};

export interface MaterialLineView {
  id: string;
  label: string;
  featureId: string | null;
  sectionId: string;
  sectionName: string;
  unit: string | null;
  tracked: boolean;
  /** Usage-tracked and more used than planned (0167) — a quiet note, not an alert. */
  over: boolean;
  needed: number;
  ordered: number;
  delivered: number;
  used: number;
  onSite: number;
  toOrder: number;
  plannedCost: number;
  deliveredCost: number;
  /** Delivered cost − planned, once fully delivered. */
  variance: number | null;
  status: LineStatus;
  /** Rounded up to the product's package (catalog), if it isn't already. */
  orderableHint: number | null;
  usualSupplier: string | null;
  unitCost: number;
  disposition: MaterialsItem["disposition"] | null;
  returnCredit: number;
}

export interface OrderView {
  order: MaterialOrder;
  state: OrderState;
  /** Delivered amount (delivered lines × price, else the plan's unit cost). */
  deliveredAmount: number;
  /** Everything on the order at price (or plan cost). */
  orderAmount: number;
  openLines: number;
  openIssues: MaterialOrderItem[];
  afterStart: boolean;
  movedByDelay: { from: string; to: string } | null;
  palletCharge: number;
  palletCredit: number;
}

export interface OpenIssue {
  orderId: string;
  supplier: string | null;
  item: MaterialOrderItem;
  kind: DeliveryIssueKind;
  label: string;
}

export interface MaterialsCenterReport {
  lines: MaterialLineView[];
  stillToOrder: MaterialLineView[];
  orders: OrderView[];
  summary: {
    lineCount: number;
    fullyOrdered: number;
    fullyDelivered: number;
    inUse: number;
    plannedCost: number;
    orderedCost: number;
    deliveredCost: number;
    nextDelivery: { order: MaterialOrder; date: string; items: string[] } | null;
  };
  readiness: { daysToStart: number | null; short: string[]; unscheduled: string[]; before: boolean };
  issues: OpenIssue[];
  leftovers: MaterialLineView[];
  pallets: { supplier: string; delivered: number; returned: number; outstanding: number; charged: number; credit: number }[];
  credits: { returns: number; pallets: number; total: number };
  suppliers: { name: string; spend: number; openOrders: number; orders: number; contact: Supplier | null }[];
  calendar: { workDays: string[]; items: { date: string; orderId: string; supplier: string | null; kind: "expected" | "delivered"; afterStart: boolean; rain: boolean; moved: boolean }[] };
}

const orderUnitCost = (item: MaterialOrderItem, line: MaterialsItem | undefined) =>
  item.unit_price != null ? Number(item.unit_price) : line ? Number(line.unit_cost) : 0;

export function materialsCenterReport(input: {
  project: { id: string; status: string; scheduled_start_date: string | null; scheduled_end_date: string | null };
  sections: MaterialsSection[];
  orders: MaterialOrder[];
  usageLogs: MaterialsUsageLog[];
  suppliers: Supplier[];
  catalog: Pick<ProductCatalogItem, "id" | "specs">[];
  delays: Pick<ScheduleDelay, "deliveries" | "undone_at">[];
  rainDates?: Set<string>;
  today: string;
}): MaterialsCenterReport {
  const { project, today } = input;
  const start = project.scheduled_start_date;
  const deliveries: DeliveryLineWithOrderStatus[] = input.orders.flatMap((o) => o.material_order_items.map((item) => ({ item, orderStatus: o.status })));
  const counted = input.sections.filter(countsTowardTotals);
  const allLines = counted.flatMap((s) => (s.materials_items ?? []).filter((l) => costTypeOf(l) === "material").map((l) => ({ line: l, section: s })));
  const lineById = new Map(allLines.map((x) => [x.line.id, x.line]));
  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const orderById = new Map(input.orders.map((o) => [o.id, o]));

  // Usual supplier per line: the most recent order that carried it.
  const supplierFor = new Map<string, string>();
  for (const o of [...input.orders].sort((a, b) => (a.ordered_on ?? a.created_at).localeCompare(b.ordered_on ?? b.created_at))) {
    if (!o.supplier) continue;
    for (const i of o.material_order_items) if (i.materials_item_id) supplierFor.set(i.materials_item_id, o.supplier);
  }

  const lines: MaterialLineView[] = allLines.map(({ line, section }) => {
    const est = effectiveEstimate(line);
    const ordered = orderedQuantity(line, deliveries);
    const delivered = deliveredQuantity(line, deliveries);
    const used = usedQuantity(line, input.usageLogs);
    // After tax, like the plan's totals (0163); order amounts stay at the
    // supplier's prices.
    const taxFactor = lineTaxFactor(line);
    const plannedCost = est.quantity * est.unit_cost * taxFactor;
    const deliveredCost = lineActualCost(line, deliveries) * taxFactor;
    const toOrder = Math.max(0, est.quantity - ordered);
    const specs = line.catalog_product_id ? catalogById.get(line.catalog_product_id)?.specs : undefined;
    return {
      id: line.id,
      label: materialLineLabel(line),
      featureId: section.feature_id ?? null,
      sectionId: section.id,
      sectionName: section.name,
      unit: est.unit ?? line.unit ?? null,
      tracked: !!line.tracked,
      needed: r3(est.quantity),
      ordered: r3(ordered),
      delivered: r3(delivered),
      used: r3(used),
      // What's left on site is only knowable when usage is logged (0167).
      onSite: line.tracked ? r3(Math.max(0, delivered - used)) : 0,
      toOrder: r3(toOrder),
      plannedCost: r2(plannedCost),
      deliveredCost: r2(deliveredCost),
      variance: delivered > EPS && delivered + EPS >= est.quantity ? r2(deliveredCost - plannedCost) : null,
      // Ordering status for every line; usage stages only when usage-tracked.
      // Over-estimate is never a status — it's the quiet `over` note (0167).
      status: line.tracked
        ? usageStatus(ordered, delivered, used, deliveries.some((d) => d.item.materials_item_id === line.id))
        : orderingStatus(ordered, delivered, deliveries.some((d) => d.item.materials_item_id === line.id)),
      over: !!line.tracked && overEstimate(est.quantity, used),
      orderableHint: toOrder > EPS ? nextOrderableQuantity(toOrder, specs) : null,
      usualSupplier: supplierFor.get(line.id) ?? null,
      unitCost: Number(est.unit_cost),
      disposition: line.disposition ?? null,
      returnCredit: line.disposition === "returned" ? Number(line.return_credit ?? 0) : 0,
    };
  });

  // Readiness + still to order: the pre-construction rules, same line set.
  // Every material line — ordering isn't about usage tracking (0167).
  const materialLines = allLines.map((x) => x.line);
  const signals = materialSignals(materialLines, deliveries, input.orders, start);
  const executionIds = new Set(materialLines.filter((l) => effectiveEstimate(l).quantity > EPS).map((l) => l.id));
  const stillToOrder = lines.filter((l) => executionIds.has(l.id) && l.ordered + EPS < l.needed);
  const daysToStart = start ? Math.round((new Date(`${start}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000) : null;

  // Orders.
  const movedBy = new Map<string, { from: string; to: string }>();
  for (const d of input.delays) {
    if (d.undone_at) continue;
    for (const m of d.deliveries ?? []) movedBy.set(m.order_id, { from: m.from, to: m.to });
  }
  const orders: OrderView[] = input.orders.map((o) => {
    const states = o.material_order_items.map((i) => effectiveDeliveryStatus(i, o.status));
    const delivered = states.filter((s) => s === "delivered").length;
    const openLines = states.length - delivered;
    const state: OrderState =
      states.length > 0 && openLines === 0 ? "delivered" : o.status === "delivered" && states.length === 0 ? "delivered"
        : delivered > 0 ? "partial"
        : o.status === "delayed" ? "delayed"
        : o.expected_delivery_date ? "scheduled"
        : "ordered";
    let deliveredAmount = 0;
    let orderAmount = 0;
    for (const i of o.material_order_items) {
      const line = i.materials_item_id ? lineById.get(i.materials_item_id) : undefined;
      const amt = line ? lineActualCost(line, [{ item: { ...i, status: "delivered" }, orderStatus: "delivered" }]) : Number(i.quantity) * orderUnitCost(i, undefined);
      orderAmount += amt;
      if (effectiveDeliveryStatus(i, o.status) === "delivered") deliveredAmount += amt;
    }
    const each = Number(o.pallet_deposit_each ?? 0);
    return {
      order: o,
      state,
      deliveredAmount: r2(deliveredAmount),
      orderAmount: r2(orderAmount),
      openLines,
      openIssues: o.material_order_items.filter((i) => i.issue && !i.issue_resolved_at),
      afterStart: !!start && !!o.expected_delivery_date && state !== "delivered" && o.expected_delivery_date > start,
      movedByDelay: movedBy.get(o.id) ?? null,
      palletCharge: r2((o.pallets_delivered ?? 0) * each),
      palletCredit: r2((o.pallets_returned ?? 0) * each),
    };
  });
  orders.sort((a, b) => {
    const ka = a.order.delivered_on ?? a.order.expected_delivery_date ?? a.order.ordered_on ?? a.order.created_at;
    const kb = b.order.delivered_on ?? b.order.expected_delivery_date ?? b.order.ordered_on ?? b.order.created_at;
    return ka.localeCompare(kb);
  });

  const issues: OpenIssue[] = orders.flatMap((ov) =>
    ov.openIssues.map((item) => ({ orderId: ov.order.id, supplier: ov.order.supplier, item, kind: item.issue!, label: DELIVERY_ISSUE_LABEL[item.issue!] })),
  );

  const pending = orders
    .filter((o) => o.state !== "delivered" && o.order.expected_delivery_date && o.order.expected_delivery_date >= today)
    .sort((a, b) => a.order.expected_delivery_date!.localeCompare(b.order.expected_delivery_date!));
  const next = pending[0];
  const nextDelivery = next
    ? {
        order: next.order,
        date: next.order.expected_delivery_date!,
        items: next.order.material_order_items.filter((i) => effectiveDeliveryStatus(i, next.order.status) !== "delivered").map((i) => i.description),
      }
    : null;

  // Pallets per supplier.
  const palletMap = new Map<string, { supplier: string; delivered: number; returned: number; outstanding: number; charged: number; credit: number }>();
  for (const ov of orders) {
    const o = ov.order;
    if (!o.pallets_delivered && !o.pallets_returned) continue;
    const k = (o.supplier ?? "Supplier").trim();
    const p = palletMap.get(k) ?? { supplier: k, delivered: 0, returned: 0, outstanding: 0, charged: 0, credit: 0 };
    p.delivered += o.pallets_delivered ?? 0;
    p.returned += o.pallets_returned ?? 0;
    p.charged += ov.palletCharge;
    p.credit += ov.palletCredit;
    p.outstanding = p.delivered - p.returned;
    palletMap.set(k, p);
  }
  const pallets = [...palletMap.values()];
  const returnCredits = r2(lines.reduce((s, l) => s + l.returnCredit, 0));
  const palletCredits = r2(pallets.reduce((s, p) => s + p.credit, 0));

  // Suppliers.
  const supMap = new Map<string, { name: string; spend: number; openOrders: number; orders: number; contact: Supplier | null }>();
  for (const ov of orders) {
    const name = ov.order.supplier?.trim();
    if (!name) continue;
    const k = name.toLowerCase();
    const s = supMap.get(k) ?? { name, spend: 0, openOrders: 0, orders: 0, contact: input.suppliers.find((x) => x.name.trim().toLowerCase() === k) ?? null };
    s.spend += ov.deliveredAmount + ov.palletCharge - ov.palletCredit;
    s.orders++;
    if (ov.state !== "delivered") s.openOrders++;
    supMap.set(k, s);
  }

  // Calendar: scheduled work days + delivery dates.
  const workDays: string[] = [];
  if (start && project.scheduled_end_date) {
    const d = new Date(`${start}T00:00:00`);
    const end = new Date(`${project.scheduled_end_date}T00:00:00`);
    while (d <= end && workDays.length < 120) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (countWorkingDays(iso, iso) === 1) workDays.push(iso);
      d.setDate(d.getDate() + 1);
    }
  }
  const calendarItems = orders
    .map((ov) => {
      const date = ov.state === "delivered" ? (ov.order.delivered_on ?? ov.order.expected_delivery_date) : ov.order.expected_delivery_date;
      if (!date) return null;
      return {
        date,
        orderId: ov.order.id,
        supplier: ov.order.supplier,
        kind: (ov.state === "delivered" ? "delivered" : "expected") as "expected" | "delivered",
        afterStart: ov.afterStart,
        rain: ov.state !== "delivered" && !!input.rainDates?.has(date),
        moved: !!ov.movedByDelay,
      };
    })
    .filter(Boolean) as MaterialsCenterReport["calendar"]["items"];

  const trackedLines = lines.filter((l) => executionIds.has(l.id)); // every planned material line
  return {
    lines,
    stillToOrder,
    orders,
    summary: {
      lineCount: trackedLines.length,
      fullyOrdered: trackedLines.filter((l) => l.ordered + EPS >= l.needed).length,
      fullyDelivered: trackedLines.filter((l) => l.delivered + EPS >= l.needed).length,
      inUse: trackedLines.filter((l) => l.used > EPS).length,
      plannedCost: r2(lines.reduce((s, l) => s + l.plannedCost, 0)),
      // Everything on order, at the price entered (else the plan's unit cost).
      orderedCost: r2(orders.reduce((s, o) => s + o.orderAmount, 0)),
      deliveredCost: r2(orders.reduce((s, o) => s + o.deliveredAmount, 0)),
      nextDelivery,
    },
    readiness: {
      daysToStart,
      short: signals.materials.short,
      unscheduled: signals.deliveries.unscheduled,
      before: project.status !== "in_progress" && project.status !== "complete" && (daysToStart == null || daysToStart >= 0),
    },
    issues,
    leftovers: lines.filter((l) => l.onSite > EPS || l.disposition),
    pallets,
    credits: { returns: returnCredits, pallets: palletCredits, total: r2(returnCredits + palletCredits) },
    suppliers: [...supMap.values()].map((s) => ({ ...s, spend: r2(s.spend) })).sort((a, b) => b.spend - a.spend),
    calendar: { workDays, items: calendarItems.sort((a, b) => a.date.localeCompare(b.date)) },
  };
}

const STOP = new Set(["the", "and", "for", "with", "of", "a", "an", "to", "in", "on", "per", "each", "bag", "bags", "ton", "tons", "pc", "pcs", "piece", "pieces"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));

/** Scanned receipt lines → the order's open lines (word overlap, like the
 * Cost plan suggester). Each order line takes its best receipt line once;
 * returns orderItemId → the receipt line (quantity / unit price), for the
 * Log delivery review — never saved without the user confirming. */
export function matchReceiptToOrderLines<T extends { description: string; quantity: number | null; unit_price: number | null }>(
  receiptLines: T[],
  items: Pick<MaterialOrderItem, "id" | "description">[],
): Map<string, T> {
  const scored: { itemId: string; idx: number; score: number }[] = [];
  items.forEach((it) => {
    const a = words(it.description);
    if (!a.size) return;
    receiptLines.forEach((rl, idx) => {
      const b = words(rl.description);
      let shared = 0;
      for (const w of a) if (b.has(w)) shared++;
      if (shared > 0) scored.push({ itemId: it.id, idx, score: shared / Math.max(a.size, b.size) });
    });
  });
  scored.sort((x, y) => y.score - x.score);
  const out = new Map<string, T>();
  const used = new Set<number>();
  for (const s of scored) {
    if (out.has(s.itemId) || used.has(s.idx)) continue;
    out.set(s.itemId, receiptLines[s.idx]);
    used.add(s.idx);
  }
  return out;
}

/** Open delivery issues across every job → "Needs you" items (0152). One
 * item per order with open issues; red when the job starts within a week
 * (or has started), else grey. Resolved issues drop off. */
export function materialIssueNeedsYouItems(
  orders: Pick<MaterialOrder, "id" | "project_id" | "supplier" | "material_order_items">[],
  projectsById: Map<string, { name: string; status: string; scheduled_start_date: string | null }>,
  today: string,
): { key: string; tone: "red" | "grey"; title: string; subtitle: string; action: string; href: string; sortValue: number; category: "jobs" }[] {
  const out: ReturnType<typeof materialIssueNeedsYouItems> = [];
  for (const o of orders) {
    const open = o.material_order_items.filter((i) => i.issue && !i.issue_resolved_at);
    if (open.length === 0) continue;
    const p = projectsById.get(o.project_id);
    if (!p || p.status === "complete" || p.status === "lost") continue;
    const days = p.scheduled_start_date ? Math.round((new Date(`${p.scheduled_start_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000) : null;
    const kinds = [...new Set(open.map((i) => DELIVERY_ISSUE_LABEL[i.issue!]))].join(", ");
    out.push({
      key: `material-issue-${o.id}`,
      tone: p.status === "in_progress" || (days != null && days <= 7) ? "red" : "grey",
      title: `Delivery issue · ${p.name}`,
      subtitle: `${o.supplier ?? "Supplier"} — ${kinds}: ${open.map((i) => i.description).slice(0, 2).join(", ")}${open.length > 2 ? ` +${open.length - 2}` : ""}`,
      action: "Review",
      href: `/projects/${o.project_id}/material-orders`,
      sortValue: days == null ? 0 : Math.max(0, 14 - days),
      category: "jobs",
    });
  }
  return out;
}
