import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { listInvoices, listExpenses, type ProjectType } from "@/lib/api";

const projectTypeMeta: Record<ProjectType, { label: string; color: string }> = {
  renovation: { label: "Renovations", color: "hsl(215, 50%, 23%)" },
  new_construction: { label: "New Construction", color: "hsl(35, 95%, 55%)" },
  repair: { label: "Repairs", color: "hsl(142, 70%, 40%)" },
  maintenance: { label: "Maintenance", color: "hsl(210, 15%, 70%)" },
};

const monthKey = (isoDate: string) => isoDate.slice(0, 7); // "2024-03"
const monthLabel = (isoDate: string) =>
  new Date(isoDate + "T00:00:00").toLocaleString("en-US", { month: "short" });

export function RevenueView() {
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: listInvoices,
  });
  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: listExpenses,
  });

  const monthlyData = useMemo(() => {
    const buckets = new Map<string, { month: string; revenue: number; expenses: number }>();
    const ensure = (iso: string) => {
      const key = monthKey(iso);
      if (!buckets.has(key)) buckets.set(key, { month: monthLabel(iso), revenue: 0, expenses: 0 });
      return buckets.get(key)!;
    };
    invoices.forEach((inv) => { ensure(inv.issue_date).revenue += Number(inv.amount); });
    expenses.forEach((exp) => { ensure(exp.expense_date).expenses += Number(exp.amount); });
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [invoices, expenses]);

  const projectTypeData = useMemo(() => {
    const totals = new Map<ProjectType, number>();
    invoices.forEach((inv) => {
      if (!inv.project_type) return;
      totals.set(inv.project_type, (totals.get(inv.project_type) ?? 0) + Number(inv.amount));
    });
    const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()].map(([type, value]) => ({
      name: projectTypeMeta[type].label,
      color: projectTypeMeta[type].color,
      value: Math.round((value / sum) * 100),
    }));
  }, [invoices]);

  const totalRevenue = monthlyData.reduce((sum, item) => sum + item.revenue, 0);
  const totalExpenses = monthlyData.reduce((sum, item) => sum + item.expenses, 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0";
  const avgMonthly = monthlyData.length ? Math.round(totalRevenue / monthlyData.length) : 0;

  const isLoading = loadingInvoices || loadingExpenses;

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Revenue</h1>
        <p className="text-muted-foreground mt-1">Track your business performance</p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          change="All invoices"
          changeType="neutral"
          icon={DollarSign}
          iconColor="text-success"
        />
        <StatCard
          title="Total Expenses"
          value={`$${totalExpenses.toLocaleString()}`}
          change="All expenses"
          changeType="neutral"
          icon={TrendingDown}
          iconColor="text-destructive"
        />
        <StatCard
          title="Net Profit"
          value={`$${netProfit.toLocaleString()}`}
          change={`${profitMargin}% margin`}
          changeType={netProfit >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
          iconColor="text-primary"
        />
        <StatCard
          title="Avg. Monthly"
          value={`$${avgMonthly.toLocaleString()}`}
          change="Revenue"
          changeType="neutral"
          icon={Calendar}
          iconColor="text-accent"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Bar Chart */}
        <div className="stat-card lg:col-span-2">
          <h3 className="text-lg font-semibold text-foreground mb-4">Revenue vs Expenses</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(215, 15%, 45%)', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(215, 15%, 45%)', fontSize: 12 }}
                  tickFormatter={(value) => `$${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(0, 0%, 100%)',
                    border: '1px solid hsl(214, 20%, 88%)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(215, 50%, 23%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="hsl(35, 95%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="stat-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Revenue by Project Type</h3>
          {projectTypeData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categorized invoices yet.</p>
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={projectTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {projectTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, '']}
                      contentStyle={{
                        backgroundColor: 'hsl(0, 0%, 100%)',
                        border: '1px solid hsl(214, 20%, 88%)',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                {projectTypeData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
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
