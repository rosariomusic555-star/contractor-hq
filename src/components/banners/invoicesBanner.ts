import { Banknote, CircleAlert, Hourglass, Wallet } from "lucide-react";
import type { RichBanner } from "@/components/common/ListBanner";
import type { Invoice, Payment } from "@/lib/api";
import { agingBuckets, effectiveInvoiceStatus } from "@/lib/financials";
import { invoiceBalance, invoicePaymentState } from "@/lib/projectMoney";
import { avgDaysToPay, compactMoney, count, inLastDays, inMonth, inWeek, monthlySeries } from "@/lib/bannerMetrics";
import { formatCurrency } from "@/lib/utils";

export type InvoiceChip = "overdue" | "due_week" | "drafts" | "partial";
type InvoiceFilter = "all" | "unpaid" | "overdue" | "paid" | "draft" | "sent";

export function invoiceChipMatch(inv: Invoice, chip: InvoiceChip, now: Date): boolean {
  const st = effectiveInvoiceStatus(inv, now);
  switch (chip) {
    case "overdue":
      return st === "overdue";
    case "due_week":
      return st === "sent" && inWeek(inv.due_date, now) && invoiceBalance(inv) > 0;
    case "drafts":
      return st === "draft";
    case "partial":
      return invoicePaymentState(inv) === "partial";
  }
}

/** Everything the Invoices banner shows. Days to get paid runs from the
 *  invoice's creation (invoices have no sent date) to `paid_at`. */
export function invoiceBannerStats(invoices: Invoice[], payments: Pick<Payment, "amount" | "paid_on" | "status">[], now: Date) {
  const open = invoices.filter((i) => {
    const st = effectiveInvoiceStatus(i, now);
    return (st === "sent" || st === "overdue") && invoiceBalance(i) > 0;
  });
  const overdue = open.filter((i) => effectiveInvoiceStatus(i, now) === "overdue");
  const aging = Object.fromEntries(agingBuckets(invoices, now).map((b) => [b.key, b.amount])) as Record<string, number>;
  const active = payments.filter((p) => p.status === "active");
  const collectedMonth = active.filter((p) => inMonth(p.paid_on, now)).reduce((s, p) => s + Number(p.amount), 0);
  const paid90 = invoices.filter((i) => i.paid_at && inLastDays(i.paid_at, 90, now)).map((i) => ({ sent: i.created_at, paid: i.paid_at! }));
  const chip = (c: InvoiceChip) => invoices.filter((i) => invoiceChipMatch(i, c, now)).length;
  return {
    total: invoices.length,
    outstanding: open.reduce((s, i) => s + invoiceBalance(i), 0),
    outstandingCount: open.length,
    overdue: overdue.reduce((s, i) => s + invoiceBalance(i), 0),
    overdueCount: overdue.length,
    aging: { current: aging.current ?? 0, d1_30: aging.d1_30 ?? 0, d31_60: aging.d31_60 ?? 0, d60: aging.d60 ?? 0 },
    collectedMonth,
    collectedSeries: monthlySeries(active, (p) => p.paid_on, (p) => Number(p.amount), now),
    daysToPay: avgDaysToPay(paid90),
    paid90Count: paid90.length,
    chips: { overdue: chip("overdue"), due_week: chip("due_week"), drafts: chip("drafts"), partial: chip("partial") },
  };
}

export function useInvoicesBanner({
  invoices,
  payments,
  loading,
  chip,
  setChip,
  filter,
  setFilter,
}: {
  invoices: Invoice[];
  payments: Pick<Payment, "amount" | "paid_on" | "status">[];
  loading: boolean;
  chip: InvoiceChip | null;
  setChip: (c: InvoiceChip | null) => void;
  filter: string;
  setFilter: (f: InvoiceFilter) => void;
}): { rich: RichBanner; matches: (i: Invoice) => boolean } {
  const now = new Date();
  const st = invoiceBannerStats(invoices, payments, now);

  let insight: string;
  if (st.total === 0) insight = "No invoices yet — create your first one";
  else if (st.overdueCount > 0) insight = `${compactMoney(st.outstanding)} outstanding · ${compactMoney(st.overdue)} overdue across ${count(st.overdueCount, "invoice")}`;
  else if (st.outstandingCount > 0) insight = `${compactMoney(st.outstanding)} outstanding · nothing overdue`;
  else insight = "Everything's paid up";

  const go = (f: InvoiceFilter) => {
    setChip(null);
    setFilter(f);
  };
  const rich: RichBanner = {
    insight,
    loading,
    listId: "invoices-list",
    activeChip: chip,
    onChip: (k) => {
      setChip(k as InvoiceChip | null);
      if (k) setFilter("all");
    },
    chips: [
      { key: "overdue", label: "overdue", count: st.chips.overdue },
      { key: "due_week", label: "due this week", count: st.chips.due_week },
      { key: "drafts", label: st.chips.drafts === 1 ? "draft not sent" : "drafts not sent", count: st.chips.drafts },
      { key: "partial", label: "partially paid", count: st.chips.partial },
    ],
    tiles: [
      {
        key: "outstanding",
        label: "Outstanding",
        icon: Wallet,
        value: st.outstandingCount ? formatCurrency(st.outstanding) : "—",
        sub: st.outstandingCount ? count(st.outstandingCount, "invoice") : st.total ? "Nothing owed right now" : "Send your first invoice to see this",
        onClick: () => go("unpaid"),
        active: !chip && filter === "unpaid",
      },
      {
        key: "overdue",
        label: "Overdue",
        icon: CircleAlert,
        value: st.total ? formatCurrency(st.overdue) : "—",
        alert: st.overdue > 0,
        sub: st.overdueCount ? count(st.overdueCount, "invoice") : st.total ? "Nothing overdue" : "Late invoices show here",
        visual:
          st.outstanding > 0
            ? {
                kind: "segments",
                parts: [
                  { label: "Current", value: st.aging.current, className: "bg-primary" },
                  { label: "1–30 days", value: st.aging.d1_30, className: "bg-warning-strong" },
                  { label: "31–60 days", value: st.aging.d31_60, className: "bg-destructive/70" },
                  { label: "60+ days", value: st.aging.d60, className: "bg-destructive" },
                ],
              }
            : undefined,
        onClick: () => go("overdue"),
        active: !chip && filter === "overdue",
      },
      {
        key: "collected",
        label: "Collected this month",
        icon: Banknote,
        value: st.collectedMonth ? formatCurrency(st.collectedMonth) : "—",
        sub: st.collectedMonth ? "payments received" : "Payments received show here",
        subTone: st.collectedMonth ? "positive" : "muted",
        visual: st.collectedSeries.some((v) => v > 0) ? { kind: "spark", points: st.collectedSeries } : undefined,
        onClick: () => go("paid"),
        active: !chip && filter === "paid",
      },
      {
        key: "days",
        label: "Avg. days to get paid",
        icon: Hourglass,
        value: st.daysToPay == null ? "—" : count(st.daysToPay, "day"),
        sub: st.daysToPay == null ? "Shows once invoices are paid" : `${count(st.paid90Count, "invoice")} paid, last 90 days`,
        onClick: () => go("paid"),
      },
    ],
  };
  return { rich, matches: (i) => !chip || invoiceChipMatch(i, chip, now) };
}
