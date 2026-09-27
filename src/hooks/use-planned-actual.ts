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
  listFeatureMeasurements,
  listLaborEntries,
  listMaterialOrders,
  listMaterials,
  listProductCatalog,
  listProjectCloseouts,
  listProjectFeatures,
  listQuotes,
  listUsageLogsForItems,
  pickHeadlineQuote,
  type MaterialsItem,
} from "@/lib/api";
import { countsTowardTotals } from "@/lib/features";
import { burdenPerHour } from "@/lib/overhead";
import { needsReconciliation, type DeliveryLineWithOrderStatus } from "@/lib/materialTracking";
import { plannedActualReport } from "@/lib/plannedActual";
import { closeoutFeatures, type CloseoutSnapshot } from "@/lib/closeout";
import { crewSizeFromLabor, projectContext, type JobContext } from "@/lib/jobContext";

/**
 * Everything the planned-vs-actual card and the closeout need, fetched
 * with the same query keys the project page / Cost plan already use (so
 * it's served from their cache), and the one report built from it.
 */
export function usePlannedActual(projectId: string) {
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
  const { data: measurements = [] } = useQuery({
    queryKey: ["project-feature-measurements", projectId],
    queryFn: () => listFeatureMeasurements(projectId),
  });
  const { data: catalog = [] } = useQuery({ queryKey: ["product-catalog"], queryFn: listProductCatalog });
  const { data: closeouts = [] } = useQuery({ queryKey: ["closeouts", projectId], queryFn: () => listProjectCloseouts(projectId) });

  const materialLines: MaterialsItem[] = useMemo(
    () => sections.filter(countsTowardTotals).flatMap((s) => s.materials_items).filter((i) => (i.cost_type ?? "material") === "material"),
    [sections],
  );
  const lineIds = materialLines.map((l) => l.id);
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", lineIds],
    queryFn: () => listUsageLogsForItems(lineIds),
    enabled: lineIds.length > 0,
  });

  return useMemo(() => {
    if (!project) return null;
    const deliveries: DeliveryLineWithOrderStatus[] = materialOrders.flatMap((o) =>
      o.material_order_items.map((item) => ({ item, orderStatus: o.status })),
    );
    const unreconciled = needsReconciliation(materialLines, deliveries, usageLogs).length;
    const reconciled = materialLines.length > 0 && unreconciled === 0;
    const materialsCounted = project.status === "complete" && reconciled;
    const headline = pickHeadlineQuote(quotes);
    const overheadRate =
      project.overhead_rate != null
        ? Number(project.overhead_rate)
        : headline?.overhead_rate != null
          ? Number(headline.overhead_rate)
          : burdenPerHour(overheadSettings);
    const t = thresholds ? { amberPct: thresholds.variance_amber_pct, redPct: thresholds.variance_red_pct } : undefined;

    const build = (counted: boolean) =>
      plannedActualReport({
        features,
        categories,
        sections,
        quotes,
        changeOrders,
        expenses,
        expenseCategories,
        laborEntries,
        deliveries,
        usageLogs,
        materialsCounted: counted,
        overheadRate,
        thresholds: t,
      });
    const report = build(materialsCounted);
    const crew = crewSizeFromLabor(laborEntries);
    const context: JobContext = { ...projectContext(project), crew_size: crew };

    /** The closeout snapshot — delivered material cost counts when the job
     * is Complete (the dialog warns when lines aren't reconciled). */
    const buildCloseout = () => {
      const closeReport = build(true);
      const snapshot: CloseoutSnapshot = { version: 1, report: closeReport, materials_reconciled: reconciled, unreconciled_lines: unreconciled };
      return {
        snapshot,
        context,
        features: closeoutFeatures({ report: closeReport, categories, sections, measurements, deliveries, usageLogs, catalog }),
      };
    };

    return {
      project,
      report,
      context,
      crew,
      thresholds: t,
      unreconciled,
      reconciled,
      materialsCounted,
      closeouts,
      current: closeouts.find((c) => !c.superseded_at) ?? null,
      buildCloseout,
      laborEntries,
    };
  }, [
    project,
    quotes,
    changeOrders,
    sections,
    expenses,
    expenseCategories,
    laborEntries,
    materialOrders,
    features,
    categories,
    overheadSettings,
    thresholds,
    measurements,
    catalog,
    closeouts,
    usageLogs,
    materialLines,
  ]);
}
