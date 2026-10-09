import { useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { resolveRange } from "@/lib/financials";
import { pctChange } from "@/lib/businessHealth";
import { useBusinessHealth } from "@/components/health/useBusinessHealth";

export const k = (v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / 100) / 10}k` : formatCurrency(v));
export const shortDay = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

/** Business health numbers (same hook as that page, so they always match). */
export function useHealth() {
  const range = useMemo(() => resolveRange("ytd", undefined), []);
  return useBusinessHealth(range);
}

export interface HeadlineCell {
  label: string;
  value: string;
  /** Plain-text subline; `tone` colors it on the white strip only. */
  sub: string;
  tone?: "good" | "bad";
  to: string;
}

/** The five headline numbers — shared by the strip below and the Dashboard
 *  banner's tiles, so both always show the same figures. */
export function useHeadlineCells(): { cells: HeadlineCell[]; isLoading: boolean } {
  const h = useHealth();
  const c = pctChange(h.bookedCompare.thisMonth, h.bookedCompare.sameMonthLastYear);
  const net = h.cash.periods[0].net;
  const cells: HeadlineCell[] = [
    { label: "Collected this month", value: k(h.collectedCompare.thisMonth), sub: "", to: "/revenue?period=this_month&basis=collected" },
    { label: "Overdue", value: k(h.overdueAR), sub: h.overdueAR > 0 ? "needs chasing" : "all current", tone: h.overdueAR > 0 ? "bad" : undefined, to: "/invoices" },
    {
      label: "Booked this month",
      value: k(h.bookedCompare.thisMonth),
      sub: c == null ? "— vs last year" : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c)}% vs last year`,
      tone: c == null ? undefined : c >= 0 ? "good" : "bad",
      to: "/business-health",
    },
    { label: "Booked through", value: shortDay(h.bookedThrough), sub: `${k(h.backlogDollars)} backlog`, to: "/business-health" },
    { label: "Next 30 days in", value: k(h.cash.periods[0].inTotal), sub: `net ${k(net)}`, tone: net >= 0 ? "good" : "bad", to: "/business-health" },
  ];
  return { cells, isLoading: h.isLoading };
}
