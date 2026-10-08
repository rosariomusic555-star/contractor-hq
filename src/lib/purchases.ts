/**
 * Supplier purchases (0168) — how materials actually get bought and onto a
 * hardscape job: request a supplier quote, pay it (that's the order), then
 * it's delivered or picked up. A purchase is a material_orders row; the
 * expense it creates when Paid is the material cost (never entered twice).
 *
 * Pure helpers first, then the flows (they call the API).
 */
import {
  createExpense,
  createMaterialOrder,
  createMaterialReturn,
  deleteExpense,
  deleteMaterialOrder,
  getExpenseNotes,
  saveExpenseLines,
  updateExpense,
  updateMaterialOrder,
  type MaterialOrder,
  type MaterialOrderUnit,
  type MaterialsItem,
  type MaterialsSection,
} from "./api";
import { guessMaterialOrderUnit } from "./orderSheet";

/** Auto-created expenses carry this note — only those get rewritten or removed. */
export const PURCHASE_EXPENSE_NOTE = "From a supplier purchase";

/** Today as YYYY-MM-DD in local time (toISOString would give tomorrow in the evening). */
export function localToday(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const isPaid = (o: Pick<MaterialOrder, "payment_status">) => (o.payment_status ?? "paid") === "paid";
export const isOnSite = (o: Pick<MaterialOrder, "status">) => o.status === "delivered";
export const fulfillmentOf = (o: Pick<MaterialOrder, "fulfillment">) => o.fulfillment ?? "delivery";

/** "Martin Marietta · #Q-4410" — a purchase's short name. */
export function purchaseTitle(o: Pick<MaterialOrder, "supplier" | "po_number">): string {
  return [o.supplier?.trim() || "Supplier", o.po_number?.trim() ? `#${o.po_number.trim()}` : null].filter(Boolean).join(" · ");
}

/** The purchase's total: amount paid, else its priced lines. */
export function purchaseTotal(o: Pick<MaterialOrder, "amount_paid" | "material_order_items">, lineCost?: Map<string, number>): number | null {
  if (o.amount_paid != null) return Number(o.amount_paid);
  const items = o.material_order_items ?? [];
  if (items.length === 0) return null;
  let sum = 0;
  for (const i of items) {
    const price = i.unit_price != null ? Number(i.unit_price) : i.materials_item_id ? lineCost?.get(i.materials_item_id) : undefined;
    if (price == null) return null;
    sum += Number(i.quantity) * price;
  }
  return Math.round(sum * 100) / 100;
}

/**
 * How a purchase's amount splits across features for its expense —
 * proportional to each line's value (qty × price paid, else the Cost plan
 * line's unit cost); lines not on the plan go to General (null). A single
 * share when there's nothing to weigh by.
 */
export function purchaseSplit(
  order: Pick<MaterialOrder, "material_order_items">,
  amount: number,
  linesById: Map<string, { feature_id: string | null; unit_cost: number }>,
): { feature_id: string | null; amount: number }[] {
  const weights = new Map<string | null, number>();
  for (const i of order.material_order_items ?? []) {
    const line = i.materials_item_id ? linesById.get(i.materials_item_id) : undefined;
    const price = i.unit_price != null ? Number(i.unit_price) : (line?.unit_cost ?? 0);
    const key = line?.feature_id ?? null;
    weights.set(key, (weights.get(key) ?? 0) + Math.max(0, Number(i.quantity) * price));
  }
  const total = [...weights.values()].reduce((s, w) => s + w, 0);
  if (weights.size === 0 || total <= 0) {
    const only = weights.size === 1 ? [...weights.keys()][0] : null;
    return [{ feature_id: only, amount: Math.round(amount * 100) / 100 }];
  }
  const parts = [...weights.entries()].map(([feature_id, w]) => ({ feature_id, amount: Math.round((amount * w) / total * 100) / 100 }));
  // Rounding: the last part takes the remainder so they add up exactly.
  const diff = Math.round((amount - parts.reduce((s, p) => s + p.amount, 0)) * 100) / 100;
  parts[parts.length - 1].amount = Math.round((parts[parts.length - 1].amount + diff) * 100) / 100;
  return parts;
}

export type LineMaterialStatus = "not_purchased" | "partial" | "purchased" | "on_site";
export const LINE_MATERIAL_STATUS_LABEL: Record<LineMaterialStatus, string> = {
  not_purchased: "Not purchased",
  partial: "Partially purchased",
  purchased: "Purchased",
  on_site: "On site",
};

/** A Cost plan line's material status: Not purchased → Purchased (partial /
 * full) → On site. Quantities in the line's unit. */
export function lineMaterialStatus(planned: number, purchased: number, onSite: number): LineMaterialStatus {
  const eps = 1e-6;
  if (purchased <= eps) return "not_purchased";
  if (onSite > eps && onSite + eps >= Math.min(purchased, planned > eps ? planned : purchased)) return "on_site";
  return planned > eps && purchased + eps < planned ? "partial" : "purchased";
}

export function linesIndex(sections: Pick<MaterialsSection, "feature_id" | "materials_items">[]): Map<string, { feature_id: string | null; unit_cost: number; line: MaterialsItem }> {
  const m = new Map<string, { feature_id: string | null; unit_cost: number; line: MaterialsItem }>();
  for (const s of sections) for (const l of s.materials_items ?? []) m.set(l.id, { feature_id: s.feature_id ?? null, unit_cost: Number(l.unit_cost) || 0, line: l });
  return m;
}

// --- Flows ------------------------------------------------------------------

/**
 * Keep a purchase's expense in step with it: Paid with an amount → the
 * expense exists (created, or updated if it's one we created — a linked,
 * hand-entered expense is updated too, since the purchase is its source of
 * truth now); not paid / no amount → an auto-created expense is removed.
 * Returns the expense id (or null).
 */
export async function syncPurchaseExpense(
  order: MaterialOrder,
  sections: Pick<MaterialsSection, "feature_id" | "materials_items">[],
): Promise<string | null> {
  const amount = order.amount_paid != null ? Number(order.amount_paid) : null;
  const paid = isPaid(order) && amount != null && amount > 0;
  if (!paid) {
    if (order.expense_id) {
      // Only remove one we created; a linked hand-entered expense stays.
      if ((await getExpenseNotes(order.expense_id)) === PURCHASE_EXPENSE_NOTE) {
        await deleteExpense(order.expense_id).catch(() => undefined);
        await updateMaterialOrder(order.id, { expense_id: null });
      }
    }
    return null;
  }
  const split = purchaseSplit(order, amount!, linesIndex(sections));
  const single = split.length === 1;
  const fields = {
    name: `Materials — ${purchaseTitle(order)}`,
    amount: amount!,
    date: order.paid_on ?? localToday(),
    vendor: order.supplier?.trim() || null,
    cost_type: "material" as const,
    feature_id: single ? split[0].feature_id : null,
  };
  let expenseId = order.expense_id ?? null;
  if (expenseId) {
    await updateExpense(expenseId, fields);
  } else {
    const e = await createExpense({ project_id: order.project_id, ...fields, notes: PURCHASE_EXPENSE_NOTE });
    expenseId = e.id;
    await updateMaterialOrder(order.id, { expense_id: expenseId });
  }
  await saveExpenseLines(
    expenseId,
    single ? [] : split.map((p) => ({ expense_category_id: null, amount: p.amount, description: "Supplier purchase", feature_id: p.feature_id, cost_type: "material" as const })),
  );
  return expenseId;
}

/** "Log pickup" — bought and loaded in one step (bulk material during the
 * job): a small paid, picked-up purchase, its expense, and the line's
 * received quantity. */
export async function logPickup(input: {
  projectId: string;
  supplier: string | null;
  line: Pick<MaterialsItem, "id" | "name" | "unit">;
  quantity: number;
  amount: number | null;
  date: string;
  pickedUpBy?: string | null;
  attachmentPath?: string | null;
  sections: Pick<MaterialsSection, "feature_id" | "materials_items">[];
}): Promise<MaterialOrder> {
  const order = await createMaterialOrder({
    project_id: input.projectId,
    supplier: input.supplier,
    status: "delivered",
    delivered_on: input.date,
    payment_status: "paid",
    amount_paid: input.amount,
    paid_on: input.date,
    fulfillment: "pickup",
    picked_up_by: input.pickedUpBy ?? null,
    attachment_path: input.attachmentPath ?? null,
    items: [
      {
        description: input.line.name,
        quantity: input.quantity,
        unit: guessMaterialOrderUnit(input.line.unit) as MaterialOrderUnit,
        materials_item_id: input.line.id,
        unit_price: input.amount != null && input.quantity > 0 ? Math.round((input.amount / input.quantity) * 100) / 100 : null,
      },
    ],
  });
  await syncPurchaseExpense(order, input.sections);
  return order;
}

/** A return of a returnable line to the supplier: the credit is a negative
 * expense (a refund) on the line's feature, linked to the purchase. */
export async function recordReturn(input: {
  order: MaterialOrder;
  line: { id: string | null; name: string; unit: string | null; feature_id: string | null };
  quantity: number;
  credit: number;
  date: string;
  note?: string | null;
}) {
  let expenseId: string | null = null;
  if (input.credit > 0) {
    const e = await createExpense({
      project_id: input.order.project_id,
      name: `Return credit — ${purchaseTitle(input.order)}`,
      amount: -Math.abs(input.credit),
      date: input.date,
      vendor: input.order.supplier?.trim() || null,
      cost_type: "material",
      feature_id: input.line.feature_id,
      notes: PURCHASE_EXPENSE_NOTE,
    });
    expenseId = e.id;
  }
  return createMaterialReturn({
    material_order_id: input.order.id,
    materials_item_id: input.line.id,
    description: input.line.name,
    quantity: input.quantity,
    unit: input.line.unit,
    credit: Math.abs(input.credit),
    returned_on: input.date,
    expense_id: expenseId,
    note: input.note ?? null,
  });
}

/** Removes a purchase and the expenses it created (its cost and any return credits). */
export async function deletePurchase(order: MaterialOrder, returnExpenseIds: string[]): Promise<void> {
  for (const id of [order.expense_id, ...returnExpenseIds].filter(Boolean) as string[]) {
    if ((await getExpenseNotes(id)) === PURCHASE_EXPENSE_NOTE) await deleteExpense(id).catch(() => undefined);
  }
  await deleteMaterialOrder(order.id);
}

/**
 * Needs you (0168): at most one item per job, before it starts — "Supplier
 * quote not paid yet" when a requested quote hasn't been paid. Nothing
 * during the job, nothing per delivery.
 */
export function unpaidQuoteNeedsYouItems(
  orders: Pick<MaterialOrder, "project_id" | "payment_status" | "created_at">[],
  projectsById: Map<string, { name: string; status: string; scheduled_start_date: string | null; actual_start_date?: string | null }>,
  today: string,
): { key: string; tone: "red" | "grey"; title: string; subtitle: string; action: string; href: string; sortValue: number; category: "jobs" }[] {
  const out: ReturnType<typeof unpaidQuoteNeedsYouItems> = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (isPaid(o) || seen.has(o.project_id)) continue;
    const p = projectsById.get(o.project_id);
    if (!p || p.status === "in_progress" || p.status === "complete" || p.status === "lost" || p.actual_start_date) continue;
    seen.add(o.project_id);
    const days = p.scheduled_start_date
      ? Math.round((new Date(`${p.scheduled_start_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
      : null;
    out.push({
      key: `purchase-quote-${o.project_id}`,
      tone: days != null && days <= 7 ? "red" : "grey",
      title: `Supplier quote not paid yet for ${p.name}`,
      subtitle: days != null ? (days >= 0 ? `Job starts in ${days} day${days === 1 ? "" : "s"}` : "Job start date has passed") : "No start date yet",
      action: "Open materials",
      href: `/projects/${o.project_id}?tab=materials`,
      sortValue: days != null ? Math.max(1, 30 - days) : 1,
      category: "jobs",
    });
  }
  return out;
}
