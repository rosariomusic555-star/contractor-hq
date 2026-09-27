import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Info, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableTh } from "@/components/common/SortableTh";
import { useSort } from "@/hooks/use-sort";
import { cn, formatCurrency, pluralize } from "@/lib/utils";
import {
  getMarketingSettings,
  getOverheadSettings,
  listAllMaterialsSections,
  listChangeOrders,
  listExpenses,
  listLeadSourceSpend,
  listLeadSources,
  listMaterialsSheets,
  listPayments,
  listProjects,
  listQuotes,
  type ChangeOrder,
  type MaterialsSection,
  type Opportunity,
  type Payment,
  type Quote,
} from "@/lib/api";
import { buildProjectFinancials } from "@/lib/financials";
import { annualAmount, burdenPerHour, plannedManHours } from "@/lib/overhead";
import { opportunityStageMeta } from "@/lib/statusMeta";
import {
  PERIOD_PRESETS,
  ROI_TONE_CLASS,
  buildRoiRows,
  cplTrend,
  fmtMultiple,
  monthLabel,
  monthOfIso,
  overheadMismatch,
  resolvePeriod,
  roiTone,
  sourceKey,
  ym,
  type PeriodKey,
  type RoiRow,
  type WonMoney,
} from "@/lib/marketingRoi";
import { SpendFormDialog, SpendGridDialog } from "./SpendDialogs";

const GREEN = "hsl(131 36% 64%)";
const SLATE = "hsl(200 13% 46%)";
const LINE_COLORS = ["hsl(131 36% 50%)", "hsl(210 70% 55%)", "hsl(35 90% 55%)", "hsl(280 45% 55%)", "hsl(0 65% 55%)", "hsl(180 45% 40%)"];
const dash = "—";
const money = (v: number | null) => (v == null ? dash : formatCurrency(v));

function groupBy<T>(rows: T[], keyOf: (r: T) => string | null | undefined) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/**
 * Pipeline › By source — leads, win rate and quote value per lead source
 * (CRM Phase 6), plus Marketing ROI (0128): ad spend, cost per lead / won
 * job, won revenue (current contract value), ROAS and profit per $1. The
 * math is src/lib/marketingRoi.ts; contract value + profit come from the
 * same buildProjectFinancials() the Revenue pages use. Reporting only.
 */
export function LeadSourceReport({
  opportunities,
  quoteValueByProjectId,
  typeFiltered,
}: {
  opportunities: Opportunity[];
  quoteValueByProjectId: Map<string, number>;
  typeFiltered: boolean;
}) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("last_12");
  const [custom, setCustom] = useState({ from: ym(new Date()), to: ym(new Date()) });
  const period = useMemo(() => resolvePeriod(periodKey, custom), [periodKey, custom]);
  const [gridOpen, setGridOpen] = useState(false);
  const [formSource, setFormSource] = useState<string | null | undefined>(undefined); // undefined = closed, null = pick
  const [detail, setDetail] = useState<RoiRow | null>(null);

  const { data: spend = [] } = useQuery({ queryKey: ["lead-source-spend"], queryFn: listLeadSourceSpend });
  const { data: leadSources = [] } = useQuery({ queryKey: ["lead-sources"], queryFn: listLeadSources });
  const { data: thresholds } = useQuery({ queryKey: ["marketing-settings"], queryFn: getMarketingSettings });
  const { data: overhead } = useQuery({ queryKey: ["overhead-settings"], queryFn: getOverheadSettings });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: sheets = [] } = useQuery({ queryKey: ["materials-sheets"], queryFn: () => listMaterialsSheets() });
  const { data: sections = [] } = useQuery({ queryKey: ["materials-sections-all"], queryFn: listAllMaterialsSections });
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: () => listPayments() });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => listExpenses() });

  // Won jobs: current contract value + gross / fully loaded profit.
  const burden = burdenPerHour(overhead ?? null);
  const hasOverhead = burden != null;
  const wonMoney = useMemo(() => {
    const fin = buildProjectFinancials(
      projects,
      groupBy<Quote>(quotes, (q) => q.project_id),
      groupBy<ChangeOrder>(changeOrders, (c) => c.project_id),
      groupBy<Payment>(payments, (p) => p.project_id),
      sheets,
      sections,
      groupBy<{ amount: number; project_id: string }>(expenses, (e) => e.project_id),
      [],
    );
    const sectionsBy = groupBy<MaterialsSection>(sections, (s) => s.project_id);
    const m = new Map<string, WonMoney>();
    for (const f of fin) {
      const rate = f.project.overhead_rate ?? burden;
      const oh = rate != null ? plannedManHours(sectionsBy.get(f.project.id) ?? []) * rate : null;
      m.set(f.project.id, { revenue: f.contractValue, grossProfit: f.profit, loadedProfit: f.profit != null && oh != null ? f.profit - oh : null });
    }
    return m;
  }, [projects, quotes, changeOrders, payments, sheets, sections, expenses, burden]);

  const { rows, totals, stillOpen } = useMemo(
    () =>
      buildRoiRows({
        leads: opportunities,
        spend,
        sources: leadSources.map((s) => ({ name: s.name, paid: s.paid ?? true })),
        period,
        openValue: (pid) => quoteValueByProjectId.get(pid) ?? 0,
        wonMoney: (pid) => wonMoney.get(pid) ?? null,
        hasOverhead,
      }),
    [opportunities, spend, leadSources, period, quoteValueByProjectId, wonMoney, hasOverhead],
  );

  const t = thresholds ?? { roas_good: 5, roas_min: 2, profit_good: 2, profit_min: 1 };
  const num = (v: number | null) => (v == null ? -Infinity : v);
  const { sorted, sortKey, dir, toggle } = useSort<RoiRow>(
    rows,
    {
      source: (r) => r.source,
      spend: (r) => num(r.spend),
      leads: (r) => r.leads,
      won: (r) => r.won,
      winRate: (r) => num(r.winRate),
      cpl: (r) => num(r.costPerLead),
      cpw: (r) => num(r.costPerWon),
      open: (r) => r.openValue,
      revenue: (r) => r.wonRevenue,
      roas: (r) => num(r.roas),
      profit: (r) => num(r.grossProfit),
      loaded: (r) => num(r.loadedProfit),
      ppd: (r) => num(r.profitPerDollar),
    },
    "leads",
  );

  const paidSources = leadSources.filter((s) => s.paid ?? true).map((s) => s.name);
  const chartData = rows.filter((r) => (r.spend ?? 0) > 0 || r.wonRevenue > 0).map((r) => ({ source: r.source, Spend: r.spend ?? 0, "Won revenue": r.wonRevenue }));
  const trendSources = rows.filter((r) => r.paid && (r.spend ?? 0) > 0 && r.leads > 0).map((r) => r.source).slice(0, 6);
  const trend = cplTrend(opportunities, spend, period.months, trendSources).map((p) => ({ ...p, label: monthLabel(p.month as string, period.months.length > 12) }));

  const year = String(new Date().getFullYear());
  const spendThisYear = spend.filter((s) => s.month.startsWith(year)).reduce((a, s) => a + s.amount, 0);
  const marketingItem = overhead?.items.find((i) => i.key === "marketing");
  const overheadMarketing = marketingItem?.amount != null ? annualAmount(marketingItem) : null;

  const periodLeads = opportunities.filter((o) => monthOfIso(o.created_at) >= period.from && monthOfIso(o.created_at) <= period.to);
  const detailLeads = detail ? periodLeads.filter((o) => sourceKey(o.lead_source).toLowerCase() === detail.source.toLowerCase()) : [];

  const tone = (v: number | null, good: number, min: number) => {
    const x = roiTone(v, good, min);
    return x ? ROI_TONE_CLASS[x] : "";
  };
  const cells = (r: RoiRow) => ({
    spend: r.paid ? money(r.spend) : dash,
    cpl: r.paid ? money(r.costPerLead) : dash,
    cpw: r.paid ? money(r.costPerWon) : dash,
    roas: r.paid ? fmtMultiple(r.roas) : dash,
    ppd: r.paid ? (r.profitPerDollar == null ? dash : formatCurrency(r.profitPerDollar)) : dash,
    profit: r.grossProfit == null ? dash : formatCurrency(r.grossProfit),
    loaded: r.loadedProfit == null ? dash : formatCurrency(r.loadedProfit),
    winRate: r.winRate == null ? dash : `${Math.round(r.winRate)}%`,
  });

  const cols: { key: string; label: string; text?: boolean }[] = [
    { key: "source", label: "Lead source", text: true },
    { key: "spend", label: "Spend" },
    { key: "leads", label: "Leads" },
    { key: "won", label: "Won" },
    { key: "winRate", label: "Win rate" },
    { key: "cpl", label: "Cost / lead" },
    { key: "cpw", label: "Cost / won job" },
    { key: "open", label: "Quote value (open)" },
    { key: "revenue", label: "Won revenue" },
    { key: "roas", label: "ROAS" },
    { key: "profit", label: "Won gross profit" },
    ...(hasOverhead ? [{ key: "loaded", label: "Fully loaded profit" }] : []),
    { key: "ppd", label: "Profit / $1" },
  ];

  return (
    <div className="space-y-4">
      {/* Period + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
          <SelectTrigger className="h-10 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom…</SelectItem>
          </SelectContent>
        </Select>
        {periodKey === "custom" && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input type="month" value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10 w-40" />
            to
            <Input type="month" value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10 w-40" />
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="How this is counted">
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            Leads count in the month they were created. Spend counts in its month. Won revenue and profit belong to the lead's source for leads created in this
            period — even if the job was won later. Totals are blended across all sources.
          </TooltipContent>
        </Tooltip>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="hidden h-10 md:inline-flex" onClick={() => setGridOpen(true)}>
            <Pencil className="mr-1.5 h-4 w-4" /> Edit spend
          </Button>
          <Button className="h-10 md:hidden" onClick={() => setFormSource(null)}>
            <Plus className="mr-1 h-4 w-4" /> Add spend
          </Button>
        </div>
      </div>

      {stillOpen > 0 && (
        <p className="rounded-lg bg-info/10 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold">Still open:</span> {pluralize(stillOpen, "lead")} from this period {stillOpen === 1 ? "is" : "are"} undecided — ROI for recent months
          will improve as they close.
        </p>
      )}
      {typeFiltered && <p className="text-xs text-muted-foreground">Filtered by job type — spend isn't split by type, so cost and ROAS use all of each source's spend.</p>}
      {overheadMismatch(spendThisYear, overheadMarketing) && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
          Your ad spend this year ({formatCurrency(spendThisYear)}) differs from Marketing in overhead ({formatCurrency(overheadMarketing ?? 0)}).{" "}
          <Link to="/settings/overhead" className="font-semibold text-primary">
            Update overhead?
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card-surface p-10 text-center text-muted-foreground">No leads or spend in this period.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-surface hidden overflow-x-auto p-0 md:block">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] font-bold uppercase tracking-wide text-muted-subtle">
                  {cols.map((c) => (
                    <SortableTh
                      key={c.key}
                      label={c.label}
                      active={sortKey === c.key}
                      dir={dir}
                      onClick={() => toggle(c.key, c.text)}
                      className={cn("px-3 py-3", !c.text && "text-right [&>span]:justify-end")}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const c = cells(r);
                  return (
                    <tr key={r.source} className="cursor-pointer border-b border-hairline hover:bg-muted/40" onClick={() => setDetail(r)}>
                      <td className="px-3 py-3 font-semibold text-foreground">
                        {r.source}
                        {!r.paid && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">free</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.spend}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.leads}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.won}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.winRate}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.cpl}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.cpw}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.openValue)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-success">{formatCurrency(r.wonRevenue)}</td>
                      <td className={cn("px-3 py-3 text-right font-bold tabular-nums", r.paid && tone(r.roas, t.roas_good, t.roas_min))}>{c.roas}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {c.profit}
                        {r.unknownProfit > 0 && <span className="text-muted-subtle"> *</span>}
                      </td>
                      {hasOverhead && <td className="px-3 py-3 text-right tabular-nums">{c.loaded}</td>}
                      <td className={cn("px-3 py-3 text-right font-bold tabular-nums", r.paid && tone(r.profitPerDollar, t.profit_good, t.profit_min))}>{c.ppd}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <TotalsRow r={totals} hasOverhead={hasOverhead} tone={tone} t={t} />
              </tfoot>
            </table>
            {totals.unknownProfit > 0 && (
              <p className="px-3 py-2 text-[11px] text-muted-subtle">* {pluralize(totals.unknownProfit, "won job")} without cost data yet — left out of profit.</p>
            )}
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {sorted.map((r) => {
              const c = cells(r);
              return (
                <button key={r.source} type="button" onClick={() => setDetail(r)} className="card-surface w-full p-4 text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">
                      {r.source}
                      {!r.paid && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">free</span>}
                    </span>
                    <span className={cn("text-lg font-extrabold tabular-nums", r.paid && tone(r.roas, t.roas_good, t.roas_min))}>{r.paid ? `${c.roas} ROAS` : ""}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Spend", c.spend],
                      ["Leads", `${r.leads} · ${r.won} won`],
                      ["Cost / job", c.cpw],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-muted/40 py-1.5">
                        <dt className="text-[11px] text-muted-foreground">{k}</dt>
                        <dd className="text-sm font-bold tabular-nums text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Won {formatCurrency(r.wonRevenue)} · profit {c.profit}
                    {r.paid && r.profitPerDollar != null && (
                      <span className={cn("font-semibold", tone(r.profitPerDollar, t.profit_good, t.profit_min))}> · {c.ppd} per $1</span>
                    )}
                  </p>
                </button>
              );
            })}
            <div className="card-surface p-4 text-sm">
              <p className="font-bold text-foreground">All sources</p>
              <p className="mt-1 text-muted-foreground">
                Spend {money(totals.spend)} · {pluralize(totals.leads, "lead")} · {totals.won} won · cost/lead {money(totals.costPerLead)} · ROAS{" "}
                <span className={cn("font-bold", tone(totals.roas, t.roas_good, t.roas_min))}>{fmtMultiple(totals.roas)}</span>
              </p>
            </div>
          </div>

          {/* Charts */}
          {chartData.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card-surface p-4">
                <h3 className="text-sm font-bold text-foreground">Spend vs won revenue</h3>
                <div className="mt-2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(206 24% 90%)" />
                      <XAxis dataKey="source" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)} width={48} />
                      <ChartTooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Spend" fill={SLATE} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Won revenue" fill={GREEN} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              {trendSources.length > 0 && (
                <section className="card-surface p-4">
                  <h3 className="text-sm font-bold text-foreground">Cost per lead by month</h3>
                  <div className="mt-2 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ left: 0, right: 8, top: 8 }}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(206 24% 90%)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={48} />
                        <ChartTooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {trendSources.map((s, i) => (
                          <Line key={s} type="monotone" dataKey={s} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* A source's leads for the period */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.source}</DialogTitle>
            <DialogDescription>
              {pluralize(detailLeads.length, "lead")} created {period.label.toLowerCase()}
              {detail?.paid ? ` · spend ${money(detail.spend)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
            {detailLeads.map((o) => {
              const meta = opportunityStageMeta(o.stage);
              const value = o.project_id ? (o.stage === "won" ? wonMoney.get(o.project_id)?.revenue : quoteValueByProjectId.get(o.project_id)) : undefined;
              return (
                <li key={o.id}>
                  <Link to={`/pipeline/${o.id}`} className="flex items-center gap-2 py-2.5 hover:text-primary">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{o.client?.name ?? "No client"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.title}</span>
                    </span>
                    <span className={meta.badge}>{meta.label}</span>
                    <span className="w-20 shrink-0 text-right text-sm tabular-nums">{value != null ? formatCurrency(value) : dash}</span>
                  </Link>
                </li>
              );
            })}
            {detailLeads.length === 0 && <li className="py-4 text-sm text-muted-foreground">No leads from this source in the period.</li>}
          </ul>
          {detail?.paid && (
            <Button variant="outline" className="h-10" onClick={() => (setFormSource(detail.source), setDetail(null))}>
              Monthly spend
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <SpendGridDialog open={gridOpen} onOpenChange={setGridOpen} sources={paidSources} months={period.months} spend={spend} />
      <SpendFormDialog
        open={formSource !== undefined}
        onOpenChange={(o) => !o && setFormSource(undefined)}
        sources={paidSources}
        fixedSource={formSource ?? null}
        spend={spend}
      />
    </div>
  );
}

function TotalsRow({
  r,
  hasOverhead,
  tone,
  t,
}: {
  r: RoiRow;
  hasOverhead: boolean;
  tone: (v: number | null, good: number, min: number) => string;
  t: { roas_good: number; roas_min: number; profit_good: number; profit_min: number };
}) {
  return (
    <tr className="bg-muted/40 font-bold">
      <td className="px-3 py-3 text-foreground">All sources</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(r.spend)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{r.leads}</td>
      <td className="px-3 py-3 text-right tabular-nums">{r.won}</td>
      <td className="px-3 py-3 text-right tabular-nums">{r.winRate == null ? dash : `${Math.round(r.winRate)}%`}</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(r.costPerLead)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(r.costPerWon)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(r.openValue)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-success">{formatCurrency(r.wonRevenue)}</td>
      <td className={cn("px-3 py-3 text-right tabular-nums", tone(r.roas, t.roas_good, t.roas_min))}>{fmtMultiple(r.roas)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{r.grossProfit == null ? dash : formatCurrency(r.grossProfit)}</td>
      {hasOverhead && <td className="px-3 py-3 text-right tabular-nums">{r.loadedProfit == null ? dash : formatCurrency(r.loadedProfit)}</td>}
      <td className={cn("px-3 py-3 text-right tabular-nums", tone(r.profitPerDollar, t.profit_good, t.profit_min))}>
        {r.profitPerDollar == null ? dash : formatCurrency(r.profitPerDollar)}
      </td>
    </tr>
  );
}
