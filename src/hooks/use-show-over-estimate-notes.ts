import { useQuery } from "@tanstack/react-query";
import { getMaterialTrackingSettings, MATERIAL_TRACKING_DEFAULTS } from "@/lib/api";

/** Settings › Material categories › "Show over-estimate notes on lines" (0167). */
export function useShowOverEstimateNotes(): boolean {
  const { data } = useQuery({ queryKey: ["material-tracking-settings"], queryFn: getMaterialTrackingSettings });
  return (data ?? MATERIAL_TRACKING_DEFAULTS).show_over_estimate_notes;
}
