import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { formatCurrency } from "@/lib/utils";
import { listInvoices, listQuotes, listCategories } from "@/lib/api";
import { revenueByCategory } from "@/lib/metrics";

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00").toLocaleString("en-US", { month: "short" });

const GREY = "hsl(201 12% 46%)";
const GREEN = "hsl(131 36% 64%)";
const CATEGORY_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--sidebar-background))",
  "hsl(var(--info))",
  "hsl(var(--warning-strong))",
  "hsl(var(--border))",
];

export function RevenueView() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
  });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const byCategory = useMemo(() => {
    const rows = revenueByCategory(quotes, invoices, categories).filter((r) => r.amount > 0);
    const sum = rows.reduce((s, r) => s + r.amount, 0) || 1;
    return rows.map((r, i) => ({
      ...r,
      pct: Math.round((r.amount / sum) * 100),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  }, [quotes, invoices, categories]);

  const monthlyData = useMemo(() => {
    const buckets = new Map<string, { month: string; billed: number; paid: number }>();
    const ensure = (iso: string) => {
      const key = monthKey(iso);
      if (!buckets.has(key)) buckets.set(key, { month: monthLabel(iso), billed: 0, paid: 0 });
      return buckets.get(key)!;
    };
    invoices.forEach((inv) => {
      const bucket = ensure(inv.created_at);
      bucket.billed += Number(inv.amount);
      if (inv.status === "paid") bucket.paid += Number(inv.amount);
    });
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [invoices]);

  const byClient = useMemo(() => {
    const totals = new Map<string, number>();
    invoices.forEach((inv) => {
      const name = inv.project?.client?.name ?? inv.project?.name ?? "Unassigned";
      totals.set(name, (totals.get(name) ?? 0) + Number(inv.amount));
    });
    const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / sum) * 100) }));
  }, [invoices]);

  const totalBilled = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.amount), 0);
  const thisMonth = monthlyData.length ? monthlyData[monthlyData.length - 1] : null;
  const closedCount = invoices.filter((i) => i.status === "paid").length;
  const avgJob = closedCount ? Math.round(totalPaid / closedCount) : 0;

  return (
    <div className="animate-fade-in space-y-5">
      <MobilePageHeader
        title="Revenue"
        subtitle={`${formatCurrency(totalBilled)} invoiced · ${formatCurrency(outstanding)} outstanding`}
        back={{ to: "/dashboard", label: "Home" }}
      />
      <PageHeader
        title="Revenue"
        subtitle={`${formatCurrency(totalBilled)} invoiced · ${formatCurrency(totalPaid)} collected · ${formatCurrency(outstanding)} outstanding`}
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="This month" value={formatCurrency(thisMonth?.billed ?? 0)} sub="invoiced" />
        <KpiCard label="Collected" value={formatCurrency(totalPaid)} sub={`${formatCurrency(outstanding)} outstanding`} />
        <KpiCard label="Avg. margin" value="39%" sub="last 12 months" />
        <KpiCard label="Avg. job" value={formatCurrency(avgJob)} sub={`${closedCount} closed`} />
      </div>

      <section className="card-surface p-5 md:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Invoiced by month</h3>
          <div className="flex items-center gap-4 text-[11px] font-semibold text-muted-subtle">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Paid</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREY }} />Billed</span>
          </div>
        </div>
        <div className="mt-4 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(206 24% 90%)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip
                cursor={{ fill: "hsl(214 22% 94%)" }}
                contentStyle={{ background: "#fff", border: "1px solid hsl(212 21% 91%)", borderRadius: 12, fontSize: 13 }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Bar dataKey="billed" name="Billed" fill={GREY} radius={[4, 4, 0, 0]} />
              <Bar dataKey="paid" name="Paid" fill={GREEN} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* By category — real, only counts fully-paid quotes */}
        <section className="card-surface p-5">
          <h3 className="text-base font-bold text-foreground">Revenue by category</h3>
          {byCategory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No fully paid quotes yet.
            </p>
          ) : (
            <div className="mt-2">
              {byCategory.map((c) => (
                <div key={c.id} className="border-b border-hairline py-3 last:border-0">
                  <div className="flex justify-between text-[13px]">
                    <span className="font-semibold text-foreground">{c.name}</span>
                    <span className="font-bold tabular-nums text-foreground">{formatCurrency(c.amount)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                    <span className="w-8 text-right text-[11px] font-bold text-muted-subtle">{c.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* By client — real */}
        <section className="card-surface p-5">
          <h3 className="text-base font-bold text-foreground">Revenue by client</h3>
          {byClient.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="mt-2">
              {byClient.map((c) => (
                <div key={c.name} className="border-b border-hairline py-3 last:border-0">
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate font-semibold text-foreground">{c.name}</span>
                    <span className="font-bold tabular-nums text-foreground">{formatCurrency(c.value)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${c.pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-[11px] font-bold text-muted-subtle">{c.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
