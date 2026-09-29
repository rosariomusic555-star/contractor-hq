import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useSectionCollapse } from "@/hooks/use-section-collapse";
import { cn, formatCurrency } from "@/lib/utils";
import { resolveRange, type RangeKey } from "@/lib/financials";
import { opportunityStageMeta } from "@/lib/statusMeta";
import { fmtMultiple } from "@/lib/marketingRoi";
import { pctChange } from "@/lib/businessHealth";
import { useCompletedProfit } from "@/hooks/use-revenue-data";
import { useBusinessHealth } from "./useBusinessHealth";

const money = (v: number | null | undefined) => (v == null ? "—" : formatCurrency(v));
const k = (v: number) => (Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / 100) / 10}k` : formatCurrency(v));
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric" }) : "—");
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

type Row = { label: string; sub?: string; value?: string; href?: string };

function Tip({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A span, not a button — it sits inside clickable cards. */}
        <span
          role="button"
          tabIndex={0}
          className="inline-flex cursor-help text-muted-subtle hover:text-foreground"
          aria-label="How this is worked out"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{children}</TooltipContent>
    </Tooltip>
  );
}

function Change({ now, before, label }: { now: number; before: number; label: string }) {
  const c = pctChange(now, before);
  return (
    <span className={cn("text-xs", c == null ? "text-muted-foreground" : c >= 0 ? "text-success" : "text-destructive")}>
      {c == null ? `— vs ${label}` : `${c >= 0 ? "▲" : "▼"} ${Math.abs(c)}% vs ${label}`}
    </span>
  );
}

/**
 * Business health (0132, owner) — how far booked out, what cash is coming,
 * and how the business is trending, from data the app already has. Math:
 * src/lib/businessHealth.ts (tested) on top of the same money / margin /
 * overhead helpers the rest of the app uses. Estimates, not accounting.
 */
export function BusinessHealthView() {
  const [rangeKey] = useState<Exclude<RangeKey, "custom">>("ytd");
  const range = useMemo(() => resolveRange(rangeKey, undefined), [rangeKey]);
  const h = useBusinessHealth(range);
  // Completed-job profit, year to date — the same numbers as Revenue › Gross profit.
  const cp = useCompletedProfit("ytd");
  const { isCollapsed, toggle } = useSectionCollapse({ storageKey: "business-health-sections", defaultCollapsed: () => false });
  const [records, setRecords] = useState<{ title: string; note?: string; rows: Row[] } | null>(null);

  const next30 = h.cash.periods[0];
  const headline: { key: string; label: string; value: string; sub?: ReactNode; tip: string; rows: () => Row[] }[] = [
    {
      key: "booked",
      label: "Booked through",
      value: day(h.bookedThrough),
      sub: h.capacity.length ? `${h.capacity.length} crew${h.capacity.length === 1 ? "" : "s"}` : "no crews set up",
      tip: "The last scheduled working day across all crews (scheduled / in-progress jobs).",
      rows: () => h.capacity.map((c) => ({ label: c.crew.name, sub: `${c.jobs.length} scheduled job${c.jobs.length === 1 ? "" : "s"}`, value: day(c.bookedThrough) })),
    },
    {
      key: "backlog",
      label: "Backlog",
      value: k(h.backlogDollars),
      sub: `${h.backlogCrewWeeks} crew-weeks`,
      tip: "Contract value (original + approved change orders + add-ons) of signed jobs not complete yet — scheduled and unscheduled. Crew-weeks = remaining booked days + unscheduled planned crew-days, ÷ 5.",
      rows: () => [
        ...h.unscheduled.map((u) => ({ label: u.project.name, sub: `Not scheduled · ${u.crewDays ?? "?"} crew-days`, value: money(u.contract), href: `/projects/${u.project.id}` })),
        ...h.capacity.flatMap((c) => c.jobs.map((p) => ({ label: p.name, sub: `${c.crew.name} · ${day(p.scheduled_start_date)} – ${day(p.scheduled_end_date)}`, value: money(h.contractOf(p.id)), href: `/projects/${p.id}` }))),
      ],
    },
    {
      key: "cash30",
      label: "Next 30 days in",
      value: k(next30.inTotal),
      sub: <span className={next30.net >= 0 ? "text-success" : "text-destructive"}>net {k(next30.net)}</span>,
      tip: "Open invoice balances due in the next 30 days, draft invoices, and projected billing on scheduled jobs (deposit at start, final at end, + payment terms), less unapplied credits. Net subtracts estimated payroll and overhead.",
      rows: () => next30.lines.map((l) => ({ label: l.label, sub: `${l.kind === "invoice" ? "Invoice due" : l.kind === "draft" ? "Draft — not sent" : "Projected"} ${day(l.date)}`, value: money(l.amount) })),
    },
    {
      key: "overdue",
      label: "Overdue",
      value: k(h.overdueAR),
      sub: `${h.aging.slice(1).reduce((s, b) => s + b.items.length, 0)} invoices`,
      tip: "Balances on sent invoices past their due date.",
      rows: () => h.aging.slice(1).flatMap((b) => b.items.map((x) => ({ label: `${x.inv.client ?? "No client"} · ${x.inv.project ?? ""}`, sub: `${x.late} days late`, value: money(x.inv.balance), href: `/invoices/${x.inv.id}` }))),
    },
    {
      key: "bookedMonth",
      label: "Booked this month",
      value: k(h.bookedCompare.thisMonth),
      sub: <Change now={h.bookedCompare.thisMonth} before={h.bookedCompare.sameMonthLastYear} label="last year" />,
      tip: "Signed contract value by approval date: approved quotes (incl. add-ons) and approved change orders.",
      rows: () => [
        { label: "This month", value: money(h.bookedCompare.thisMonth) },
        { label: "Last month", value: money(h.bookedCompare.lastMonth) },
        { label: "Same month last year", value: money(h.bookedCompare.sameMonthLastYear) },
      ],
    },
    {
      key: "margin",
      label: "Margin",
      value: cp.totals.marginPct == null ? "—" : `${Math.round(cp.totals.marginPct)}%`,
      sub: cp.totals.fullyLoadedPct != null ? `${Math.round(cp.totals.fullyLoadedPct)}% fully loaded · YTD` : "jobs completed YTD",
      tip: "Gross margin of jobs completed this year: total profit ÷ total price — the job's closeout when it has one, else its live Planned vs actual. Same number as Revenue › Gross profit.",
      rows: () =>
        cp.jobs.map((j) => ({
          label: cp.names.get(j.projectId) ?? "Job",
          sub: `${j.price > 0 ? Math.round((j.profit / j.price) * 100) : 0}% gross${j.fullyLoaded != null && j.price > 0 ? ` · ${Math.round((j.fullyLoaded / j.price) * 100)}% loaded` : ""}`,
          value: money(j.profit),
          href: `/projects/${j.projectId}`,
        })),
    },
  ];

  const section = (id: string, title: string, body: ReactNode, right?: ReactNode) => (
    <section className="card-surface overflow-hidden p-0">
      <header className="flex items-center gap-2 px-4 py-3 md:px-5">
        <button type="button" onClick={() => toggle(id)} className="flex flex-1 items-center gap-2 text-left">
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isCollapsed(id) && "-rotate-90")} />
          <h2 className="text-base font-bold text-foreground">{title}</h2>
        </button>
        {right}
      </header>
      {!isCollapsed(id) && <div className="border-t border-hairline px-4 py-4 md:px-5">{body}</div>}
    </section>
  );

  if (h.isLoading) return <p className="p-6 text-muted-foreground">Loading…</p>;

  const openCallouts = h.capacity.filter((c) => c.openNext3Weeks > 0);

  return (
    <div className="mx-auto max-w-[1100px] animate-fade-in space-y-4 pb-20">
      <MobilePageHeader title="Business health" />
      <div className="hidden md:block">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Business health</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Estimates from your jobs, invoices and pipeline — not accounting.</p>
      </div>

      {/* Headline numbers — swipe on a phone */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-6">
        {headline.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setRecords({ title: c.label, note: c.tip, rows: c.rows() })}
            className="card-surface min-w-[10.5rem] snap-start p-4 text-left transition-shadow hover:shadow-card-hover md:min-w-0"
          >
            <span className="flex items-center justify-between gap-1 text-xs font-semibold text-muted-foreground">
              {c.label} <Tip>{c.tip}</Tip>
            </span>
            <span className="mt-1 block text-xl font-extrabold tabular-nums text-foreground">{c.value}</span>
            {c.sub && <span className="mt-0.5 block text-xs text-muted-foreground">{c.sub}</span>}
          </button>
        ))}
      </div>

      {/* Backlog + capacity */}
      {section(
        "backlog",
        "Backlog & capacity",
        <div className="space-y-5">
          {h.capacity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add crews in Settings › Business health and assign one on each job's Schedule card to see per-crew capacity. Backlog totals above still include every signed job.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {h.capacity.map((c) => (
                <div key={c.crew.id} className="rounded-xl border border-hairline p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-foreground">{c.crew.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Booked through <span className="font-semibold text-foreground">{day(c.bookedThrough)}</span>
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {c.windows.map((w) => (
                      <div key={w.weeks} className="rounded-lg bg-muted/40 py-1.5">
                        <p className="text-[11px] text-muted-foreground">Next {w.weeks} wks</p>
                        <p className={cn("text-sm font-bold tabular-nums", (w.utilization ?? 0) >= 0.9 ? "text-success" : (w.utilization ?? 0) < 0.5 ? "text-warning-strong" : "text-foreground")}>{pct(w.utilization)}</p>
                        <p className="text-[10px] text-muted-subtle">
                          {w.booked}/{w.available} days
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-0.5" aria-label="12-week booking strip">
                    {c.strip.map((w) => (
                      <div key={w.weekStart} className="flex-1" title={`Week of ${day(w.weekStart)}: ${w.booked} of ${w.available} days booked`}>
                        <div className="flex h-8 flex-col-reverse overflow-hidden rounded-sm bg-muted">
                          <div className="bg-primary" style={{ height: `${w.available ? (w.booked / w.available) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-subtle">12 weeks · green = booked days</p>
                </div>
              ))}
            </div>
          )}

          {openCallouts.length > 0 && (
            <div className="space-y-1">
              {openCallouts.map((c) => (
                <p key={c.crew.id} className="rounded-lg bg-info/10 px-3 py-2 text-sm text-foreground">
                  <span className="font-semibold">{c.crew.name}</span> has {c.openNext3Weeks} open day{c.openNext3Weeks === 1 ? "" : "s"} in the next 3 weeks — time to push sales or pull a job forward.
                </p>
              ))}
            </div>
          )}

          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              Signed, not scheduled <Tip>Won jobs with no start date. Crew-days = the owner's estimated duration, else Cost plan labor man-hours ÷ one crew-day's hours (crew size × hours/day from Overhead settings).</Tip>
            </h3>
            {h.unscheduled.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Nothing waiting to be scheduled.</p>
            ) : (
              <ul className="mt-2 divide-y divide-hairline">
                {h.unscheduled.map((u) => (
                  <li key={u.project.id}>
                    <Link to={`/projects/${u.project.id}`} className="flex items-center gap-3 py-2 hover:text-primary">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{u.project.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {u.crewDays ? `${u.crewDays} crew-days` : "No planned labor yet"}
                          {u.wouldFinish ? ` · would push ${u.crewName}${u.assumedCrew ? " (first free)" : ""} to ${day(u.wouldFinish)}` : ""}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums">{money(u.contract)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Rain delays: <span className="font-semibold text-foreground">{h.rainStats.monthDays}</span> day{h.rainStats.monthDays === 1 ? "" : "s"} lost this month ({h.rainStats.monthCount} delay
            {h.rainStats.monthCount === 1 ? "" : "s"}) · <span className="font-semibold text-foreground">{h.rainStats.yearDays}</span> this year ({h.rainStats.yearCount}).
          </p>
        </div>,
      )}

      {/* Cash forecast */}
      {section(
        "cash",
        "Cash forecast",
        <div className="space-y-3">
          <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-foreground">
            Estimate, not accounting. "Projected" billing assumes the deposit is invoiced at each job's scheduled start and the rest at its end, due{" "}
            {h.cash.periods[0] ? "per your payment terms" : ""} (Settings › Business health).
          </p>
          {h.cash.overdue.amount > 0 && (
            <p className="text-sm">
              <span className="font-semibold text-destructive">{money(h.cash.overdue.amount)} overdue</span> on {h.cash.overdue.invoices.length} invoice{h.cash.overdue.invoices.length === 1 ? "" : "s"} — not counted below until collected.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {h.cash.periods.map((p) => (
              <button key={p.days} type="button" onClick={() => setRecords({ title: `Days ${p.days - 29}–${p.days} in`, rows: p.lines.map((l) => ({ label: l.label, sub: `${l.kind === "invoice" ? "Invoice due" : l.kind === "draft" ? "Draft invoice" : "Projected"} ${day(l.date)}`, value: money(l.amount) })) })} className="rounded-xl border border-hairline p-3 text-left hover:bg-muted/30">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{p.days === 30 ? "Next 30 days" : `Days ${p.days - 29}–${p.days}`}</p>
                <dl className="mt-2 space-y-1 text-sm">
                  {[
                    ["Invoices due", p.invoices, "Open balances on sent invoices, by due date."],
                    ["Projected billing", p.projected, "Draft invoices + deposits / finals on scheduled jobs."],
                    ...(p.credits ? [["Credits on account", -p.credits, "Unapplied payments already received — they'll cover part of what's billed."]] : []),
                  ].map(([label, v, tip]) => (
                    <div key={label as string} className="flex justify-between gap-2">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        {label} <Tip>{tip as string}</Tip>
                      </dt>
                      <dd className="tabular-nums">{money(v as number)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 border-t border-hairline pt-1 font-semibold">
                    <dt>In</dt>
                    <dd className="tabular-nums text-success">{money(p.inTotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      Payroll <Tip>Average of the last 4 weeks of timesheet labor (incl. payroll burden), × 30 days.</Tip>
                    </dt>
                    <dd className="tabular-nums">−{money(p.payroll)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      Overhead <Tip>One month of your overhead (Settings › Overhead).</Tip>
                    </dt>
                    <dd className="tabular-nums">−{money(p.overhead)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-hairline pt-1 font-bold">
                    <dt>Net</dt>
                    <dd className={cn("tabular-nums", p.net >= 0 ? "text-success" : "text-destructive")}>{money(p.net)}</dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-subtle">Signed jobs with no schedule aren't projected yet — schedule them to include their billing. Known future expenses aren't tracked, so they're not subtracted.</p>
        </div>,
      )}

      {/* Receivables */}
      {section(
        "ar",
        "Accounts receivable",
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {h.aging.map((b) => (
              <button key={b.key} type="button" disabled={!b.items.length} onClick={() => setRecords({ title: b.label, rows: b.items.map((x) => ({ label: `${x.inv.client ?? "No client"} · ${x.inv.project ?? ""}`, sub: x.late > 0 ? `${x.late} days late` : `due ${day(x.inv.due_date)}`, value: money(x.inv.balance), href: `/invoices/${x.inv.id}` })) })} className="rounded-xl border border-hairline p-3 text-left enabled:hover:bg-muted/30">
                <p className="text-[11px] text-muted-foreground">{b.label}</p>
                <p className={cn("font-bold tabular-nums", b.key !== "current" && b.amount > 0 ? "text-destructive" : "text-foreground")}>{money(b.amount)}</p>
                <p className="text-[10px] text-muted-subtle">
                  {b.items.length} invoice{b.items.length === 1 ? "" : "s"}
                </p>
              </button>
            ))}
          </div>
          {h.topOverdue.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground">Top overdue clients</h3>
              <ul className="mt-1 divide-y divide-hairline">
                {h.topOverdue.map(([client, amt]) => (
                  <li key={client} className="flex justify-between py-1.5 text-sm">
                    <span>{client}</span>
                    <span className="font-semibold tabular-nums text-destructive">{money(amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>,
      )}

      {/* Sales pipeline (forward-looking). Booked / collected history and
          average job moved to Revenue — linked, not repeated. */}
      {section(
        "trends",
        "Sales pipeline",
        <div className="space-y-5">
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            Booked this month <span className="font-semibold tabular-nums">{money(h.bookedCompare.thisMonth)}</span>{" "}
            <Change now={h.bookedCompare.thisMonth} before={h.bookedCompare.sameMonthLastYear} label="last year" /> · collected{" "}
            <span className="font-semibold tabular-nums">{money(h.collectedCompare.thisMonth)}</span>.{" "}
            <Link to="/revenue?period=this_month&compare=last_year&basis=booked" className="font-semibold text-primary">
              Trends by month, source and feature in Revenue →
            </Link>
          </p>
          <div>
            <h3 className="flex items-center gap-1 text-sm font-bold text-foreground">
              Pipeline <Tip>Open leads' quote value (their project's main quote) by stage. Weighted = value × the stage's win probability (Settings › Business health).</Tip>
            </h3>
            <ul className="mt-2 divide-y divide-hairline">
              {h.pipelineStages.map((s) => (
                <li key={s.stage} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1">
                    {opportunityStageMeta(s.stage as never).label} <span className="text-xs text-muted-foreground">· {s.count} · {s.probability}%</span>
                  </span>
                  <span className="w-24 text-right tabular-nums text-muted-foreground">{money(s.value)}</span>
                  <span className="w-24 text-right font-semibold tabular-nums">{money(s.weighted)}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 py-1.5 text-sm font-bold">
                <span className="flex-1">Total</span>
                <span className="w-24 text-right tabular-nums">{money(h.pipelineStages.reduce((s, x) => s + x.value, 0))}</span>
                <span className="w-24 text-right tabular-nums text-success">{money(h.pipelineStages.reduce((s, x) => s + x.weighted, 0))}</span>
              </li>
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-hairline p-3">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                Win rate · last 90 days <Tip>Won ÷ (won + lost) for leads decided in the window. Won date = when its quote was signed; lost = when it was marked lost.</Tip>
              </p>
              <p className="text-lg font-extrabold">{pct(h.win90.winRate)}</p>
              <p className="text-xs text-muted-foreground">
                {h.win90.won}/{h.win90.decided} decided · prior 90 days {pct(h.winPrior.winRate)}
              </p>
            </div>
          </div>
        </div>,
      )}

      {/* Profitability — the full breakdown (by job, feature, crew; trend,
          fully loaded) lives in Revenue; this is the year-to-date summary. */}
      {section(
        "profit",
        "Profitability",
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["Margin", cp.totals.marginPct == null ? "—" : `${Math.round(cp.totals.marginPct)}%`],
              ["Fully loaded", !h.profit.hasOverhead ? "Set up overhead" : cp.totals.fullyLoadedPct == null ? "—" : `${Math.round(cp.totals.fullyLoadedPct)}%`],
              ["Total profit", money(cp.totals.profit)],
              ["Jobs completed", String(cp.totals.count)],
            ].map(([kk, v]) => (
              <div key={kk} className="rounded-lg bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">{kk} · YTD</p>
                <p className="font-bold tabular-nums text-foreground">{v}</p>
              </div>
            ))}
          </div>
          <Link to="/revenue?period=ytd&compare=last_year" className="inline-block text-sm font-semibold text-primary">
            Profit by job, feature and crew in Revenue →
          </Link>
          <p className="text-sm">
            <span className="font-semibold">Planned vs actual:</span>{" "}
            {h.plannedVsActual.count === 0 ? (
              "no closed-out jobs in this period yet."
            ) : (
              <>
                {h.plannedVsActual.count} closed-out job{h.plannedVsActual.count === 1 ? "" : "s"} expected {money(h.plannedVsActual.expected)} profit, made{" "}
                <span className={h.plannedVsActual.actual >= h.plannedVsActual.expected ? "text-success" : "text-destructive"}>{money(h.plannedVsActual.actual)}</span>.
              </>
            )}{" "}
            <Link to="/settings/estimating-insights" className="font-semibold text-primary">
              Estimating insights →
            </Link>
          </p>
          <p className="text-sm">
            <span className="font-semibold">Marketing (YTD):</span> spend {money(h.roi.spend)} · cost per won job {money(h.roi.costPerWon)} · ROAS {fmtMultiple(h.roi.roas)}{" "}
            <Link to="/pipeline" className="font-semibold text-primary">
              By source →
            </Link>
          </p>
        </div>,

      )}

      <p className="text-center text-xs text-muted-foreground">
        Settings for this page: <Link to="/settings/business-health" className="font-semibold text-primary">payment terms, pipeline probabilities, holidays, crew working days</Link>
      </p>

      <Dialog open={!!records} onOpenChange={(o) => !o && setRecords(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{records?.title}</DialogTitle>
            {records?.note && <DialogDescription>{records.note}</DialogDescription>}
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
            {records?.rows.map((r, i) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{r.label}</span>
                    {r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}
                  </span>
                  {r.value && <span className="text-sm font-bold tabular-nums">{r.value}</span>}
                </>
              );
              return (
                <li key={i}>
                  {r.href ? (
                    <Link to={r.href} className="flex items-center gap-2 py-2 hover:text-primary">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
            {records && records.rows.length === 0 && <li className="py-4 text-sm text-muted-foreground">Nothing here.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
