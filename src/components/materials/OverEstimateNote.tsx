import { useShowOverEstimateNotes } from "@/hooks/use-show-over-estimate-notes";
import { cn } from "@/lib/utils";

const qty = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Using more than planned, said quietly on the line itself: "Used 14 of 12
 * ton" with a soft dot — no red, no banner, no icon (0167). Only on
 * usage-tracked lines where the contractor is looking at materials (the
 * Materials tab, the Cost plan). Renders nothing when the setting is off.
 */
export function OverEstimateNote({ used, estimated, unit, className }: { used: number; estimated: number; unit?: string | null; className?: string }) {
  const show = useShowOverEstimateNotes();
  if (!show) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning/60" aria-hidden />
      Used {qty(used)} of {qty(estimated)} {unit || "units"}
    </span>
  );
}
