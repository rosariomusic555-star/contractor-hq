import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRainDelay } from "@/components/schedule/rainDelayContext";
import { RISK_TEXT } from "@/components/weather/riskStyles";
import { listChangeOrders, listInvoices, listProjects, listQuotes, type ChangeOrder, type Quote } from "@/lib/api";
import { seasonalBookings } from "@/lib/bookings";
import { monthlyRevenue } from "@/lib/financials";
import { jobRisks, useScheduleForecasts } from "@/lib/forecast";
import { projectHref } from "@/lib/projectTabs";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { Card, CardSkeleton, EmptyLine } from "./CardShell";
import { k } from "./headline";

/*
 * Compact versions of the classic Dashboard's Bookings, Revenue overview and
 * Weather risks cards for the simplified layout's optional cards — same data
 * (seasonalBookings, monthlyRevenue, jobRisks), on the shared Card shell.
 */

function groupByProject<T extends { project_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) if (r.project_id) map.set(r.project_id, [...(map.get(r.project_id) ?? []), r]);
  return map;
}

/** Bookings — the next 3 months as small tiles: jobs booked and their value. */
export function SimpleBookingsCard() {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { months } = seasonalBookings(projects, groupByProject<Quote>(quotes), groupByProject<ChangeOrder>(changeOrders), 3);
  return (
    <Card title="Bookings" viewAll={{ to: "/bookings", label: "View calendar" }} single>
      {isLoading ? (
        <CardSkeleton rows={1} />
      ) : (
        <div className="grid grid-cols-3 gap-2 p-4">
          {months.map((m) => (
            <Link key={m.key} to="/bookings" className="rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40">
              <span className="block text-[11px] font-semibold text-muted-foreground">{m.label}</span>
              <span className="block text-base font-extrabold tabular-nums text-foreground">{k(m.committedDollars)}</span>
              <span className="block text-xs text-muted-foreground">{m.jobCount ? pluralize(m.jobCount, "job") : "Open"}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Revenue overview — invoiced per month as bars, full width under the two
 *  columns: the last 12 months once there's invoicing older than 6 months,
 *  otherwise the last 6 (wider bars). */
export function SimpleRevenueCard() {
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const byKey = new Map(monthlyRevenue(invoices).map((p) => [p.key, p.revenue]));
  const now = new Date();
  const lastMonths = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (n - 1) + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: d.toLocaleDateString("en-US", { month: "short" }), revenue: byKey.get(key) ?? 0 };
    });
  const twelve = lastMonths(12);
  const months = twelve.slice(0, 6).some((m) => m.revenue > 0) ? twelve : twelve.slice(6);
  const total = months.reduce((s, m) => s + m.revenue, 0);
  const max = Math.max(...months.map((m) => m.revenue), 1);
  return (
    <Card title="Revenue overview" count={total > 0 ? formatCurrency(Math.round(total)) : null} viewAll={{ to: "/revenue", label: "Revenue" }} single>
      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : total === 0 ? (
        <EmptyLine>Revenue will show here as you invoice jobs.</EmptyLine>
      ) : (
        // Inner padding keeps the value labels and caption off the card edges.
        <div className="px-6 pb-4 pt-5">
          <p className="sr-only">Invoiced by month: {months.map((m) => `${m.label} ${formatCurrency(m.revenue)}`).join(", ")}.</p>
          <div className="flex h-48 items-end gap-3 sm:gap-4" aria-hidden>
            {months.map((m, i) => (
              <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${m.label}: ${formatCurrency(m.revenue)}`}>
                {m.revenue > 0 && <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-muted-foreground">{k(m.revenue)}</span>}
                <div
                  className={cn("w-full max-w-16 rounded-t-md", m.revenue > 0 ? (i === months.length - 1 ? "bg-primary" : "bg-primary/60") : "bg-muted")}
                  style={{ height: m.revenue > 0 ? `${Math.max(4, (m.revenue / max) * 88)}%` : "4px" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 sm:gap-4">
            {months.map((m) => (
              <span key={m.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
                {m.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Invoiced, last {months.length} months</p>
        </div>
      )}
    </Card>
  );
}

/** Weather risks — scheduled jobs with a flagged work day in the next 7
 *  days. Hidden when there are none (the column just closes up). */
export function SimpleWeatherRisksCard() {
  const { projects, batch } = useScheduleForecasts();
  const risks = jobRisks(projects, batch, 7);
  const openDelay = useRainDelay();
  if (risks.length === 0) return null;
  return (
    <Card title="Weather risks" count={risks.length} viewAll={{ to: "/bookings", label: "Schedule" }}>
      <ul className="divide-y divide-hairline">
        {risks.map((r) => {
          const d = new Date(`${r.date}T00:00:00`);
          return (
            <li key={`${r.project.id}-${r.date}`} className="flex items-center gap-2 px-4 py-2">
              <Link to={projectHref(r.project.id, "schedule")} className="flex min-w-0 flex-1 items-start gap-2 text-sm hover:underline">
                <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", RISK_TEXT[r.level])} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{r.project.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · <span className={RISK_TEXT[r.level]}>{r.summary}</span>
                  </span>
                </span>
              </Link>
              {openDelay && (
                <Button size="chip" variant="soft" className="shrink-0" onClick={() => openDelay({ projectId: r.project.id, date: r.date })}>
                  <CloudRain /> Delay
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
