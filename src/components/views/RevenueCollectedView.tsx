import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { listInvoices, type Invoice } from "@/lib/api";
import { agingBuckets, invoiceDaysLate } from "@/lib/aging";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { collectedInRange, collectedTotal, collectionRate, rangeDateLabel } from "@/lib/revenue";

const clientOf = (inv: Invoice) => inv.project?.client?.name ?? "No client";

export function RevenueCollectedView() {
  const navigate = useNavigate();
  const { rangeKey, setRangeKey, customStart, customEnd, setCustom, range } = useRevenueRange("this_month");

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const payments = useMemo(
    () => [...collectedInRange(invoices, range)].sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? "")),
    [invoices, range],
  );
  const total = collectedTotal(invoices, range);
  const rate = collectionRate(invoices, range);

  // Outstanding is always a right-now snapshot, not scoped to the selected
  // range — same reasoning as the aging card everywhere else in the app.
  const outstandingInvoices = useMemo(
    () => invoices.filter((i) => i.status === "sent" || i.status === "overdue"),
    [invoices],
  );
  const buckets = agingBuckets(invoices);
  const outstandingTotal = buckets.reduce((s, b) => s + b.amount, 0);

  const bucketOf = (inv: Invoice): (typeof buckets)[number]["key"] => {
    const late = invoiceDaysLate(inv);
    return late <= 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : "d60";
  };

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Collected"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <KpiCard label="Collected" value={formatCurrency(total)} sub={rangeDateLabel(range)} />
        <KpiCard label="Outstanding" value={formatCurrency(outstandingTotal)} sub="as of today" subTone={outstandingTotal > 0 ? "negative" : "muted"} />
        <KpiCard label="Collection rate" value={rate != null ? `${Math.round(rate)}%` : "—"} sub="collected ÷ invoiced, this range" />
      </div>

      <section className="card-surface overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="text-base font-bold text-foreground">Payments received</h3>
          <span className="text-xs font-semibold text-muted-foreground">{pluralize(payments.length, "payment")}</span>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((inv) => (
                  <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="text-muted-foreground">{(inv.paid_at ?? inv.created_at).slice(0, 10)}</td>
                    <td>{clientOf(inv)}</td>
                    <td className="font-bold text-foreground">{inv.invoice_number ?? "—"}</td>
                    <td className="font-bold tabular-nums text-success">{formatCurrency(Number(inv.amount))}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">No payments received in this range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-surface overflow-hidden">
        <div className="p-5 pb-0">
          <h3 className="text-base font-bold text-foreground">Outstanding</h3>
          <p className="text-xs text-muted-foreground">Everything billed and not yet paid, as of today — not scoped to the range above.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {buckets.map((b) => (
            <div key={b.key} className={cn("rounded-xl p-3", b.key === "d31_60" || b.key === "d60" ? "bg-destructive/10" : "bg-muted/50")}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{b.label}</p>
              <p className={cn("mt-1 text-lg font-extrabold tabular-nums", b.key === "d31_60" || b.key === "d60" ? "text-destructive" : "text-foreground")}>
                {formatCurrency(b.amount)}
              </p>
              <p className="text-[11px] text-muted-subtle">{pluralize(b.count, "invoice")}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Invoice</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {outstandingInvoices
                .sort((a, b) => invoiceDaysLate(b) - invoiceDaysLate(a))
                .map((inv) => {
                  const bucket = bucketOf(inv);
                  const late = invoiceDaysLate(inv);
                  const flagged = bucket === "d31_60" || bucket === "d60";
                  return (
                    <tr
                      key={inv.id}
                      className={cn("cursor-pointer", flagged && "bg-destructive/5")}
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <td>{clientOf(inv)}</td>
                      <td className="font-bold text-foreground">{inv.invoice_number ?? "—"}</td>
                      <td className="text-muted-foreground">{inv.due_date?.slice(0, 10) ?? "—"}</td>
                      <td className="font-bold tabular-nums">{formatCurrency(Number(inv.amount))}</td>
                      <td>
                        {late > 0 ? (
                          <span className={cn("badge-status", flagged ? "badge-overdue" : "badge-pending")}>{late} days late</span>
                        ) : (
                          <span className="badge-status badge-draft">Current</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {outstandingInvoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">Nothing outstanding.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
