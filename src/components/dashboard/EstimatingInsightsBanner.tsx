import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lightbulb } from "lucide-react";
import { listCloseouts, listRecommendationStates } from "@/lib/api";
import { computeRecommendations, openRecommendations } from "@/lib/estimatingInsights";

/** "2 estimating insights from your completed jobs →" — only when there
 * are open suggestions (Feature 5). */
export function EstimatingInsightsBanner() {
  const { data: closeouts = [] } = useQuery({ queryKey: ["all-closeouts"], queryFn: listCloseouts, staleTime: 5 * 60_000 });
  const { data: states = [] } = useQuery({ queryKey: ["recommendation-states"], queryFn: listRecommendationStates, staleTime: 5 * 60_000 });
  const count = useMemo(() => openRecommendations(computeRecommendations(closeouts), states).length, [closeouts, states]);
  if (count === 0) return null;
  return (
    <Link
      to="/settings/estimating-insights"
      className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-2.5 text-sm transition-colors hover:bg-info/10"
    >
      <Lightbulb className="h-4 w-4 shrink-0 text-info" />
      <span className="min-w-0 flex-1 text-foreground">
        <span className="font-semibold">{count} estimating insight{count === 1 ? "" : "s"}</span>{" "}
        <span className="text-muted-foreground">from your completed jobs</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle" />
    </Link>
  );
}
