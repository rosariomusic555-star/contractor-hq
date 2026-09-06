import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { listInvoices } from "@/lib/api";
import { monthlyRevenue, momChange } from "@/lib/metrics";

export function RevenueChart() {
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const data = monthlyRevenue(invoices);
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const change = momChange(data);

  return (
    <div className="stat-card col-span-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Revenue Overview</h3>
          <p className="text-sm text-muted-foreground">Monthly revenue from invoices</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">${Math.round(total).toLocaleString()}</p>
          {change != null && (
            <p
              className={`text-sm font-medium ${
                change >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}% from last month
            </p>
          )}
        </div>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(131, 36%, 64%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(131, 36%, 64%)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(131, 36%, 64%)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
