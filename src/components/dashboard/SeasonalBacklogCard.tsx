import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { listProjects, listQuotes, listChangeOrders, listOpportunities, type ChangeOrder, type Opportunity, type Quote } from "@/lib/api";
import { seasonalBacklog } from "@/lib/backlog";
import { useBacklogRange } from "@/hooks/use-backlog-range";
import { BacklogRangeToggle } from "@/components/common/BacklogRangeToggle";

function groupById<T extends { project_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.project_id) continue;
    const list = map.get(row.project_id);
    if (list) list.push(row);
    else map.set(row.project_id, [row]);
  }
  return map;
}

/**
 * "How much of next season is already sold" — the hardscape contractor's
 * core seasonal question. Groups committed jobs (approved/invoiced/paid
 * with a scheduled_start_date) by month, next 6 or 12 months forward.
 * Lives where the Revenue chart used to sit on the Dashboard (see
 * RevenueChart's new spot lower down). Same seasonalBacklog() computation,
 * same range preference (useBacklogRange) as the full /backlog page this
 * card links into.
 *
 * Used to also show a capacity "Open"/"Room for N"/"Full" pill per month
 * (against Settings > Seasonal capacity) — removed as not useful. That
 * setting still exists but nothing reads it anymore.
 */
export function SeasonalBacklogCard({ className }: { className?: string }) {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: () => listOpportunities() });
  const { range, setRange } = useBacklogRange();

  const quotesByProject = groupById<Quote>(quotes);
  const changeOrdersByProject = groupById<ChangeOrder>(changeOrders);
  const opportunitiesByProjectId = new Map<string, Opportunity>();
  for (const o of opportunities) {
    if (o.project_id) opportunitiesByProjectId.set(o.project_id, o);
  }

  const { months, seasonTotalDollars, seasonTotalJobs } = seasonalBacklog(
    projects,
    quotesByProject,
    changeOrdersByProject,
    opportunitiesByProjectId,
    range,
  );

  return (
    <section className={cn("card-surface flex flex-col p-5 md:p-6", className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Link to="/backlog" className="group flex items-start gap-1 rounded-lg -m-1 p-1 hover:bg-muted/50">
          <div>
            <h3 className="text-base font-bold text-foreground">Seasonal backlog</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Committed work, next {range} months</p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
        </Link>
        <div className="flex flex-col items-end gap-2">
          <BacklogRangeToggle range={range} onChange={setRange} />
          {seasonTotalJobs > 0 && (
            <Link to="/backlog" className="text-right hover:opacity-80">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                {formatCurrency(seasonTotalDollars)}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {pluralize(seasonTotalJobs, "job")} booked
              </p>
            </Link>
          )}
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : seasonTotalJobs === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-muted/40 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">No committed work scheduled yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Won opportunities show up here once they have a target install month.
          </p>
          <Link
            to="/pipeline"
            className="mt-3 text-[13px] font-bold text-primary hover:text-primary/80"
          >
            Go to pipeline →
          </Link>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-6 md:overflow-visible md:pb-0">
          {months.map((m) => (
            <Link
              key={m.key}
              to={`/backlog?month=${m.key}`}
              className="min-w-[110px] shrink-0 rounded-xl bg-muted/40 p-3 transition-colors hover:bg-muted/70 md:min-w-0"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{m.label}</p>
              <p className="mt-1.5 text-lg font-extrabold tabular-nums text-foreground">
                {m.committedDollars > 0 ? formatCurrency(m.committedDollars) : "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{pluralize(m.jobCount, "job")}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
