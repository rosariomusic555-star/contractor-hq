import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CategoryMultiSelect } from "@/components/common/CategoryMultiSelect";
import { FeatureTypeChips } from "@/components/common/FeatureTypeChips";
import { listCategories, listFeatureMeasurements, listProjectMeasurements } from "@/lib/api";
import { groupHasData, measurementGroupsFor } from "@/lib/measurements";

/**
 * The Project types picker for a page that also shows the Measurements card
 * (opportunity + project pages). Selecting a type adds its card; removing a
 * type whose card has saved measurements asks first. Confirming only hides
 * the card — the measurements are kept and come back if the type is
 * re-added.
 */
export function MeasuredCategoryMultiSelect({
  projectId,
  value,
  onChange,
  placeholder,
  className,
  variant = "field",
}: {
  /** The project holding the measurements (null before an opportunity has one). */
  projectId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  /** "compact": inline chips with a small label + Edit (project header,
   * opportunity Details). "field": the bordered multi-select. */
  variant?: "field" | "compact";
}) {
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  // Same query keys as ProjectMeasurementsCard — shared cache.
  const { data: instances = [] } = useQuery({
    queryKey: ["project-feature-measurements", projectId],
    queryFn: () => listFeatureMeasurements(projectId!),
    enabled: !!projectId,
  });
  const { data: customRows = [] } = useQuery({
    queryKey: ["project-measurements", projectId],
    queryFn: () => listProjectMeasurements(projectId!),
    enabled: !!projectId,
  });

  const [pending, setPending] = useState<{ next: string[]; titles: string[] } | null>(null);

  const request = (next: string[]) => {
    const removed = value.filter((id) => !next.includes(id));
    if (removed.length === 0) return onChange(next);
    // A card only goes away if no remaining type maps to the same group
    // ("Patio" and "Paver Patio" share one card).
    const remaining = new Set(measurementGroupsFor(next, categories).map((g) => g.key));
    const losing = measurementGroupsFor(removed, categories).filter(
      (g) => !remaining.has(g.key) && groupHasData(g, instances, customRows),
    );
    if (losing.length === 0) return onChange(next);
    setPending({ next, titles: losing.map((g) => g.title) });
  };

  const names = pending?.titles.join(" and ") ?? "";

  return (
    <>
      {variant === "compact" ? (
        <FeatureTypeChips value={value} onChange={request} className={className} />
      ) : (
        <CategoryMultiSelect value={value} onChange={request} placeholder={placeholder} className={className} />
      )}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {names}?</AlertDialogTitle>
            <AlertDialogDescription>
              {names} {pending && pending.titles.length > 1 ? "have" : "has"} measurements. Removing the type hides{" "}
              {pending && pending.titles.length > 1 ? "those cards" : "its card"} — the measurements are kept and come back if
              you add the type again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onChange(pending.next);
                setPending(null);
              }}
            >
              Remove type
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
