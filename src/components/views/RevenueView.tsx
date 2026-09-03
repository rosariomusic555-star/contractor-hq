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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, DollarSign, CheckCircle, Calendar } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { listInvoices } from "@/lib/api";

const monthKey = (isoDate: string) => isoDate.slice(0, 7);
const monthLabel = (isoDate: string) =>
  new Date(isoDate.slice(0, 10) + "T00:00:00").toLocaleString("en-US", { month: "short" });

const pieColors = [
  "hsl(215, 50%, 23%)",
  "hsl(35, 95%, 55%)",
  "hsl(142, 70%, 40%)",
  "hsl(210, 15%, 55%)",
  "hsl(265, 45%, 55%)",
];

export function RevenueView() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
  });

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
      .slice(0, 5)
      .map(([name, value], i) => ({
        name,
        color: pieColors[i % pieColors.length],
        value: Math.round((value / sum) * 100),
      }));
  }, [invoices]);

  const totalBilled = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.amount), 0);
  const avgMonthly = monthlyData.length ? Math.round(totalBilled / monthlyData.length) : 0;

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Revenue</h1>
        <p className="text-muted-foreground mt-1">Track your business performance</p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Total Billed"
          value={`$${totalBilled.toLocaleString()}`}
          change="All invoices"
          changeType="neutral"
          icon={DollarSign}
          iconColor="text-primary"
        />
        <StatCard
          title="Paid"
          value={`$${totalPaid.toLocaleString()}`}
          change="Collected"
          changeType="positive"
          icon={CheckCircle}
          iconColor="text-success"
        />
        <StatCard
          title="Outstanding"
          value={`$${outstanding.toLocaleString()}`}
          change="Awaiting payment"
          changeType="neutral"
          icon={TrendingUp}
          iconColor="text-warning"
        />
        <StatCard
          title="Avg. Monthly"
          value={`$${avgMonthly.toLocaleString()}`}
          change="Billed"
          changeType="neutral"
          icon={Calendar}
          iconColor="text-accent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="stat-card lg:col-span-2">
          <h3 className="text-lg font-semibold text-foreground mb-4">Billed vs Paid</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(215, 15%, 45%)", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(215, 15%, 45%)", fontSize: 12 }}
                  tickFormatter={(value) => `$${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(214, 20%, 88%)",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                />
                <Bar dataKey="billed" name="Billed" fill="hsl(215, 50%, 23%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" name="Paid" fill="hsl(142, 70%, 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Revenue by Client</h3>
          {byClient.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byClient}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {byClient.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, ""]}
                      contentStyle={{
                        backgroundColor: "hsl(0, 0%, 100%)",
                        border: "1px solid hsl(214, 20%, 88%)",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                {byClient.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
