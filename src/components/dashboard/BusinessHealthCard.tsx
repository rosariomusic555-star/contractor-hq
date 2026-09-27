import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { resolveRange } from "@/lib/financials";
import { useBusinessHealth } from "@/components/health/useBusinessHealth";

/** Dashboard one-liner (0132): "Booked through Nov 14 · $48k expected next 30 days" → Business health. */
export function BusinessHealthCard({ className }: { className?: string }) {
  const range = useMemo(() => resolveRange("ytd", undefined), []);
  const h = useBusinessHealth(range);
  if (h.isLoading) return null;
  const through = h.bookedThrough ? new Date(`${h.bookedThrough}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const cash = h.cash.periods[0].inTotal;
  const k = (v: number) => (v >= 1000 ? `$${Math.round(v / 100) / 10}k` : formatCurrency(v));
  return (
    <Link to="/business-health" className={cn("card-surface flex items-center gap-3 p-4 transition-shadow hover:shadow-card-hover", className)}>
      <Activity className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-bold">{through ? `Booked through ${through}` : "Nothing booked ahead"}</span>
        <span className="text-muted-foreground"> · {k(cash)} expected next 30 days</span>
        {h.overdueAR > 0 && <span className="text-destructive"> · {k(h.overdueAR)} overdue</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
