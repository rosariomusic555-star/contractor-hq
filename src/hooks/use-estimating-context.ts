import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProject, listCategories, listCloseouts, listEstimatingAdjustments, listFeatureMeasurements } from "@/lib/api";
import { buildTypeForCategoryName, type FeatureTotals } from "@/lib/measurements";
import { featureSize } from "@/lib/closeout";
import { conditionMatches } from "@/lib/estimatingInsights";
import { projectContext, type JobContext } from "@/lib/jobContext";

/**
 * What an estimating surface (calculator, labor block, Quick Quote) needs
 * to look up similar completed jobs and the contractor's own applied
 * adjustments: every closeout, the job's context, and helpers to turn a
 * Cost plan section into (build type, size).
 */
export function useEstimatingContext(projectId: string | null | undefined) {
  const { data: closeouts = [] } = useQuery({ queryKey: ["all-closeouts"], queryFn: listCloseouts, staleTime: 60_000 });
  const { data: adjustments = [] } = useQuery({ queryKey: ["estimating-adjustments"], queryFn: listEstimatingAdjustments, staleTime: 60_000 });
  const { data: project } = useQuery({ queryKey: ["projects", projectId], queryFn: () => getProject(projectId!), enabled: !!projectId });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: measurements = [] } = useQuery({
    queryKey: ["project-feature-measurements", projectId],
    queryFn: () => listFeatureMeasurements(projectId!),
    enabled: !!projectId,
  });

  return useMemo(() => {
    const context: JobContext = project ? projectContext(project) : {};
    const buildTypeOfCategory = (categoryId: string | null | undefined) => {
      const name = categories.find((c) => c.id === categoryId)?.name;
      return name ? (buildTypeForCategoryName(name)?.id ?? null) : null;
    };
    const sizeOf = (featureId: string | null | undefined, buildType: string | null) => {
      const inst = measurements.filter((m) => (featureId ? m.feature_id === featureId : true) && (!buildType || m.build_type === buildType));
      if (!inst.length) return { size: null, unit: null };
      const totals = inst.reduce<FeatureTotals>((acc, m) => {
        for (const [k, v] of Object.entries(m.totals ?? {})) (acc as Record<string, number>)[k] = ((acc as Record<string, number>)[k] ?? 0) + (Number(v) || 0);
        return acc;
      }, {});
      return featureSize(buildType, totals);
    };
    const activeAdjustments = (buildType: string | null, target: string) =>
      adjustments.filter((a) => a.active && a.build_type === buildType && a.target === target && conditionMatches(a.condition, context));
    return { closeouts, context, project, buildTypeOfCategory, sizeOf, activeAdjustments };
  }, [closeouts, adjustments, project, categories, measurements]);
}
