import { Button } from "@/components/ui/button";
import { useEstimatingContext } from "@/hooks/use-estimating-context";
import { averageMetric, findSimilarJobs, similarSampleText } from "@/lib/similarJobs";
import { sectionLaborHours, type LaborBlock } from "@/lib/costPlanMath";
import { BUILD_TYPES } from "@/lib/buildTypes";
import { roundHalf } from "@/lib/estimatingInsights";
import type { LaborDraft } from "@/components/materials/SectionLaborBlock";
import { SimilarJobsHint } from "./SimilarJobsHint";

const labelOf = (bt: string) => BUILD_TYPES.find((b) => b.id === bt)?.label ?? "job";
const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });


/**
 * Under a Cost plan labor block: how similar completed jobs' labor went
 * against their plans, and any labor adjustment the contractor applied from
 * Estimating insights (one tap to use it on this block — never automatic).
 */
export function LaborInsight({
  projectId,
  section,
  onEditLabor,
}: {
  projectId: string;
  section: LaborBlock & LaborDraft & { feature_id: string | null; smart_section_build_type: string | null; job_category_id: string | null; is_general: boolean };
  onEditLabor: (patch: Partial<LaborDraft>) => void;
}) {
  const ec = useEstimatingContext(projectId);
  if (section.is_general || ec.project?.status === "complete") return null;
  const bt = section.smart_section_build_type ?? ec.buildTypeOfCategory(section.job_category_id);
  if (!bt) return null;
  const { size, unit } = ec.sizeOf(section.feature_id, bt);
  const res = findSimilarJobs(ec.closeouts, { build_type: bt, size, size_unit: unit, context: ec.context, excludeProjectId: projectId });
  const ratio = averageMetric(res.matches, (f) => f.units.labor_ratio);
  const hpu = averageMetric(res.matches, (f) => f.units.labor_hours_per_unit);
  const planned = sectionLaborHours(section);
  const adjustments = ec.activeAdjustments(bt, "labor_hours");

  const applyFactor = (factor: number) => {
    if (section.labor_mode === "crew") onEditLabor({ labor_days: roundHalf(Number(section.labor_days || 0) * factor) });
    else if (section.labor_mode === "hours") onEditLabor({ labor_man_hours: Math.round(Number(section.labor_man_hours || 0) * factor * 10) / 10 });
    else if (section.labor_mode === "lump_sum") onEditLabor({ labor_lump_sum: Math.round(Number(section.labor_lump_sum || 0) * factor) });
  };

  const lines: string[] = [];
  if (ratio.n > 0 && ratio.avg != null) {
    lines.push(
      ratio.isAverage
        ? `${similarSampleText(res, ratio.n, labelOf(bt))} took ${n2(ratio.avg)}× their planned labor.`
        : `${similarSampleText(res, ratio.n, labelOf(bt))}: labor took ${n2(ratio.avg)}× plan — reference only.`,
    );
  }
  if (hpu.n > 0 && hpu.avg != null && unit) {
    const mine = size && planned > 0 ? ` vs ${n2(planned / size)} in this plan` : "";
    lines.push(`${hpu.isAverage ? "Averaged" : "Took"} ${n2(hpu.avg)} man-hours per ${unit}${mine}.`);
  }

  return (
    <div className="mt-2 space-y-2">
      {lines.length > 0 && (
        <SimilarJobsHint
          hintKey={`labor:${projectId}:${section.feature_id ?? section.job_category_id}`}
          text={lines.join(" ")}
          matches={res.matches.filter((m) => m.feature.units.labor_ratio != null || m.feature.units.labor_hours_per_unit != null)}
          widened={res.widened}
          metric={(m) =>
            [
              m.feature.units.labor_ratio != null ? `${n2(m.feature.units.labor_ratio)}× plan` : null,
              m.feature.units.labor_hours_per_unit != null ? `${n2(m.feature.units.labor_hours_per_unit)} h/${m.feature.size_unit}` : null,
            ]
              .filter(Boolean)
              .join(", ")
          }
        />
      )}
      {section.labor_mode &&
        adjustments.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs">
            <span className="text-foreground">
              Your adjustment: <span className="font-semibold">{a.label}</span> <span className="text-muted-foreground">(from Estimating insights)</span>
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyFactor(Number(a.factor))}>
              Apply ×{n2(Number(a.factor))} to this block
            </Button>
          </div>
        ))}
    </div>
  );
}
