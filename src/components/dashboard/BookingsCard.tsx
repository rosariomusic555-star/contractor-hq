import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import { listProjects, listQuotes, listChangeOrders, listOpportunities, type ChangeOrder, type Opportunity, type Quote } from "@/lib/api";
import { seasonalBookings } from "@/lib/bookings";
import { MonthThumbnail } from "@/components/bookings/MonthThumbnail";

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

const CURRENT_YEAR = new Date().getFullYear();

/**
 * "How much of a season is already sold" — the hardscape contractor's core
 * seasonal question. Groups committed jobs (approved/invoiced/paid with a
 * scheduled_start_date) by month, across one calendar year (Jan-Dec) at a
 * time — same year-boundary + seasonalBookings() call the /bookings page's
 * year nav uses (BookingsView), so the two never disagree on what
 * "2026" means. Lives where the Revenue chart used to sit on the Dashboard
 * (see RevenueChart's new spot lower down).
 *
 * Used to also show a capacity "Open"/"Room for N"/"Full" pill per month
 * (against Settings > Seasonal capacity) — removed as not useful. That
 * setting still exists but nothing reads it anymore. Also used to have a
 * rolling 6/12-months-forward range toggle (backed by
 * backlog_settings.default_range_months — DB table name unchanged) —
 * replaced by this year view; that column is likewise now dormant.
 *
 * Months render as square <MonthThumbnail> heat-map recaps — day-numbered,
 * draggable mini calendars are the /bookings year page's MiniMonth; this
 * card only needs a glanceable busy/empty read, so each square is one
 * click/hover target instead of 42 of them.
 */
export function BookingsCard({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: () => listOpportunities() });
  const [year, setYear] = useState(CURRENT_YEAR);
  const isCurrentYear = year === CURRENT_YEAR;
  const today = new Date();

  const quotesByProject = groupById<Quote>(quotes);
  const changeOrdersByProject = groupById<ChangeOrder>(changeOrders);
  const opportunitiesByProjectId = new Map<string, Opportunity>();
  for (const o of opportunities) {
    if (o.project_id) opportunitiesByProjectId.set(o.project_id, o);
  }

  // projects/quotes/change-orders/opportunities are already fully cached by
  // react-query regardless of year — seasonalBookings() just re-aggregates
  // that same cached data over a different Jan-Dec window, so flipping
  // years never triggers a refetch.
  const { months, seasonTotalDollars, seasonTotalJobs } = seasonalBookings(
    projects,
    quotesByProject,
    changeOrdersByProject,
    opportunitiesByProjectId,
    12,
    new Date(year, 0, 1),
  );

  return (
    <section className={cn("card-surface flex flex-col p-4 md:p-6", className)}>
      {/* Mobile: title, then one compact row (year nav + total) below it.
          Desktop (md:): unchanged — title and nav/total side by side. */}
      <header className="mb-4 flex flex-col gap-2 md:mb-5 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-3">
        <Link to="/bookings" className="group flex items-start gap-1 rounded-lg -m-1 p-1 hover:bg-muted/50">
          <div>
            <h3 className="text-base font-bold text-foreground">Bookings</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Committed work · {year}</p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
        </Link>
        <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:gap-2">
          <div className="flex items-center gap-1">
            {!isCurrentYear && (
              <button
                type="button"
                onClick={() => setYear(CURRENT_YEAR)}
                className="mr-1 text-[11px] font-bold text-primary hover:text-primary/80"
              >
                This year
              </button>
            )}
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-sm font-bold tabular-nums text-foreground">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {seasonTotalJobs > 0 && (
            <Link to="/bookings" className="text-right hover:opacity-80">
              {/* Mobile: one compact line, smaller than desktop's headline size. */}
              <p className="text-base font-extrabold tabular-nums text-foreground md:text-2xl md:tracking-tight">
                {formatCurrency(seasonTotalDollars)}
                <span className="ml-1 text-xs font-semibold text-muted-foreground md:hidden">
                  · {pluralize(seasonTotalJobs, "job")}
                </span>
              </p>
              <p className="mt-1 hidden text-xs font-semibold text-muted-foreground md:block">
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
        <div className="grid grid-cols-4 gap-1.5 md:grid-cols-4 md:gap-3 xl:grid-cols-6">
          {months.map((m) => {
            const [y, mo] = m.key.split("-").map(Number);
            return (
              <MonthThumbnail
                key={m.key}
                year={y}
                month={mo - 1}
                monthLabel={m.label}
                committedDollars={m.committedDollars}
                jobCount={m.jobCount}
                jobs={m.jobs}
                today={isCurrentYear ? today : undefined}
                onOpen={() => navigate(`/bookings?month=${m.key}`)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
