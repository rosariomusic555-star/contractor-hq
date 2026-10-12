import { useMemo } from "react";
import { Banknote, CalendarRange, Handshake, Wallet } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import { useRevenueData } from "@/hooks/use-revenue-data";
import { bookedItems, collectedItems, comparePeriod, itemsIn, resolvePeriod, sumIn } from "@/lib/revenueReport";
import { invoiceBannerStats } from "@/components/banners/invoicesBanner";
import { changeLabel, compactMoney, count, monthlySeries } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

/**
 * Revenue and Business health share this banner — revenueReport.ts's own
 * bases: collected (payments, the report's default) for YTD / this month,
 * booked (signed originals) for the average job. Tiles open the report on
 * the matching period; there's no list to filter, so no chips.
 */
export function useRevenueBanner(): RichBanner {
  const data = useRevenueData();
  const st = useMemo(() => {
    const now = new Date();
    const projects = data.profitInputs.projects;
    const collected = collectedItems(data.payments, projects);
    const ytd = resolvePeriod("ytd", undefined, now);
    const lastYtd = comparePeriod(ytd, "last_year")!;
    const month = resolvePeriod("this_month", undefined, now);
    const lastMonth = resolvePeriod("last_month", undefined, now);
    const signed = itemsIn(
      bookedItems(projects, data.profitInputs.quotes, data.profitInputs.changeOrders).filter((i) => i.kind === "original"),
      ytd,
    );
    const inv = invoiceBannerStats(data.invoices, data.payments, now);
    return {
      any: collected.length > 0 || data.invoices.length > 0 || signed.length > 0,
      ytd: sumIn(collected, ytd),
      lastYtd: sumIn(collected, lastYtd),
      month: sumIn(collected, month),
      lastMonth: sumIn(collected, lastMonth),
      series: monthlySeries(collected, (i) => i.date, (i) => i.amount, now),
      outstanding: inv.outstanding,
      outstandingCount: inv.outstandingCount,
      overdueCount: inv.overdueCount,
      signedCount: signed.length,
      avgJob: signed.length ? signed.reduce((s, i) => s + i.amount, 0) / signed.length : null,
    };
  }, [data]);

  const insight = !st.any
    ? "No revenue yet — it shows here once clients pay"
    : [
        `${compactMoney(st.ytd)} collected this year`,
        st.lastYtd > 0 ? changeLabel(st.ytd, st.lastYtd, "last year") : null,
        st.outstanding > 0 ? `${compactMoney(st.outstanding)} still to collect` : "everything's paid up",
      ]
        .filter(Boolean)
        .join(" · ");

  return {
    insight,
    loading: !data.ready,
    tiles: [
      {
        key: "ytd",
        label: "Revenue YTD",
        icon: Banknote,
        value: st.any ? formatCurrency(st.ytd) : "—",
        sub: st.any ? (changeLabel(st.ytd, st.lastYtd, "last YTD") ?? "nothing this time last year") : "Record a payment to see this",
        subTone: st.lastYtd > 0 ? (st.ytd >= st.lastYtd ? "positive" : "negative") : "muted",
        to: "/revenue?period=ytd&basis=collected",
      },
      {
        key: "month",
        label: "This month",
        icon: CalendarRange,
        value: st.any ? formatCurrency(st.month) : "—",
        sub: st.any ? (changeLabel(st.month, st.lastMonth, "last month") ?? "collected") : "Payments show here",
        visual: st.series.some((v) => v > 0) ? { kind: "spark", points: st.series } : undefined,
        to: "/revenue?period=this_month&basis=collected",
      },
      {
        key: "outstanding",
        label: "Outstanding",
        icon: Wallet,
        value: st.outstandingCount ? formatCurrency(st.outstanding) : "—",
        sub: st.outstandingCount
          ? `${count(st.outstandingCount, "invoice")}${st.overdueCount ? ` · ${st.overdueCount} overdue` : ""}`
          : st.any
            ? "Nothing owed right now"
            : "Open invoices show here",
        subTone: st.overdueCount ? "negative" : "muted",
        to: "/invoices",
      },
      {
        key: "avg",
        label: "Avg. project value",
        icon: Handshake,
        value: st.avgJob == null ? "—" : formatCurrency(st.avgJob),
        sub: st.avgJob == null ? "Shows once a job is signed this year" : `${count(st.signedCount, "job")} signed this year`,
        to: "/revenue?period=ytd&basis=booked",
      },
    ],
  };
}
