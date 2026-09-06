import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { listInvoices } from "@/lib/api";
import { monthlyRevenue, momChange } from "@/lib/metrics";

export function RevenueChart() {
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const data = monthlyRevenue(invoices);
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const change = momChange(data);
  const up = change != null && change >= 0;

  return (
    <div className="flex animate-fade-in flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_3px_0_hsl(215_25%_15%/0.06)] lg:col-span-2">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Revenue Overview</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Monthly revenue from invoices</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            ${Math.round(total).toLocaleString()}
          </p>
          {change != null && (
            <span
              className={`mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              }`}
            >
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {up ? "+" : ""}
              {change.toFixed(1)}% from last month
            </span>
          )}
        </div>
      </div>
      <div className="min-h-[280px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(131, 36%, 64%)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(131, 36%, 64%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(214, 20%, 90%)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fill: "hsl(215, 15%, 45%)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={48}
              tick={{ fill: "hsl(215, 15%, 45%)", fontSize: 12 }}
              tickFormatter={(value) => `$${value / 1000}k`}
            />
            <Tooltip
              cursor={{ stroke: "hsl(131, 36%, 64%)", strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{
                backgroundColor: "hsl(0, 0%, 100%)",
                border: "1px solid hsl(214, 20%, 88%)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px -5px hsl(215 25% 15% / 0.15)",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(131, 36%, 64%)"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorRevenue)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(0, 0%, 100%)" }}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
