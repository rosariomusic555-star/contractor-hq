import { ClipboardList, PiggyBank, Scale, Truck } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import type { Expense, MaterialOrder, MaterialsSection, MaterialsSheet, Project } from "@/lib/api";
import { costPlanTotal, costTypeOf } from "@/lib/costPlanMath";
import { countsTowardTotals } from "@/lib/features";
import { effectiveEstimate, orderedQuantity, purchasedLines, effectiveDeliveryStatus } from "@/lib/materialTracking";
import { compactMoney, count, inNextDays, inWeek, pct } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

/** Chips, plus two filters only the tiles set (`hidden`). */
export type CostPlanChip = "over" | "unordered14" | "to_order" | "deliveries_week";

const EPS = 1e-6;
const isActive = (p: Pick<Project, "status">) => p.status === "scheduled" || p.status === "in_progress";

type Sheet = Pick<MaterialsSheet, "id" | "project_id">;
type Section = Pick<MaterialsSection, "sheet_id" | "materials_items"> & Parameters<typeof countsTowardTotals>[0];

/**
 * The Cost Plans banner, over active jobs (Scheduled / In progress).
 * "Spent" is expenses logged against the job — the all-jobs list has no
 * labor or delivered-material actuals (those live in each job's Job costs).
 * "Still to order" uses the same rule as the pre-construction check
 * (materialSignals): a planned line not fully covered by paid purchases.
 */
export function costPlanBannerStats(
  sheets: Sheet[],
  sections: Section[],
  projects: Pick<Project, "id" | "status" | "scheduled_start_date">[],
  expenses: Pick<Expense, "project_id" | "amount">[],
  orders: Pick<MaterialOrder, "project_id" | "status" | "payment_status" | "expected_delivery_date" | "fulfillment" | "material_order_items">[],
  now: Date,
) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const sectionsBySheet = new Map<string, Section[]>();
  for (const s of sections) sectionsBySheet.set(s.sheet_id, [...(sectionsBySheet.get(s.sheet_id) ?? []), s]);
  const purchased = purchasedLines(orders);

  const plannedByProject = new Map<string, number>();
  const toOrderBySheet = new Map<string, number>();
  for (const sh of sheets) {
    const secs = sectionsBySheet.get(sh.id) ?? [];
    plannedByProject.set(sh.project_id, (plannedByProject.get(sh.project_id) ?? 0) + costPlanTotal(secs as never));
    const lines = secs
      .filter(countsTowardTotals)
      .flatMap((s) => s.materials_items)
      .filter((l) => costTypeOf(l) === "material" && effectiveEstimate(l).quantity > EPS);
    toOrderBySheet.set(sh.id, lines.filter((l) => orderedQuantity(l, purchased) + EPS < effectiveEstimate(l).quantity).length);
  }
  const spentByProject = new Map<string, number>();
  for (const e of expenses) spentByProject.set(e.project_id, (spentByProject.get(e.project_id) ?? 0) + Number(e.amount));

  const activeIds = [...plannedByProject.keys()].filter((id) => projectById.get(id) && isActive(projectById.get(id)!));
  const planned = activeIds.reduce((s, id) => s + (plannedByProject.get(id) ?? 0), 0);
  const spent = activeIds.reduce((s, id) => s + (spentByProject.get(id) ?? 0), 0);
  const overIds = new Set(activeIds.filter((id) => (spentByProject.get(id) ?? 0) > (plannedByProject.get(id) ?? 0) + 0.005));

  const deliveriesWeek = orders.filter(
    (o) => (o.fulfillment ?? "delivery") === "delivery" && o.status !== "delivered" && inWeek(o.expected_delivery_date, now) &&
      o.material_order_items.some((i) => effectiveDeliveryStatus(i, o.status) !== "delivered"),
  );
  const deliveryProjects = new Set(deliveriesWeek.map((o) => o.project_id));

  const match = (sh: Sheet, chip: CostPlanChip): boolean => {
    const p = projectById.get(sh.project_id);
    if (!p || !isActive(p)) return false;
    switch (chip) {
      case "over":
        return overIds.has(sh.project_id);
      case "unordered14":
        return p.status === "scheduled" && inNextDays(p.scheduled_start_date, 14, now) && (toOrderBySheet.get(sh.id) ?? 0) > 0;
      case "to_order":
        return (toOrderBySheet.get(sh.id) ?? 0) > 0;
      case "deliveries_week":
        return deliveryProjects.has(sh.project_id);
    }
  };
  const activeSheets = sheets.filter((sh) => activeIds.includes(sh.project_id));
  return {
    total: sheets.length,
    activeJobs: activeIds.length,
    planned,
    spent,
    overCount: overIds.size,
    toOrderLines: activeSheets.reduce((n, sh) => n + (toOrderBySheet.get(sh.id) ?? 0), 0),
    toOrderJobs: new Set(activeSheets.filter((sh) => (toOrderBySheet.get(sh.id) ?? 0) > 0).map((sh) => sh.project_id)).size,
    deliveriesWeek: deliveriesWeek.length,
    match,
    chips: {
      over: sheets.filter((sh) => match(sh, "over")).length,
      unordered14: sheets.filter((sh) => match(sh, "unordered14")).length,
      to_order: sheets.filter((sh) => match(sh, "to_order")).length,
      deliveries_week: sheets.filter((sh) => match(sh, "deliveries_week")).length,
    },
  };
}

export function useCostPlansBanner({
  stats: st,
  loading,
  chip,
  setChip,
}: {
  stats: ReturnType<typeof costPlanBannerStats>;
  loading: boolean;
  chip: CostPlanChip | null;
  setChip: (c: CostPlanChip | null) => void;
}): { rich: RichBanner; matches: (s: Sheet) => boolean } {
  let insight: string;
  if (st.total === 0) insight = "No cost plans yet — they start from a project";
  else if (st.activeJobs === 0) insight = "No active jobs right now";
  else
    insight = [
      `${compactMoney(st.planned)} planned on ${count(st.activeJobs, "active job")}`,
      st.overCount ? `${st.overCount} over budget` : st.toOrderLines ? `${count(st.toOrderLines, "line")} still to order` : "everything ordered",
    ].join(" · ");

  const pick = (c: CostPlanChip) => setChip(chip === c ? null : c);
  const ratio = st.planned > 0 ? st.spent / st.planned : null;
  const rich: RichBanner = {
    insight,
    loading,
    listId: "cost-plans-list",
    activeChip: chip,
    onChip: (k) => setChip(k as CostPlanChip | null),
    chips: [
      { key: "over", label: "over budget", count: st.chips.over },
      { key: "unordered14", label: "not ordered, starting in 14 days", count: st.chips.unordered14 },
      { key: "to_order", label: "with materials to order", count: st.chips.to_order, hidden: true },
      { key: "deliveries_week", label: "with deliveries this week", count: st.chips.deliveries_week, hidden: true },
    ],
    tiles: [
      {
        key: "planned",
        label: "Planned cost",
        icon: ClipboardList,
        value: st.activeJobs ? formatCurrency(st.planned) : "—",
        sub: st.activeJobs ? `${count(st.activeJobs, "active job")}` : st.total ? "No active jobs right now" : "Plans show here once a job is booked",
        onClick: () => setChip(null),
        active: !chip,
      },
      {
        key: "spent",
        label: "Spent vs planned",
        icon: Scale,
        value: st.activeJobs ? formatCurrency(st.spent) : "—",
        alert: ratio != null && ratio > 1,
        sub: ratio == null ? (st.activeJobs ? "Nothing planned yet" : "Shows on active jobs") : `${pct(ratio)} of plan · expenses logged`,
        subTone: ratio != null && ratio > 1 ? "negative" : "muted",
        visual: ratio == null ? undefined : { kind: "progress", value: Math.min(ratio, 1), danger: ratio > 1 },
        onClick: st.overCount ? () => pick("over") : undefined,
        active: chip === "over",
      },
      {
        key: "order",
        label: "Materials still to order",
        icon: PiggyBank,
        value: st.activeJobs ? String(st.toOrderLines) : "—",
        sub: st.toOrderLines ? `${count(st.toOrderLines, "line")} on ${count(st.toOrderJobs, "job")}` : st.activeJobs ? "Everything's ordered" : "Shows on active jobs",
        subTone: st.activeJobs && !st.toOrderLines ? "positive" : "muted",
        onClick: st.toOrderLines ? () => pick("to_order") : undefined,
        active: chip === "to_order",
      },
      {
        key: "deliveries",
        label: "Deliveries this week",
        icon: Truck,
        value: st.total ? String(st.deliveriesWeek) : "—",
        sub: st.deliveriesWeek ? count(st.deliveriesWeek, "order") + " expected" : "None expected this week",
        onClick: st.deliveriesWeek ? () => pick("deliveries_week") : undefined,
        active: chip === "deliveries_week",
      },
    ],
  };
  return { rich, matches: (s) => !chip || st.match(s, chip) };
}
