import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb, Megaphone, Star, UserRound, Wrench } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  getPayrollSettings,
  listCloseouts,
  listEmployees,
  listLaborEntriesSince,
  listLeadSourceSpend,
  listLeadSources,
  listOpportunities,
  listRecommendationStates,
  listReviewRequests,
  listRunningTimers,
  listSubmittedTimesheets,
} from "@/lib/api";
import { resolveRange } from "@/lib/financials";
import { pctChange, addDays } from "@/lib/businessHealth";
import { computeRecommendations, openRecommendations } from "@/lib/estimatingInsights";
import { buildRoiRows, fmtMultiple, resolvePeriod } from "@/lib/marketingRoi";
import { dueBuckets, monthYear } from "@/lib/maintenance";
import { isoDate } from "@/lib/weatherRisk";
import { useBusinessHealth } from "@/components/health/useBusinessHealth";
import { useMaintenanceItems } from "@/components/maintenance/useMaintenance";
import { Card, CardSkeleton, EmptyLine } from "./CardShell";
import { TONE_TEXT } from "./tones";

const k = (v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v) / 100) / 10}k` : formatCurrency(v));
const shortDay = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

/** Business health numbers (same hook as that page, so they always match). */
function useHealth() {
  const range = useMemo(() => resolveRange("ytd", undefined), []);
  return useBusinessHealth(range);
}

// ---------------------------------------------------------------------------
// Headline strip — 5 numbers, swipeable on a phone, each links to its page.
// ---------------------------------------------------------------------------
export function HeadlineStrip() {
  const h = useHealth();
  const c = pctChange(h.bookedCompare.thisMonth, h.bookedCompare.sameMonthLastYear);
  const cells = [
    { label: "Collected this month", value: k(h.collectedCompare.thisMonth), sub: null as React.ReactNode, to: "/revenue/collected" },
    { label: "Overdue", value: k(h.overdueAR), sub: h.overdueAR > 0 ? <span className="text-destructive">needs chasing</span> : "all current", to: "/invoices" },
    {
      label: "Booked this month",
      value: k(h.bookedCompare.thisMonth),
      sub: c == null ? "— vs last year" : <span className={c >= 0 ? "text-success" : "text-destructive"}>{`${c >= 0 ? "▲" : "▼"} ${Math.abs(c)}% vs last year`}</span>,
      to: "/business-health",
    },
    { label: "Booked through", value: shortDay(h.bookedThrough), sub: `${k(h.backlogDollars)} backlog`, to: "/business-health" },
    { label: "Next 30 days in", value: k(h.cash.periods[0].inTotal), sub: <span className={h.cash.periods[0].net >= 0 ? "text-success" : "text-destructive"}>net {k(h.cash.periods[0].net)}</span>, to: "/business-health" },
  ];
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
      {cells.map((x) => (
        <Link key={x.label} to={x.to} className="card-surface min-w-[9.5rem] snap-start px-3 py-2.5 transition-shadow hover:shadow-card-hover md:min-w-0">
          <span className="block text-[11px] font-semibold text-muted-foreground">{x.label}</span>
          {h.isLoading ? <span className="mt-1 block h-6 w-16 animate-pulse rounded bg-muted" /> : <span className="block text-lg font-extrabold tabular-nums text-foreground">{x.value}</span>}
          <span className="block truncate text-[11px] text-muted-foreground">{x.sub}</span>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crew & time — clocked in now, hours this week vs last, OT watch, waiting.
// ---------------------------------------------------------------------------
export function CrewTimeCard() {
  const today = isoDate(new Date());
  const { data: employees = [], isLoading } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const { data: timers = [] } = useQuery({ queryKey: ["running-timers"], queryFn: listRunningTimers, refetchInterval: 60_000 });
  const { data: waiting = [] } = useQuery({ queryKey: ["timesheets", "submitted"], queryFn: listSubmittedTimesheets, staleTime: 60_000 });
  const { data: settings } = useQuery({ queryKey: ["payroll-settings"], queryFn: getPayrollSettings });
  // Workweek start from Settings › Payroll (default Monday).
  const ws = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    const back = (d.getDay() - (settings?.week_start ?? 1) + 7) % 7;
    return addDays(today, -back);
  }, [today, settings]);
  const lastWs = addDays(ws, -7);
  const { data: labor = [] } = useQuery({ queryKey: ["labor-since", lastWs], queryFn: () => listLaborEntriesSince(lastWs) });
  const active = employees.filter((e) => e.status === "active");
  if (isLoading) return null;
  if (active.length === 0) return null;
  const mine = labor.filter((e) => e.employee_id);
  const sum = (from: string, to: string) => Math.round(mine.filter((e) => e.entry_date >= from && e.entry_date <= to).reduce((s, e) => s + Number(e.hours), 0) * 10) / 10;
  const thisWeek = sum(ws, addDays(ws, 6));
  const lastWeek = sum(lastWs, addDays(lastWs, 6));
  const otLimit = settings?.ot_weekly_hours ?? 40;
  const watch = active
    .map((e) => ({ e, h: Math.round(mine.filter((x) => x.employee_id === e.id && x.entry_date >= ws).reduce((s, x) => s + Number(x.hours), 0) * 10) / 10 }))
    .filter((x) => x.h >= otLimit - 5)
    .sort((a, b) => b.h - a.h);
  return (
    <Card title="Crew & time" count={timers.length ? `${timers.length} clocked in` : null} viewAll={{ to: "/timesheets", label: "Timesheets" }} id="crew">
      <div className="divide-y divide-hairline">
        <div className="px-4 py-2">
          {timers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody's clocked in right now.</p>
          ) : (
            <ul className="space-y-1">
              {timers.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <UserRound className="h-3.5 w-3.5 text-success" />
                  <span className="flex-1 truncate">
                    {employees.find((e) => e.id === t.employee_id)?.name ?? t.worker_name} <span className="text-muted-foreground">· {t.project?.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">since {new Date(t.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-hairline text-center">
          <div className="py-2">
            <p className="text-[11px] text-muted-foreground">This week</p>
            <p className="font-bold tabular-nums">{thisWeek} h</p>
          </div>
          <div className="py-2">
            <p className="text-[11px] text-muted-foreground">Last week</p>
            <p className="font-bold tabular-nums">{lastWeek} h</p>
          </div>
          <Link to="/timesheets" className="py-2 hover:bg-muted/40">
            <p className="text-[11px] text-muted-foreground">Waiting</p>
            <p className={cn("font-bold tabular-nums", waiting.length ? TONE_TEXT.amber : "")}>{waiting.length}</p>
          </Link>
        </div>
        {watch.length > 0 && (
          <div className="px-4 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Overtime watch</p>
            {watch.map(({ e, h }) => (
              <p key={e.id} className="flex justify-between text-sm">
                <span>{e.name}</span>
                <span className={cn("font-semibold tabular-nums", h >= otLimit ? TONE_TEXT.red : TONE_TEXT.amber)}>
                  {h} / {otLimit} h
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Money — AR aging mini-bars + 30-day cash in vs out (Business health math).
// ---------------------------------------------------------------------------
export function MoneyCard() {
  const h = useHealth();
  if (h.isLoading)
    return (
      <Card title="Money">
        <CardSkeleton rows={2} />
      </Card>
    );
  const max = Math.max(1, ...h.aging.map((b) => b.amount));
  const p = h.cash.periods[0];
  return (
    <Card title="Money" viewAll={{ to: "/business-health", label: "Business health" }}>
      <div className="divide-y divide-hairline">
        <div className="px-4 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Receivables</p>
          <ul className="mt-1 space-y-1">
            {h.aging.map((b) => (
              <li key={b.key} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-muted-foreground">{b.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", b.key === "current" ? "bg-success" : b.key === "d1_30" ? "bg-warning" : "bg-destructive")} style={{ width: `${(b.amount / max) * 100}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{k(b.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-3 divide-x divide-hairline text-center">
          <div className="py-2">
            <p className="text-[11px] text-muted-foreground">In · 30 days</p>
            <p className="font-bold tabular-nums text-success">{k(p.inTotal)}</p>
          </div>
          <div className="py-2">
            <p className="text-[11px] text-muted-foreground">Out · 30 days</p>
            <p className="font-bold tabular-nums">{k(p.outTotal)}</p>
          </div>
          <div className="py-2">
            <p className="text-[11px] text-muted-foreground">Net</p>
            <p className={cn("font-bold tabular-nums", p.net >= 0 ? "text-success" : "text-destructive")}>{k(p.net)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Past clients — maintenance due + review requests.
// ---------------------------------------------------------------------------
export function PastClientsCard() {
  const today = isoDate(new Date());
  const { data: items = [] } = useMaintenanceItems();
  const { data: reviews = [] } = useQuery({ queryKey: ["review-requests"], queryFn: listReviewRequests });
  const due = dueBuckets(items.filter((i) => !i.project?.client?.maintenance_opt_out && !i.opportunity_id), today);
  const count = (s: string) => reviews.filter((r) => r.status === s).length;
  const recentLeft = reviews.filter((r) => r.status === "left" && r.left_at && Date.parse(r.left_at) >= Date.now() - 30 * 86_400_000);
  const dueRows = [...due.overdue, ...due.thisMonth, ...due.nextMonth].slice(0, 4);
  if (!dueRows.length && !reviews.length) return null;
  return (
    <Card title="Past clients" viewAll={{ to: "/projects" }}>
      <div className="divide-y divide-hairline">
        {dueRows.length > 0 && (
          <ul>
            {dueRows.map((i) => (
              <li key={i.id}>
                <Link to={`/projects/${i.project_id}?maintenance=${i.id}`} className="flex min-h-[44px] items-center gap-2 px-4 py-2 text-sm hover:bg-muted/40">
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {i.project?.client?.name ?? i.project?.name} <span className="text-muted-foreground">· {i.label}</span>
                  </span>
                  <span className={cn("shrink-0 text-xs font-semibold", i.next_due! < today ? TONE_TEXT.red : "text-muted-foreground")}>{monthYear(i.next_due).split(" ")[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {reviews.length > 0 && (
          <Link to="/settings/reviews" className="grid grid-cols-4 divide-x divide-hairline text-center hover:bg-muted/30">
            {[
              ["To ask", count("not_asked")],
              ["Asked", count("asked")],
              ["Clicked", count("clicked")],
              ["Left", count("left")],
            ].map(([l, n]) => (
              <div key={l as string} className="py-2">
                <p className="text-[11px] text-muted-foreground">{l}</p>
                <p className="font-bold tabular-nums">{n}</p>
              </div>
            ))}
          </Link>
        )}
        {recentLeft.length > 0 && (
          <p className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 text-warning" /> {recentLeft.length} review{recentLeft.length === 1 ? "" : "s"} left in the last 30 days
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Insights — latest estimating insight(s) + marketing this month.
// ---------------------------------------------------------------------------
export function InsightsCard() {
  const { data: closeouts = [] } = useQuery({ queryKey: ["all-closeouts"], queryFn: listCloseouts, staleTime: 5 * 60_000 });
  const { data: states = [] } = useQuery({ queryKey: ["recommendation-states"], queryFn: listRecommendationStates, staleTime: 5 * 60_000 });
  const { data: opps = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: spend = [] } = useQuery({ queryKey: ["lead-source-spend"], queryFn: listLeadSourceSpend });
  const { data: sources = [] } = useQuery({ queryKey: ["lead-sources"], queryFn: listLeadSources });
  const recs = useMemo(() => openRecommendations(computeRecommendations(closeouts), states), [closeouts, states]);
  const roi = useMemo(
    () =>
      buildRoiRows({
        leads: opps,
        spend,
        sources: sources.map((s) => ({ name: s.name, paid: s.paid ?? true })),
        period: resolvePeriod("this_month", null),
        openValue: () => 0,
        wonMoney: () => null,
        hasOverhead: false,
      }).totals,
    [opps, spend, sources],
  );
  const hasMarketing = (roi.spend ?? 0) > 0 || roi.leads > 0;
  if (!recs.length && !hasMarketing) return null;
  return (
    <Card title="Insights" count={recs.length || null} viewAll={recs.length ? { to: "/settings/estimating-insights" } : undefined}>
      <ul className="divide-y divide-hairline">
        {recs.slice(0, 2).map((r) => (
          <li key={r.key}>
            <Link to="/settings/estimating-insights" className="flex items-start gap-2 px-4 py-2.5 text-sm hover:bg-muted/40">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{r.headline}</span>
            </Link>
          </li>
        ))}
        {hasMarketing && (
          <li>
            <Link to="/pipeline" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/40">
              <Megaphone className="h-4 w-4 shrink-0 text-info" />
              <span className="min-w-0 flex-1">
                This month: {roi.leads} lead{roi.leads === 1 ? "" : "s"}
                {(roi.spend ?? 0) > 0 && (
                  <>
                    {" "}
                    · {formatCurrency(roi.spend ?? 0)} spent · cost per won job {roi.costPerWon == null ? "—" : formatCurrency(roi.costPerWon)} · ROAS {fmtMultiple(roi.roas)}
                  </>
                )}
              </span>
            </Link>
          </li>
        )}
      </ul>
    </Card>
  );
}

