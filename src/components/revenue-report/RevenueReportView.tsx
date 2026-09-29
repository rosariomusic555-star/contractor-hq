import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Download, FileText, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FilterSegment } from "@/components/common/FilterControls";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRevenueData } from "@/hooks/use-revenue-data";
import { getBusinessProfile } from "@/lib/api";
import { downloadText } from "@/lib/jobCostsExport";
import { buildRevenuePdf, revenueCsv, revenueFilename } from "@/lib/revenueExport";
import {
  BASIS_META,
  comparePeriod,
  itemsIn,
  pctChange,
  PERIOD_OPTIONS,
  periodLabel,
  resolvePeriod,
  revenueReport,
  type BreakdownRow,
  type CompareKey,
  type PeriodKey,
  type RevenueBasis,
  type RevenueItem,
} from "@/lib/revenueReport";
import { cn, formatCurrency } from "@/lib/utils";
import { BreakdownTable, Card, Def, JobsTable, RecordsSheet, SeasonalityMap, type RecordRow } from "./RevenueSections";
import { amountCol, countCol, labelCol, pctText } from "./revenueCols";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const k = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 100) / 10}k` : `$${Math.round(v)}`);
const itemRows = (items: RevenueItem[]): RecordRow[] => items.map((i) => ({ key: i.key, label: i.label, date: i.date, amount: i.amount, href: i.href }));

/**
 * Revenue & profitability — historical performance: what was sold, billed,
 * collected and earned in a period, and where it came from. Every number is
 * from revenueReport() (the shared money helpers), each has its definition,
 * and each opens the records behind it. Period / compare / basis live in the
 * URL, so a link reopens the same view.
 */
export function RevenueReportView() {
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const periodKey = (params.get("period") as PeriodKey) || "ytd";
  const compareKey = (params.get("compare") as CompareKey) || "last_year";
  const basis = (params.get("basis") as RevenueBasis) || "collected";
  const custom = { start: params.get("from") ?? "", end: params.get("to") ?? "" };
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(key);
      else next.set(key, v);
    }
    setParams(next, { replace: true });
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [records, setRecords] = useState<{ title: string; description?: string; rows: RecordRow[] } | null>(null);
  const [showProfit, setShowProfit] = useState(false);

  const data = useRevenueData();
  const { data: business } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const period = useMemo(() => resolvePeriod(periodKey, periodKey === "custom" ? custom : undefined), [periodKey, custom.start, custom.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const compare = useMemo(() => comparePeriod(period, compareKey), [period, compareKey]);
  const report = useMemo(
    () =>
      data.ready
        ? revenueReport({
            ...data.profitInputs,
            invoices: data.invoices,
            payments: data.payments,
            clients: data.clients,
            opportunities: data.opportunities,
            crews: data.crews,
            spend: data.spend,
            period,
            compare,
            basis,
          })
        : null,
    [data, period, compare, basis],
  );

  const controls = (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <Select value={periodKey} onValueChange={(v) => set({ period: v })}>
        <SelectTrigger className="h-9 w-full md:w-40" aria-label="Period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {periodKey === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" value={custom.start} onChange={(e) => set({ from: e.target.value })} className="h-9" aria-label="From" />
          <span className="text-xs text-muted-subtle">–</span>
          <Input type="date" value={custom.end} onChange={(e) => set({ to: e.target.value })} className="h-9" aria-label="To" />
        </div>
      )}
      <Select value={compareKey} onValueChange={(v) => set({ compare: v })}>
        <SelectTrigger className="h-9 w-full md:w-52" aria-label="Compare to">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="previous">vs previous period</SelectItem>
          <SelectItem value="last_year">vs same period last year</SelectItem>
          <SelectItem value="none">No comparison</SelectItem>
        </SelectContent>
      </Select>
      <FilterSegment
        options={(Object.keys(BASIS_META) as RevenueBasis[]).map((b) => ({ value: b, label: BASIS_META[b].label }))}
        value={basis}
        onChange={(v) => set({ basis: v })}
      />
    </div>
  );

  if (!report) return <div className="py-16 text-center text-sm text-muted-foreground">Loading revenue…</div>;
  const h = report.headline;
  const delta = (now: number, before: number | null | undefined) => {
    if (!compare) return null;
    const pc = pctChange(now, before);
    return pc == null ? <span className="text-muted-subtle">vs {formatCurrency(before ?? 0)}</span> : <span className={pc >= 0 ? "text-success" : "text-destructive"}>{pc >= 0 ? "▲" : "▼"} {Math.abs(pc).toFixed(0)}% vs {formatCurrency(before ?? 0)}</span>;
  };
  const open = (title: string, rows: RecordRow[], description?: string) => setRecords({ title, rows, description });
  const completedRows = (jobs = report.completed): RecordRow[] =>
    jobs.map((j) => {
      const row = report.jobs.find((x) => x.projectId === j.projectId);
      return { key: j.projectId, label: row?.name ?? "Job", sub: `price ${formatCurrency(j.price)} · margin ${pctText(j.price > 0 ? (j.profit / j.price) * 100 : null)}${j.source === "closeout" ? " · closeout" : ""}`, date: j.completedOn, amount: j.profit, href: `/projects/${j.projectId}` };
    });

  const Metric = ({ label, def, value, sub, onClick, className }: { label: string; def: string; value: string; sub?: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button type="button" onClick={onClick} className={cn("kpi-card group min-w-[160px] snap-start text-left transition-shadow hover:shadow-card-hover", className)}>
      <div className="flex items-center gap-1.5">
        <span className="kpi-card-label">{label}</span>
        <Def text={def} />
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs">{sub}</div>}
    </button>
  );

  const basisItems = report.items[basis];
  const featureOptions = [...new Map(data.profitInputs.features.filter((f) => f.status === "active").map((f) => [f.category_id ?? "", data.categories.find((c) => c.id === f.category_id)?.name ?? "Feature"])).entries()]
    .filter(([id]) => id)
    .map(([id, label]) => ({ id, label }));
  const exportInput = { report, period, compare, basis, businessName: business?.company_name ?? null };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isMobile ? (
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            {PERIOD_OPTIONS.find((o) => o.key === periodKey)?.label} · {BASIS_META[basis].label}
          </Button>
        ) : (
          controls
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" /> Export report
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => downloadText(revenueFilename(period, "csv"), revenueCsv(exportInput))}>CSV (jobs + breakdowns)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => buildRevenuePdf(exportInput).save(revenueFilename(period, "pdf"))}>
              <FileText className="mr-2 h-3.5 w-3.5" /> PDF summary
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-xs text-muted-foreground">
        {periodLabel(period)}
        {compare ? ` · compared with ${periodLabel(compare)}` : ""} · <span className="font-semibold text-foreground">{BASIS_META[basis].label}:</span> {BASIS_META[basis].help}
      </p>

      {/* Headline — swipeable on phones */}
      <div className={cn(isMobile ? "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1" : "grid grid-cols-2 gap-3 lg:grid-cols-4")}>
        <Metric label="Booked" def={BASIS_META.booked.help} value={formatCurrency(h.now.booked)} sub={delta(h.now.booked, h.before?.booked)} onClick={() => open("Booked", itemRows(itemsIn(report.items.booked, period)), BASIS_META.booked.help)} />
        <Metric label="Invoiced" def={BASIS_META.invoiced.help} value={formatCurrency(h.now.invoiced)} sub={delta(h.now.invoiced, h.before?.invoiced)} onClick={() => open("Invoiced", itemRows(itemsIn(report.items.invoiced, period)), BASIS_META.invoiced.help)} />
        <Metric
          label="Collected"
          def={`${BASIS_META.collected.help} Card processing fees aren't tracked (no online payments yet), so this is also net collected.`}
          value={formatCurrency(h.now.collected)}
          sub={delta(h.now.collected, h.before?.collected)}
          onClick={() => open("Collected", itemRows(itemsIn(report.items.collected, period)), BASIS_META.collected.help)}
        />
        <Metric
          label="Gross profit"
          def="Profit on jobs completed in the period — the job's closeout when it has one, otherwise the live Planned vs actual numbers. Margin = total profit ÷ total price (dollar-weighted)."
          value={formatCurrency(h.profit.profit)}
          sub={
            <span className="text-muted-foreground">
              {pctText(h.profit.marginPct)} margin · {h.profit.count} completed
              {h.profitBefore && compare ? ` · was ${pctText(h.profitBefore.marginPct)}` : ""}
            </span>
          }
          onClick={() => open("Completed jobs — gross profit", completedRows())}
        />
        {h.profit.fullyLoaded != null && (
          <Metric
            label="Fully loaded profit"
            def="Gross profit minus overhead applied through each job's labor hours (the job's own overhead rate, else your current one)."
            value={formatCurrency(h.profit.fullyLoaded)}
            sub={<span className="text-muted-foreground">{pctText(h.profit.fullyLoadedPct)} margin</span>}
            onClick={() => open("Completed jobs — fully loaded", completedRows())}
          />
        )}
        <Metric
          label="Jobs won"
          def="Original contracts signed in the period (add-ons and change orders not counted as new jobs)."
          value={String(h.jobsWon)}
          sub={compare ? <span className="text-muted-subtle">vs {h.jobsWonBefore ?? 0}</span> : undefined}
          onClick={() => open("Jobs won", itemRows(itemsIn(report.items.booked, period).filter((i) => i.kind === "original")))}
        />
        <Metric
          label="Average job"
          def="Average signed original contract among jobs won in the period."
          value={h.avgJob == null ? "—" : formatCurrency(h.avgJob)}
          sub={compare && h.avgJobBefore != null ? delta(h.avgJob ?? 0, h.avgJobBefore) : undefined}
          onClick={() => open("Jobs won", itemRows(itemsIn(report.items.booked, period).filter((i) => i.kind === "original")))}
        />
        <Metric
          label="Upsell"
          def="Change orders and add-on quotes signed in the period, and their share of booked revenue."
          value={formatCurrency(h.upsell)}
          sub={<span className="text-muted-foreground">{pctText(h.upsellPct)} of booked</span>}
          onClick={() => open("Change orders + add-ons", itemRows(itemsIn(report.items.booked, period).filter((i) => i.kind !== "original")))}
        />
      </div>

      {/* Trend */}
      <Card
        title={`${BASIS_META[basis].label} by month`}
        def="The selected basis per month (bars) with the same month a year earlier (line). Profit overlay: jobs completed that month."
        right={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showProfit} onCheckedChange={setShowProfit} /> Profit
          </label>
        }
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={report.trend.map((t) => ({ ...t, label: `${MONTH[Number(t.month.slice(5)) - 1]}${t.month.slice(5) === "01" ? ` ’${t.month.slice(2, 4)}` : ""}`, value: t[basis] }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={isMobile ? 1 : 0} />
              <YAxis tickFormatter={k} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={isMobile ? 40 : 52} />
              <ChartTooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="value"
                name={BASIS_META[basis].label}
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                onClick={(d: { month: string }) => {
                  const [y, m] = d.month.split("-").map(Number);
                  const p = { key: "compare" as const, start: new Date(y, m - 1, 1), end: new Date(y, m, 1), label: "" };
                  open(`${BASIS_META[basis].label} · ${MONTH[m - 1]} ${y}`, itemRows(itemsIn(basisItems, p)));
                }}
                cursor="pointer"
              />
              {compare && <Line type="monotone" dataKey="lastYear" name="Year before" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" dot={false} />}
              {showProfit && <Line type="monotone" dataKey="profit" name="Profit (completed)" stroke="hsl(var(--info))" strokeWidth={2} connectNulls dot />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="By feature" def="Booked in the period, split by the quote / change order section's feature. Margin: jobs completed in the period, from their feature-level price and cost.">
          <BreakdownTable
            rows={report.byFeature}
            empty="Nothing booked in this period."
            cols={[labelCol("Feature"), amountCol("Booked"), countCol(), { key: "avg", label: "Avg / job", right: true, render: (r) => (r.extra?.avg == null ? "—" : formatCurrency(r.extra.avg as number)), sort: (r) => (r.extra?.avg as number) ?? 0 }, { key: "margin", label: "Margin", right: true, render: (r) => pctText(r.extra?.marginPct as number | null), sort: (r) => (r.extra?.marginPct as number) ?? -999 }]}
          />
        </Card>
        <Card
          title="By lead source"
          def="Revenue booked in the period by the job's lead source, and ROAS = that revenue ÷ ad spend in the same months. The Marketing report has the lead-by-lead detail."
          right={<Link to="/pipeline" className="text-[13px] font-semibold text-primary">Marketing report</Link>}
        >
          <BreakdownTable
            rows={report.byLeadSource}
            empty="Nothing booked in this period."
            onRow={(r) => open(`Booked · ${r.label}`, itemRows(itemsIn(report.items.booked, period).filter((i) => (i.projectId && data.opportunities.find((o) => o.project_id === i.projectId)?.lead_source?.trim()) === r.key || (r.key === "Unknown" && !data.opportunities.find((o) => o.project_id === i.projectId)?.lead_source))))}
            cols={[labelCol("Source"), amountCol("Won"), countCol(), { key: "roas", label: "ROAS", right: true, render: (r) => (r.extra?.roas == null ? "—" : `${(r.extra.roas as number).toFixed(1)}×`), sort: (r) => (r.extra?.roas as number) ?? -1 }]}
          />
        </Card>
        <Card title="By client" def={`${BASIS_META[basis].label} per client in the period. Repeat = two or more signed jobs; maintenance = has a maintenance job.`}>
          <BreakdownTable
            rows={report.byClient.slice(0, 15)}
            empty="Nothing in this period."
            onRow={(r) => open(`${BASIS_META[basis].label} · ${r.label}`, itemRows(itemsIn(basisItems, period).filter((i) => (i.clientId ?? "none") === r.key)))}
            cols={[labelCol("Client", true), amountCol(BASIS_META[basis].label), countCol("Records")]}
          />
        </Card>
        <Card title="By crew" def="Price and profit of jobs completed in the period, by the crew assigned.">
          <BreakdownTable
            rows={report.byCrew}
            empty="No completed jobs in this period."
            onRow={(r) => open(`Completed · ${r.label}`, completedRows(report.completed.filter((j) => (data.profitInputs.projects.find((p) => p.id === j.projectId)?.crew_id ?? "none") === r.key)))}
            cols={[labelCol("Crew"), amountCol("Revenue"), { key: "profit", label: "Profit", right: true, render: (r) => formatCurrency(r.extra?.profit as number), sort: (r) => r.extra?.profit as number }, { key: "margin", label: "Margin", right: true, render: (r) => pctText(r.extra?.marginPct as number | null), sort: (r) => (r.extra?.marginPct as number) ?? -999 }, countCol()]}
          />
        </Card>
        <Card title="Revenue type" def="Booked in the period: original contracts, change orders, add-on quotes, and maintenance jobs (jobs that came from a maintenance reminder).">
          <BreakdownTable
            rows={report.revenueType}
            empty="Nothing booked in this period."
            onRow={(r) => open(r.label, itemRows(itemsIn(report.items.booked, period).filter((i) => (r.key === "maintenance" ? i.kind === "original" && isMaint(i.projectId) : i.kind === r.key && !(r.key === "original" && isMaint(i.projectId))))))}
            cols={[labelCol("Type"), amountCol("Booked"), countCol("Count")]}
          />
        </Card>
        <Card title="Payment methods" def="Collected in the period by how it was paid. Processing fees aren't tracked (no online payments yet).">
          <BreakdownTable
            rows={report.paymentMethods}
            empty="Nothing collected in this period."
            onRow={(r) => open(`Collected · ${r.label}`, itemRows(itemsIn(report.items.collected, period).filter((i) => (i.method ?? "other") === r.key)))}
            cols={[labelCol("Method"), amountCol("Collected"), countCol("Payments")]}
          />
        </Card>
      </div>

      <Card title="Jobs" def="Every job with something in the period — signed, invoiced, paid, or completed.">
        <JobsTable
          jobs={report.jobs}
          featureOptions={featureOptions}
          crewOptions={data.crews.map((c) => ({ id: c.id, label: c.name }))}
          sourceOptions={[...new Set(report.jobs.map((j) => j.leadSource))].sort()}
          showLoaded={report.jobs.some((j) => j.fullyLoaded != null)}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Adjustments & reconciliation" def="What sits between collected and applied to invoices, and what was reversed.">
          <ul className="space-y-2 text-sm">
            <li>
              <button type="button" className="flex w-full items-baseline justify-between gap-2 text-left hover:underline" onClick={() => open("Unapplied credit received", report.unallocated.map((u) => ({ key: u.id, label: u.label, date: u.paidOn, amount: u.amount, href: u.projectId ? `/projects/${u.projectId}/invoices` : null })))}>
                <span className="text-foreground">Unapplied credit received <span className="text-xs text-muted-subtle">(collected, not yet on an invoice)</span></span>
                <span className="font-semibold tabular-nums">{formatCurrency(report.unallocated.reduce((s, u) => s + u.amount, 0))} · {report.unallocated.length}</span>
              </button>
            </li>
            <li>
              <button type="button" className="flex w-full items-baseline justify-between gap-2 text-left hover:underline" onClick={() => open("Payments voided", report.voided.map((u) => ({ key: u.id, label: u.label, sub: u.reason, date: u.voidedAt, amount: u.amount, href: u.projectId ? `/projects/${u.projectId}/invoices` : null })))}>
                <span className="text-foreground">Payments voided <span className="text-xs text-muted-subtle">(not in collected)</span></span>
                <span className="font-semibold tabular-nums">{formatCurrency(report.voided.reduce((s, u) => s + u.amount, 0))} · {report.voided.length}</span>
              </button>
            </li>
            <li className="text-xs text-muted-subtle">
              Refunds and disputes, card processing fees, sales tax and QuickBooks sync status aren't tracked yet — they'll show here once online payments, invoice tax and QuickBooks are on.
            </li>
          </ul>
          <p className="border-t border-hairline pt-2 text-xs text-muted-foreground">
            Receivables, aging and the cash forecast are forward-looking — they live on <Link to="/business-health" className="font-semibold text-primary">Business health</Link>.
          </p>
        </Card>
        <Card title="Seasonality" def={`${BASIS_META[basis].label} by month for every year — your busy and slow months.`}>
          <SeasonalityMap
            rows={report.seasonality}
            onCell={(y, m) => {
              const p = { key: "compare" as const, start: new Date(y, m, 1), end: new Date(y, m + 1, 1), label: "" };
              open(`${BASIS_META[basis].label} · ${MONTH[m]} ${y}`, itemRows(itemsIn(basisItems, p)));
            }}
          />
        </Card>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-5">
          <SheetHeader className="text-left">
            <SheetTitle>Report settings</SheetTitle>
          </SheetHeader>
          <div className="mt-3">{controls}</div>
          <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>Done</Button>
        </SheetContent>
      </Sheet>
      <RecordsSheet open={!!records} onOpenChange={(v) => !v && setRecords(null)} title={records?.title ?? ""} description={records?.description} rows={records?.rows ?? []} />
    </div>
  );

  function isMaint(projectId: string | null) {
    const p = projectId ? data.profitInputs.projects.find((x) => x.id === projectId) : undefined;
    return !!p?.opportunities?.some((o) => o.source_project_id);
  }
}

