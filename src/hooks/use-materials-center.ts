import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getProject,
  listMaterialOrders,
  listMaterials,
  listPriceBookItems,
  listProductCatalog,
  listProjectFeatures,
  listCategories,
  listScheduleDelays,
  listSuppliers,
  listUsageLogsForItems,
} from "@/lib/api";
import { countsTowardTotals } from "@/lib/features";
import { isProjectActive } from "@/lib/materialTracking";
import { useProjectForecast } from "@/lib/forecast";
import { assessDay, dayWeather, isoDate } from "@/lib/weatherRisk";
import { materialsCenterReport } from "@/lib/materialsCenter";

/**
 * Everything the materials command center needs — the same query keys the
 * project page, Cost plan and Material orders use (served from their
 * cache) — and the one report built from it (materialsCenter.ts). Rain-
 * flagged days come from the job's forecast (about 9 days out) with the
 * contractor's own weather thresholds.
 */
export function useMaterialsCenter(projectId: string) {
  const { data: project } = useQuery({ queryKey: ["projects", projectId], queryFn: () => getProject(projectId) });
  const { data: sections = [] } = useQuery({ queryKey: ["materials", { project: projectId }], queryFn: () => listMaterials(projectId) });
  const { data: orders = [] } = useQuery({ queryKey: ["material-orders", { project: projectId }], queryFn: () => listMaterialOrders(projectId) });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });
  const { data: catalog = [] } = useQuery({ queryKey: ["product-catalog"], queryFn: listProductCatalog });
  const { data: priceBook = [] } = useQuery({ queryKey: ["price-book"], queryFn: listPriceBookItems });
  const { data: delays = [] } = useQuery({ queryKey: ["schedule-delays", projectId], queryFn: () => listScheduleDelays(projectId) });
  const { data: features = [] } = useQuery({ queryKey: ["project-features", projectId], queryFn: () => listProjectFeatures(projectId) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: forecastBatch } = useProjectForecast(projectId, !!project?.scheduled_start_date);

  const lineIds = useMemo(
    () => sections.filter(countsTowardTotals).flatMap((s) => s.materials_items).filter((i) => (i.cost_type ?? "material") === "material").map((l) => l.id),
    [sections],
  );
  const { data: usageLogs = [] } = useQuery({
    queryKey: ["materials-usage-logs", lineIds],
    queryFn: () => listUsageLogsForItems(lineIds),
    enabled: lineIds.length > 0,
  });

  return useMemo(() => {
    if (!project) return null;
    const target = forecastBatch?.projects[projectId];
    const rainDates = new Set<string>();
    if (target?.status === "ok" && target.forecast && forecastBatch) {
      for (const day of target.forecast.days) {
        if (assessDay(dayWeather(day, forecastBatch.settings), forecastBatch.settings).level !== "none") rainDates.add(day.date);
      }
    }
    const report = materialsCenterReport({
      project,
      sections,
      orders,
      usageLogs,
      suppliers,
      catalog,
      delays,
      rainDates,
      today: isoDate(new Date()),
    });
    return { project, report, sections, orders, suppliers, catalog, priceBook, features, categories, rainDates, active: isProjectActive(project), forecastOk: target?.status === "ok" };
  }, [project, sections, orders, usageLogs, suppliers, catalog, priceBook, delays, forecastBatch, features, categories, projectId]);
}
