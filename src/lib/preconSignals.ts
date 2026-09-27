/* =============================================================================
 * Pre-construction checklist (0124) — gathers what the app already knows
 * about one job (quotes, selections, payments, Cost plan tracking, orders,
 * crew, start confirmation) and turns it into PreconSignals for
 * src/lib/precon.ts. One fetch per job, shared by the project page,
 * Bookings, Needs you and the daily reminder.
 * ========================================================================== */

import {
  getPreconSettings,
  getProject,
  listChangeOrders,
  listCrews,
  listMaterialOrders,
  listMaterials,
  listPayments,
  listProjectPrecon,
  listProjectSelections,
  listQuotes,
  listScheduleUpdates,
  projectContractValue,
  type MaterialOrder,
  type MaterialsItem,
  type Project,
  type Quote,
} from "@/lib/api";
import { countsTowardTotals } from "@/lib/features";
import {
  deliveredQuantity,
  effectiveDeliveryStatus,
  effectiveEstimate,
  executionTrackedLines,
  orderedQuantity,
  type DeliveryLineWithOrderStatus,
} from "@/lib/materialTracking";
import { materialLineLabel } from "@/lib/materialsMath";
import { preconPhase, readiness, type PreconItemRow, type PreconSettingsLike, type PreconSignals, type Readiness } from "@/lib/precon";

export interface PreconBundle {
  project: Project;
  items: PreconItemRow[];
  signals: PreconSignals;
  settings: PreconSettingsLike;
  readiness: Readiness;
  headlineQuoteId: string | null;
}

const EPS = 1e-6;

export function materialSignals(
  trackedLines: MaterialsItem[],
  deliveries: DeliveryLineWithOrderStatus[],
  orders: Pick<MaterialOrder, "id" | "expected_delivery_date" | "status">[],
  start: string | null,
): Pick<PreconSignals, "materials" | "deliveries"> {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const lines = executionTrackedLines(trackedLines).filter((l) => effectiveEstimate(l).quantity > EPS);
  const short: string[] = [];
  const unscheduled: string[] = [];
  for (const line of lines) {
    const est = effectiveEstimate(line).quantity;
    if (orderedQuantity(line, deliveries) + EPS < est) short.push(materialLineLabel(line));
    if (deliveredQuantity(line, deliveries) + EPS >= est) continue;
    const coming = deliveries.some((d) => {
      if (d.item.materials_item_id !== line.id || effectiveDeliveryStatus(d.item, d.orderStatus) === "delivered") return false;
      const exp = orderById.get(d.item.material_order_id)?.expected_delivery_date;
      return !!exp && (!start || exp <= start);
    });
    if (!coming) unscheduled.push(materialLineLabel(line));
  }
  return { materials: { tracked: lines.length, short }, deliveries: { unscheduled } };
}

export function headlineApprovedQuote(quotes: Quote[]): Quote | undefined {
  return quotes
    .filter((q) => q.status === "approved" && q.kind !== "addon")
    .sort((a, b) => (b.signed_at ?? b.updated_at).localeCompare(a.signed_at ?? a.updated_at))[0];
}

/** Everything the checklist needs for one job. */
export async function fetchPreconBundle(projectId: string): Promise<PreconBundle> {
  const project = await getProject(projectId);
  const phase = preconPhase(project);
  const [items, quotes, changeOrders, payments, selections, materials, orders, updates, crews, settings] = await Promise.all([
    listProjectPrecon(projectId, phase !== "hidden"),
    listQuotes(projectId),
    listChangeOrders(projectId),
    listPayments(projectId),
    listProjectSelections(projectId),
    listMaterials(projectId),
    listMaterialOrders(projectId),
    listScheduleUpdates({ projectId }),
    listCrews(),
    getPreconSettings(),
  ]);

  const headline = headlineApprovedQuote(quotes);
  const groups = (headline?.quote_sections ?? []).flatMap((s) => s.quote_selection_groups ?? []);
  const openRequests = (selections.requests ?? []).filter((r) => r.status === "open").length;
  const contract = projectContractValue(quotes, changeOrders);
  const paid = payments.filter((p) => p.status !== "void").reduce((s, p) => s + Number(p.amount), 0);

  const trackedLines = materials
    .filter(countsTowardTotals)
    .flatMap((s) => s.materials_items)
    .filter((i) => (i.cost_type ?? "material") === "material");
  const deliveries: DeliveryLineWithOrderStatus[] = orders.flatMap((o) => o.material_order_items.map((item) => ({ item, orderStatus: o.status })));

  const start = project.scheduled_start_date;
  const startConfirmed = updates.some(
    (u) => u.heads_up_status === "sent" && u.to_start === start && (u.source === "confirm" || (u.source === "manual" && !u.from_start)),
  );

  const signals: PreconSignals = {
    quoteApproved: !!headline,
    hasSelections: groups.length > 0,
    selectionsOpen: groups.filter((g) => !g.approved_at).length + openRequests,
    deposit: { due: headline ? Math.round(contract * (Number(headline.deposit_percentage) || 0)) / 100 : 0, paid },
    ...materialSignals(trackedLines, deliveries, orders, start),
    crewName: crews.find((c) => c.id === project.crew_id)?.name ?? null,
    startConfirmed,
  };
  const span = { start, end: project.scheduled_end_date };
  return {
    project,
    items: items as PreconItemRow[],
    signals,
    settings,
    readiness: readiness(items as PreconItemRow[], signals, span, settings),
    headlineQuoteId: headline?.id ?? null,
  };
}
