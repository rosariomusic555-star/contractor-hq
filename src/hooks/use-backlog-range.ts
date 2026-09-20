import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBacklogSettings, saveBacklogSettings, type BacklogRangeMonths, type BacklogSettings } from "@/lib/api";

/**
 * The Seasonal Backlog range toggle (6 vs 12 months), shared by the
 * Dashboard card and the full /backlog page so they can never show a
 * different range than what's actually saved. Backed by
 * backlog_settings.default_range_months (0057) — one row per user.
 *
 * `range` uses an optimistic local override so clicking the toggle feels
 * instant instead of waiting on the save round-trip.
 */
export function useBacklogRange(): {
  range: BacklogRangeMonths;
  setRange: (months: BacklogRangeMonths) => void;
  settings: BacklogSettings | undefined;
} {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["backlog-settings"], queryFn: getBacklogSettings });
  const [localRange, setLocalRange] = useState<BacklogRangeMonths | null>(null);
  const range = localRange ?? settings?.default_range_months ?? 6;

  const rangeMut = useMutation({
    mutationFn: (months: BacklogRangeMonths) => saveBacklogSettings({ default_range_months: months }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backlog-settings"] }),
  });
  const setRange = (months: BacklogRangeMonths) => {
    setLocalRange(months);
    rangeMut.mutate(months);
  };

  return { range, setRange, settings };
}
