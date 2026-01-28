import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";

const monthlyData = [
  { month: "Jan", revenue: 18500, expenses: 8200 },
  { month: "Feb", revenue: 24200, expenses: 10500 },
  { month: "Mar", revenue: 19800, expenses: 9100 },
  { month: "Apr", revenue: 32400, expenses: 14200 },
  { month: "May", revenue: 28600, expenses: 12800 },
  { month: "Jun", revenue: 35200, expenses: 15600 },
  { month: "Jul", revenue: 42800, expenses: 18900 },
];

const projectTypeData = [
  { name: "Renovations", value: 45, color: "hsl(215, 50%, 23%)" },
  { name: "New Construction", value: 25, color: "hsl(35, 95%, 55%)" },
  { name: "Repairs", value: 20, color: "hsl(142, 70%, 40%)" },
  { name: "Maintenance", value: 10, color: "hsl(210, 15%, 70%)" },
];

export function RevenueView() {
  const totalRevenue = monthlyData.reduce((sum, item) => sum + item.revenue, 0);
  const totalExpenses = monthlyData.reduce((sum, item) => sum + item.expenses, 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = ((netProfit / totalRevenue) * 100).toFixed(1);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Revenue</h1>
        <p className="text-muted-foreground mt-1">Track your business performance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          change="Year to date"
          changeType="neutral"
          icon={DollarSign}
          iconColor="text-success"
        />
        <StatCard
          title="Total Expenses"
          value={`$${totalExpenses.toLocaleString()}`}
          change="Year to date"
          changeType="neutral"
          icon={TrendingDown}
          iconColor="text-destructive"
        />
        <StatCard
          title="Net Profit"
          value={`$${netProfit.toLocaleString()}`}
          change={`${profitMargin}% margin`}
          changeType="positive"
          icon={TrendingUp}
          iconColor="text-primary"
        />
        <StatCard
          title="Avg. Monthly"
          value={`$${Math.round(totalRevenue / 7).toLocaleString()}`}
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
        </div>
      </div>
    </div>
  );
}
