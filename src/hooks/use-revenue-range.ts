import { useMemo, useState } from "react";
import { resolveRange, type DateRange, type RangeKey } from "@/lib/revenue";

/**
 * Drives every Revenue detail page's date-range selector — same shape,
 * same defaulting rules everywhere, so a page's headline figure always
 * reflects exactly what the selector shows.
 */
export function useRevenueRange(defaultKey: RangeKey = "this_month", initial?: { start: string; end: string }) {
  const [rangeKey, setRangeKey] = useState<RangeKey>(initial ? "custom" : defaultKey);
  const [customStart, setCustomStart] = useState(initial?.start ?? "");
  const [customEnd, setCustomEnd] = useState(initial?.end ?? "");

  const range: DateRange = useMemo(
    () => resolveRange(rangeKey, { start: customStart, end: customEnd }),
    [rangeKey, customStart, customEnd],
  );

  const setCustom = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
  };

  return { rangeKey, setRangeKey, customStart, customEnd, setCustom, range };
}
