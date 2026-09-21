import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { listInvoices } from "@/lib/api";
import { monthlyRevenue, momChange } from "@/lib/financials";

const GREEN = "hsl(131 36% 64%)";

export function RevenueChart({ className }: { className?: string }) {
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const data = monthlyRevenue(invoices);
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const change = momChange(data);
  const up = change != null && change >= 0;

  return (
    <section className={cn("card-surface flex flex-col p-5 md:p-6", className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Revenue overview</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Monthly, invoiced</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
            {formatCurrency(Math.round(total))}
          </p>
          {change != null && (
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold",
                up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
              )}
            >
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {up ? "+" : ""}
              {change.toFixed(1)}% vs last month
            </span>
          )}
        </div>
      </header>

      <div className="min-h-[240px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={GREEN} stopOpacity={0.32} />
                <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(206 24% 90%)" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={48}
              tick={{ fill: "hsl(216 12% 59%)", fontSize: 12 }}
              tickFormatter={(value) => `$${value / 1000}k`}
            />
            <Tooltip
              cursor={{ stroke: GREEN, strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{
                background: "hsl(0 0% 100%)",
                border: "1px solid hsl(212 21% 91%)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px -5px hsl(215 23% 15% / 0.15)",
                fontSize: 13,
              }}
              formatter={(value: number) => [formatCurrency(value), "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={GREEN}
              strokeWidth={2.5}
              fill="url(#revFill)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(0 0% 100%)" }}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
