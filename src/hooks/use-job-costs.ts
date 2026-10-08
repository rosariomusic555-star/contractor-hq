import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getOverheadSettings,
  getProject,
  getVarianceThresholds,
  listCategories,
  listChangeOrders,
  listExpenseCategories,
  listExpenses,
  listLaborEntries,
  listMaterialOrders,
  listMaterials,
  listProjectFeatures,
  listQuotes,
  listScheduleDelays,
  listUsageLogsForItems,
  pickHeadlineQuote,
} from "@/lib/api";
import { countsTowardTotals } from "@/lib/features";
import { burdenPerHour } from "@/lib/overhead";
import { needsReconciliation, type DeliveryLineWithOrderStatus, purchasedLines } from "@/lib/materialTracking";
import { delayDays } from "@/lib/scheduleShift";
import { jobCostReport } from "@/lib/jobCosts";
import { isoDate } from "@/lib/weatherRisk";

/**
 * Everything the job costs view needs — the same query keys the project
 * page, Cost plan and Planned vs actual use (served from their cache), and
 * the one report built from it (jobCosts.ts). Same rules as
 * usePlannedActual: delivered material counts once Complete + reconciled;
 * overhead rate = the job's, else its quote's, else current settings.
 */
export function useJobCosts(projectId: string) {
  const { data: project } = useQuery({ queryKey: ["projects", projectId], queryFn: () => getProject(projectId) });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes", { project: projectId }], queryFn: () => listQuotes(projectId) });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders", { project: projectId }], queryFn: () => listChangeOrders(projectId) });
  const { data: sections = [] } = useQuery({ queryKey: ["materials", { project: projectId }], queryFn: () => listMaterials(projectId) });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", { project: projectId }], queryFn: () => listExpenses(projectId) });
  const { data: expenseCategories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: listExpenseCategories });
  const { data: laborEntries = [] } = useQuery({ queryKey: ["labor-entries", { project: projectId }], queryFn: () => listLaborEntries(projectId) });
  const { data: materialOrders = [] } = useQuery({ queryKey: ["material-orders", { project: projectId }], queryFn: () => listMaterialOrders(projectId) });
  const { data: features = [] } = useQuery({ queryKey: ["project-features", projectId], queryFn: () => listProjectFeatures(projectId) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: overheadSettings } = useQuery({ queryKey: ["overhead-settings"], queryFn: getOverheadSettings });
  const { data: thresholds } = useQuery({ queryKey: ["variance-thresholds"], queryFn: getVarianceThresholds });
  const { data: scheduleDelays = [] } = useQuery({ queryKey: ["schedule-delays", projectId], queryFn: () => listScheduleDelays(projectId) });

  const materialLineIds = useMemo(
    () =>
      sections
        .filter(countsTowardTotals)
        .flatMap((s) => s.materials_items)
        .filter((i) => (i.cost_type ?? "material") === "material")
        .map((l) => l.id),
    [sections],
  );
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", materialLineIds],
    queryFn: () => listUsageLogsForItems(materialLineIds),
    enabled: materialLineIds.length > 0,
  });

  return useMemo(() => {
    if (!project) return null;
    const materialLines = sections.filter(countsTowardTotals).flatMap((s) => s.materials_items).filter((i) => (i.cost_type ?? "material") === "material");
    const deliveries: DeliveryLineWithOrderStatus[] = purchasedLines(materialOrders);
    const reconciled = materialLines.length > 0 && needsReconciliation(materialLines, deliveries, usageLogs).length === 0;
    // 0168: final once Complete — material cost is the purchases' expenses.
    const materialsCounted = project.status === "complete";
    const headline = pickHeadlineQuote(quotes);
    const overheadRate =
      project.overhead_rate != null
        ? Number(project.overhead_rate)
        : headline?.overhead_rate != null
          ? Number(headline.overhead_rate)
          : burdenPerHour(overheadSettings);
    const report = jobCostReport({
      project,
      features,
      categories,
      expenseCategories,
      sections,
      quotes,
      changeOrders,
      expenses,
      laborEntries,
      materialOrders,
      usageLogs,
      materialsCounted,
      overheadRate,
      weatherDays: delayDays(scheduleDelays, projectId).weather,
      thresholds: thresholds ? { amberPct: thresholds.variance_amber_pct, redPct: thresholds.variance_red_pct } : undefined,
      today: isoDate(new Date()),
    });
    return { project, report, features, categories, expenseCategories, expenses, sections, laborEntries, materialOrders };
  }, [project, quotes, changeOrders, sections, expenses, expenseCategories, laborEntries, materialOrders, features, categories, overheadSettings, thresholds, scheduleDelays, usageLogs, projectId]);
}
