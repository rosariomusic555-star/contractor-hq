import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listFeatureMeasurements } from "@/lib/api";
import { prefillSources, type PrefillSource } from "@/lib/measurements";

/**
 * The project's site measurements for one build type, as prefill choices
 * for the Smart Section calculator and Quick Quote: a single instance, or
 * (when there are several) all of them summed — the sum is the default.
 * The caller maps the chosen totals onto its own questions with
 * smartSectionPrefill() / quickQuotePrefill() (src/lib/measurements.ts).
 *
 * `sourcesKey` changes only when the underlying measurements do, so a
 * caller can re-seed its answers when they finish loading without
 * clobbering edits on every render.
 */
export function useMeasurementPrefill(projectId: string | null | undefined, buildType: string, enabled: boolean) {
  const { data: instances = [] } = useQuery({
    queryKey: ["project-feature-measurements", projectId],
    queryFn: () => listFeatureMeasurements(projectId!),
    enabled: enabled && !!projectId,
  });
  const sources = useMemo(() => prefillSources(instances, buildType), [instances, buildType]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) setSelectedId(null);
  }, [enabled]);

  const selected: PrefillSource | null = sources.find((s) => s.id === selectedId) ?? sources[0] ?? null;
  const sourcesKey = sources.map((s) => `${s.id}:${JSON.stringify(s.totals)}`).join("|");

  return { sources, selected, select: setSelectedId, sourcesKey };
}
