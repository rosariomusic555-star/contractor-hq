import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listChangeOrders,
  getBacklogSettings,
  saveBacklogSettings,
  type BacklogRangeMonths,
  type ChangeOrder,
  type Quote,
} from "@/lib/api";
import { seasonalBacklog, type BacklogFullness } from "@/lib/backlog";

const FULLNESS_BADGE: Record<BacklogFullness, string> = {
  open: "badge-status badge-draft",
  room: "badge-status badge-info",
  full: "badge-status badge-pending",
};

const RANGE_OPTIONS: BacklogRangeMonths[] = [6, 12];

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
 * "How much of next season is already sold, and can I take another job in
 * May" — the hardscape contractor's core seasonal question. Groups
 * committed jobs (approved/invoiced/paid with a target_install_month) by
 * month, next 6 months forward, against a configurable monthly $ capacity
 * (Settings > Seasonal capacity). Lives where the Revenue chart used to sit
 * on the Dashboard (see RevenueChart's new spot lower down).
 */
export function SeasonalBacklogCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: settings } = useQuery({ queryKey: ["backlog-settings"], queryFn: getBacklogSettings });

  // Optimistic local override so clicking the toggle feels instant instead
  // of waiting on the save round-trip; settings.default_range_months (the
  // persisted per-user value) takes over once loaded/once this unmounts.
  const [localRange, setLocalRange] = useState<BacklogRangeMonths | null>(null);
  const range = localRange ?? settings?.default_range_months ?? 6;

  const rangeMut = useMutation({
    mutationFn: (months: BacklogRangeMonths) => saveBacklogSettings({ default_range_months: months }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backlog-settings"] }),
  });
  const selectRange = (months: BacklogRangeMonths) => {
    setLocalRange(months);
    rangeMut.mutate(months);
  };

  const quotesByProject = groupById<Quote>(quotes);
  const changeOrdersByProject = groupById<ChangeOrder>(changeOrders);
  const capacity = settings?.capacity_dollars_per_month ?? 50000;

  const { months, seasonTotalDollars, seasonTotalJobs } = seasonalBacklog(
    projects,
    quotesByProject,
    changeOrdersByProject,
    capacity,
    range,
  );

  return (
    <section className={cn("card-surface flex flex-col p-5 md:p-6", className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Seasonal backlog</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Committed work, next {range} months</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => selectRange(opt)}
                aria-pressed={range === opt}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                  range === opt
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt} months
              </button>
            ))}
          </div>
          {seasonTotalJobs > 0 && (
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                {formatCurrency(seasonTotalDollars)}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {pluralize(seasonTotalJobs, "job")} booked
              </p>
            </div>
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
            <div key={m.key} className="min-w-[110px] shrink-0 rounded-xl bg-muted/40 p-3 md:min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">{m.label}</p>
              <p className="mt-1.5 text-lg font-extrabold tabular-nums text-foreground">
                {m.committedDollars > 0 ? formatCurrency(m.committedDollars) : "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{pluralize(m.jobCount, "job")}</p>
              <span className={cn(FULLNESS_BADGE[m.fullness], "mt-2 inline-flex")}>{m.fullnessLabel}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
