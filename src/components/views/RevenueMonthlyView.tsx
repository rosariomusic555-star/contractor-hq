import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { RevenueDetailHeader } from "@/components/revenue/RevenueDetailHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { Switch } from "@/components/ui/switch";
import { formatCurrency, pluralize } from "@/lib/utils";
import { listInvoices } from "@/lib/api";
import { useRevenueRange } from "@/hooks/use-revenue-range";
import { monthlyBreakdown, hasYearOfHistory, invoicedTotal, collectedTotal, rangeDateLabel } from "@/lib/revenue";

const GREY = "hsl(201 12% 46%)";
const GREEN = "hsl(131 36% 64%)";
const GREY_LIGHT = "hsl(201 12% 80%)";

export function RevenueMonthlyView() {
  const navigate = useNavigate();
  const { rangeKey, setRangeKey, customStart, customEnd, setCustom, range } = useRevenueRange("last_12");
  const [compareYoy, setCompareYoy] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const canCompareYoy = hasYearOfHistory(invoices);
  const total = invoicedTotal(invoices, range);
  const collected = collectedTotal(invoices, range);

  const data = useMemo(() => monthlyBreakdown(invoices, range), [invoices, range]);

  const priorYearByKey = useMemo(() => {
    if (!compareYoy) return new Map<string, number>();
    const priorStart = new Date(range.start.getFullYear() - 1, range.start.getMonth(), 1);
    const priorRange = { ...range, start: priorStart, end: new Date(range.end.getFullYear() - 1, range.end.getMonth(), range.end.getDate()) };
    const priorData = monthlyBreakdown(invoices, priorRange);
    // Align by month-of-year, not exact key, so "this month" lines up with
    // "same month last year" regardless of the range's exact start day.
    const byMonthOfYear = new Map<number, number>();
    for (const m of priorData) byMonthOfYear.set(Number(m.key.slice(5, 7)), m.invoiced);
    const out = new Map<string, number>();
    for (const m of data) out.set(m.key, byMonthOfYear.get(Number(m.key.slice(5, 7))) ?? 0);
    return out;
  }, [compareYoy, invoices, range, data]);

  const chartData = useMemo(
    () => data.map((m) => ({ ...m, priorYear: priorYearByKey.get(m.key) ?? 0 })),
    [data, priorYearByKey],
  );

  const goToMonth = (key: string) => navigate(`/revenue/invoiced?month=${key}`);

  return (
    <div className="animate-fade-in space-y-5">
      <RevenueDetailHeader
        title="Invoiced by month"
        rangeKey={rangeKey}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setRangeKey}
        onCustomChange={setCustom}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:max-w-md">
        <KpiCard label="Invoiced" value={formatCurrency(total)} sub={rangeDateLabel(range)} />
        <KpiCard label="Collected" value={formatCurrency(collected)} sub={rangeDateLabel(range)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="card-surface p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-[11px] font-semibold text-muted-subtle">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Paid</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREY }} />Billed</span>
                {compareYoy && (
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREY_LIGHT }} />Billed, last year</span>
                )}
              </div>
              {canCompareYoy && (
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  Compare to last year
                  <Switch checked={compareYoy} onCheckedChange={setCompareYoy} />
                </label>
              )}
            </div>
            <div className="mt-4 h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(206 24% 90%)" />
                  <XAxis dataKey="shortLabel" axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip
                    cursor={{ fill: "hsl(214 22% 94%)" }}
                    contentStyle={{ background: "#fff", border: "1px solid hsl(212 21% 91%)", borderRadius: 12, fontSize: 13 }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  {compareYoy && <Bar dataKey="priorYear" name="Billed, last year" fill={GREY_LIGHT} radius={[4, 4, 0, 0]} />}
                  <Bar
                    dataKey="invoiced"
                    name="Billed"
                    fill={GREY}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(d: { key: string }) => goToMonth(d.key)}
                  />
                  <Bar
                    dataKey="collected"
                    name="Paid"
                    fill={GREEN}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(d: { key: string }) => goToMonth(d.key)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="card-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Invoiced</th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                    <th>Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].reverse().map((m) => (
                    <tr key={m.key} className="cursor-pointer" onClick={() => goToMonth(m.key)}>
                      <td className="font-bold text-foreground">{m.label}</td>
                      <td className="font-bold tabular-nums">{formatCurrency(m.invoiced)}</td>
                      <td className="tabular-nums text-success">{formatCurrency(m.collected)}</td>
                      <td className="tabular-nums text-muted-foreground">{formatCurrency(m.outstanding)}</td>
                      <td className="text-muted-foreground">{pluralize(m.invoiceCount, "invoice")}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">No invoices in this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
