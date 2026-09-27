import { Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationSettings, Quote } from "@/lib/api";
import { activityBadge, coldState, timeAgoShort } from "@/lib/quoteActivity";

const TONE = {
  grey: "bg-muted text-muted-foreground",
  blue: "bg-info/15 text-info",
  green: "bg-success/15 text-success",
  amber: "bg-warning/20 text-warning-strong",
};

/** Quotes list / pipeline: Not opened · Viewed 3× · Selections changed, the
 * last-viewed time, and "Going cold" (0117). Internal only. */
export function QuoteActivityBadge({
  quote,
  settings,
  showLastViewed = true,
  className,
}: {
  quote: Pick<Quote, "status" | "sent_at" | "view_count" | "first_viewed_at" | "last_viewed_at" | "last_view_device" | "selections_changed_at">;
  settings?: Pick<NotificationSettings, "cold_unopened_days" | "cold_unsigned_days"> | null;
  showLastViewed?: boolean;
  className?: string;
}) {
  const badge = activityBadge(quote);
  const cold = settings ? coldState(quote, settings) : null;
  if (!badge && !cold) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {badge && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[badge.tone])}>{badge.label}</span>}
      {cold && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-bold text-info" title={cold.kind === "unopened" ? "Sent but not opened" : "Viewed but not signed"}>
          <Snowflake className="h-3 w-3" />
          Going cold
        </span>
      )}
      {showLastViewed && quote.last_viewed_at && <span className="text-[11px] text-muted-subtle">viewed {timeAgoShort(quote.last_viewed_at)}</span>}
    </span>
  );
}
