import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { COST_BUCKETS, COST_TYPE_LABEL, type CostBucket } from "@/lib/costPlanMath";
import { featureName, type ProjectFeature } from "@/lib/features";
import type { Category } from "@/lib/api";

const GENERAL = "__general__";
const AUTO = "__auto__";

/** Which feature a cost is for — General (project-wide) or one active feature. */
export function FeatureSelect({
  value,
  onChange,
  features,
  categories,
  className,
  ariaLabel = "Feature",
}: {
  value: string | null | undefined;
  onChange: (featureId: string | null) => void;
  /** Active features only — spend can't go to a proposed or removed one. */
  features: ProjectFeature[];
  categories: Pick<Category, "id" | "name">[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value ?? GENERAL} onValueChange={(v) => onChange(v === GENERAL ? null : v)}>
      <SelectTrigger aria-label={ariaLabel} className={cn("h-10", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={GENERAL}>General</SelectItem>
        {features.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {featureName(f, categories)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A cost's type — "From category" (null) follows the expense category's type. */
export function CostTypeSelect({
  value,
  onChange,
  categoryType,
  className,
  ariaLabel = "Cost type",
}: {
  value: CostBucket | null | undefined;
  onChange: (type: CostBucket | null) => void;
  /** What "From category" currently means, shown in its label. */
  categoryType?: CostBucket | null;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value ?? AUTO} onValueChange={(v) => onChange(v === AUTO ? null : (v as CostBucket))}>
      <SelectTrigger aria-label={ariaLabel} className={cn("h-10", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>{categoryType ? `${COST_TYPE_LABEL[categoryType]} (from category)` : "From category"}</SelectItem>
        {COST_BUCKETS.map((t) => (
          <SelectItem key={t} value={t}>
            {COST_TYPE_LABEL[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
