import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { DateRangeSelect } from "./DateRangeSelect";
import type { RangeKey } from "@/lib/revenue";

/** Shared "‹ Revenue" back link + title + date-range selector header for
 * every Revenue detail page. Each page renders its own headline KPI(s)
 * below this, using the exact figure its RevenueView card shows for the
 * same range. */
export function RevenueDetailHeader({
  title,
  rangeKey,
  customStart,
  customEnd,
  onRangeChange,
  onCustomChange,
}: {
  title: string;
  rangeKey: RangeKey;
  customStart: string;
  customEnd: string;
  onRangeChange: (key: RangeKey) => void;
  onCustomChange: (start: string, end: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Link
        to="/revenue"
        className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Revenue
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">{title}</h1>
        <DateRangeSelect
          value={rangeKey}
          customStart={customStart}
          customEnd={customEnd}
          onChange={onRangeChange}
          onCustomChange={onCustomChange}
        />
      </div>
    </div>
  );
}
