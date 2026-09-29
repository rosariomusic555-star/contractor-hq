import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const k = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 100) / 10}k` : `$${Math.round(v)}`);

/** Cumulative actual cost to date vs the planned budget (a flat line). */
export function CostTrendChart({
  series,
  planned,
  milestones = [],
}: {
  series: { date: string; actual: number }[];
  planned: number;
  milestones?: { date: string; label: string }[];
}) {
  if (series.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No costs logged yet.</p>;
  // A starting point at $0 so one day of spend still draws a line.
  const first = new Date(`${series[0].date}T00:00:00`);
  first.setDate(first.getDate() - 1);
  const start = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`;
  const data = [{ date: start, actual: 0 }, ...series];
  const top = Math.max(planned, data[data.length - 1].actual) * 1.08 || 1;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="jobCostFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--hairline, var(--border)))" />
          <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={[0, top]} tickFormatter={k} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            formatter={(v: number) => [formatCurrency(v), "Spent to date"]}
            labelFormatter={(l: string) => short(l)}
            contentStyle={{ borderRadius: 10, fontSize: 12 }}
          />
          {planned > 0 && (
            <ReferenceLine
              y={planned}
              stroke="hsl(var(--foreground))"
              strokeDasharray="5 4"
              label={{ value: `Planned ${k(planned)}`, position: "insideTopRight", fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
          )}
          {milestones.map((m) => (
            <ReferenceLine key={`${m.date}-${m.label}`} x={m.date} stroke="hsl(var(--info))" strokeDasharray="2 3" label={{ value: m.label, position: "top", fontSize: 10, fill: "hsl(var(--info))" }} />
          ))}
          <Area type="stepAfter" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#jobCostFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
