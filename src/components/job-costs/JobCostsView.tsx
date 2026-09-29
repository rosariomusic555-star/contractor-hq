import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, FileText, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KpiCard } from "@/components/common/KpiCard";
import { useJobCosts } from "@/hooks/use-job-costs";
import { getBusinessProfile, type Expense } from "@/lib/api";
import { activeFeatures, featureName } from "@/lib/features";
import type { CostBucket } from "@/lib/costPlanMath";
import { JOB_COST_STATUS_META, type JobCostReport } from "@/lib/jobCosts";
import { downloadJobCostsPdf, downloadText, jobCostsCsv, jobCostsFilename } from "@/lib/jobCostsExport";
import { cn, formatCurrency, formatDate, pluralize } from "@/lib/utils";
import { CostBreakdown, type CellFilter } from "./CostBreakdown";
import { CostList } from "./CostList";
import { CostTrendChart } from "./CostTrendChart";
import { ExpenseSheet } from "./ExpenseSheet";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;

/**
 * The project's job-cost view (internal). Every number comes from
 * jobCostReport() — the Cost plan, expenses, timesheet labor, deliveries
 * and the Planned vs actual rules — so it matches the Cost plan, the
 * project's Profit summary, Business health and the closeout.
 */
export function JobCostsView({ projectId }: { projectId: string }) {
  const data = useJobCosts(projectId);
  const { data: business } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const [cellFilter, setCellFilter] = useState<CellFilter | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; editing: Expense | null; scanFile?: File | null; defaults?: { feature_id?: string | null; cost_type?: CostBucket | null } }>({ open: false, editing: null });
  // Scan receipt opens the camera / file picker straight from the click
  // (browsers only allow that on a user gesture), then the sheet reads it.
  const scanInput = useRef<HTMLInputElement>(null);

  const live = useMemo(() => (data ? activeFeatures(data.features) : []), [data]);
  if (!data) return <div className="py-16 text-center text-sm text-muted-foreground">Loading job costs…</div>;
  const { report: r, project, categories, expenseCategories, expenses } = data;
  const featName = (id: string | null) => {
    const f = id ? live.find((x) => x.id === id) : undefined;
    return f ? featureName(f, categories) : "General";
  };
  const catName = (id: string | null) => (id ? (expenseCategories.find((c) => c.id === id)?.name ?? "—") : "Uncategorized");
  const meta = JOB_COST_STATUS_META[r.status];

  const exportCsv = () =>
    downloadText(jobCostsFilename(project.name, "csv"), jobCostsCsv({ projectName: project.name, report: r, featureName: featName, categoryName: catName }));
  const exportPdf = () =>
    downloadJobCostsPdf({
      projectName: project.name,
      clientName: project.client?.name ?? null,
      businessName: business?.company_name ?? null,
      report: r,
      featureName: featName,
      categoryName: catName,
    });

  const cellToDefaults = (): { feature_id?: string | null; cost_type?: CostBucket | null } =>
    cellFilter && cellFilter.featureId !== "labor" ? { feature_id: (cellFilter.featureId as string | null) ?? null, cost_type: cellFilter.costType ?? null } : {};

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={meta.className}>{meta.label}</span>
          <span className="text-xs text-muted-foreground">Internal — clients and crew never see this.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => scanInput.current?.click()}>
            <ScanLine className="mr-1.5 h-4 w-4" /> Scan receipt
          </Button>
          <input
            ref={scanInput}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setSheet({ open: true, editing: null, scanFile: file, defaults: cellToDefaults() });
            }}
          />
          <Button size="sm" className="font-bold" onClick={() => setSheet({ open: true, editing: null, defaults: cellToDefaults() })}>
            <Plus className="mr-1.5 h-4 w-4" /> Add expense
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={exportCsv}>Job costs · CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportPdf}>
                <FileText className="mr-2 h-3.5 w-3.5" /> Job costs · PDF (internal)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Actual to date" value={formatCurrency(r.actual)} sub={r.labor.pendingCost > 0 ? `incl. ${formatCurrency(r.labor.pendingCost)} pending labor` : `${pct(r.spentPct)} of plan`} />
        <KpiCard label="Planned" value={formatCurrency(r.planned)} sub="Cost plan incl. approved changes" />
        <KpiCard label="Remaining budget" value={formatCurrency(r.remaining)} subTone={r.remaining < 0 ? "negative" : "muted"} sub={r.remaining < 0 ? "over the plan" : "left to spend"} />
        <KpiCard
          label="Variance"
          value={signed(r.variance)}
          subTone={r.variance > 0 ? "negative" : "muted"}
          sub={r.variance > 0 ? `${pct(r.variancePct)} over — overruns so far` : project.status === "complete" ? "final" : "no overruns so far"}
        />
        <KpiCard
          label="Projected profit"
          value={formatCurrency(r.profit.projected)}
          subTone={r.profit.projected < r.profit.expected ? "negative" : "muted"}
          sub={
            r.profit.projectedFullyLoaded != null
              ? `${formatCurrency(r.profit.projectedFullyLoaded)} fully loaded · plan ${formatCurrency(r.profit.expected)}`
              : `plan ${formatCurrency(r.profit.expected)}`
          }
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <ProgressStrip r={r} />

      {r.unassignedCount > 0 && live.length > 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
          {pluralize(r.unassignedCount, "expense")} {r.unassignedCount === 1 ? "isn't" : "aren't"} assigned to a feature — they count under General. Filter the list by "Not assigned" to assign them.
        </p>
      )}

      <CostBreakdown report={r} filter={cellFilter} onFilter={setCellFilter} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LaborSection r={r} />
        <MaterialsSection r={r} projectId={projectId} featName={featName} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card-surface p-4 md:p-5">
          <h3 className="mb-2 text-base font-bold text-foreground">Spend over time</h3>
          <CostTrendChart
            series={r.series}
            planned={r.planned}
            milestones={[
              ...(project.actual_start_date ? [{ date: project.actual_start_date, label: "Start" }] : []),
              ...(project.actual_end_date ? [{ date: project.actual_end_date, label: "Done" }] : []),
            ]}
          />
        </section>
        <section className="card-surface p-4 md:p-5">
          <h3 className="mb-2 text-base font-bold text-foreground">Vendors</h3>
          {r.vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a vendor to expenses to see who you're spending with.</p>
          ) : (
            <ul className="space-y-1.5">
              {r.vendors.slice(0, 8).map((v) => (
                <li key={v.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    {v.name} <span className="text-xs text-muted-subtle">· {v.count}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(v.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CostList
        projectId={projectId}
        rows={r.rows}
        expenses={expenses}
        features={live}
        categories={categories}
        expenseCategories={expenseCategories}
        cellFilter={cellFilter}
        onClearCellFilter={() => setCellFilter(null)}
        onEdit={(e) => setSheet({ open: true, editing: e })}
      />

      <ExpenseSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        projectId={projectId}
        editing={sheet.editing}
        features={live}
        categories={categories}
        expenseCategories={expenseCategories}
        report={r}
        defaults={sheet.defaults}
        scanFile={sheet.scanFile ?? null}
      />
    </div>
  );
}

/** Spend vs how far through the job it is (working days, weather days apart). */
function ProgressStrip({ r }: { r: JobCostReport }) {
  const spent = Math.min(100, r.spentPct ?? 0);
  const p = r.progress;
  return (
    <section className="card-surface space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-foreground">
          {pct(r.spentPct)} spent
          {p.pct != null && <span className="text-muted-foreground"> · {pct(p.pct)} of the way through the job</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {!p.started
            ? "Not started yet"
            : p.estimateDays
              ? `Day ${p.elapsedDays ?? 0} of ${p.estimateDays} working days${p.weatherDays ? ` · ${pluralize(p.weatherDays, "weather day")} not counted` : ""}`
              : "Set an estimated duration to compare spend with progress"}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", (r.spentPct ?? 0) > 100 ? "bg-destructive" : p.spendAhead ? "bg-warning" : "bg-primary")} style={{ width: `${spent}%` }} />
        {p.pct != null && <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `calc(${Math.min(100, p.pct)}% - 1px)` }} title="How far through the job" />}
      </div>
      {p.spendAhead && (
        <p className="flex items-start gap-1.5 text-xs text-warning-strong">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Spending is running ahead of the job's progress — worth a look before costs outrun the plan. (Materials bought up front often do this early on.)
        </p>
      )}
    </section>
  );
}

function LaborSection({ r }: { r: JobCostReport }) {
  const l = r.labor;
  const actual = l.approvedCost + l.pendingCost;
  return (
    <section className="card-surface space-y-3 p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">Labor</h3>
        <Link to="/timesheets" className="text-[13px] font-semibold text-primary">Timesheets</Link>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Approved</div>
          <div className="font-bold tabular-nums">{l.approvedHours} h</div>
          <div className="text-xs text-muted-foreground">{formatCurrency(l.approvedCost)}{l.otHours > 0 ? ` · ${l.otHours} h OT` : ""}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Planned</div>
          <div className="font-bold tabular-nums">{l.plannedHours} h</div>
          <div className="text-xs text-muted-foreground">{formatCurrency(l.plannedCost)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Variance</div>
          <div className={cn("font-bold tabular-nums", actual > l.plannedCost ? "text-destructive" : "text-foreground")}>{signed(l.variance)}</div>
          <div className="text-xs text-muted-foreground">{l.plannedHours > 0 ? `${Math.round(((l.approvedHours + l.pendingHours) / l.plannedHours) * 100)}% of hours` : "—"}</div>
        </div>
      </div>
      {l.pendingHours > 0 && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {l.pendingHours} h waiting for approval (≈ {formatCurrency(l.pendingCost)}) — included in actual cost at the current rates.
        </p>
      )}
      {l.people.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
              <th className="py-1 text-left">Who</th>
              <th className="py-1 text-right">Hours</th>
              <th className="py-1 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {l.people.map((p) => (
              <tr key={p.name} className="border-t border-hairline">
                <td className="py-1.5 text-foreground">{p.name}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {p.approvedHours}
                  {p.otHours > 0 && <span className="text-xs text-muted-subtle"> ({p.otHours} OT)</span>}
                  {p.pendingHours > 0 && <span className="text-xs text-muted-subtle"> +{p.pendingHours} pending</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(p.approvedCost + p.pendingCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No hours logged yet — labor comes from approved timesheets and the labor log.</p>
      )}
      {l.manualLaborCount > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" />
          {pluralize(l.manualLaborCount, "manual expense")} ({formatCurrency(l.manualLaborExpenses)}) {l.manualLaborCount === 1 ? "is" : "are"} typed as Labor while timesheet labor exists — possibly counted twice. Labor should come from timesheets; retype {l.manualLaborCount === 1 ? "it" : "them"} if {l.manualLaborCount === 1 ? "it's" : "they're"} really a subcontractor or other cost.
        </p>
      )}
    </section>
  );
}

function MaterialsSection({ r, projectId, featName }: { r: JobCostReport; projectId: string; featName: (id: string | null) => string }) {
  const m = r.materials;
  const [showAll, setShowAll] = useState(false);
  const lines = showAll ? m.lines : m.lines.slice(0, 8);
  return (
    <section className="card-surface space-y-3 p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">Materials</h3>
        <Link to={`/projects/${projectId}/materials`} className="text-[13px] font-semibold text-primary">Cost plan</Link>
      </div>
      {!m.counted && m.deliveredTotal > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatCurrency(m.deliveredTotal)} delivered so far — tracked here, counted in the totals once the job is Complete and reconciled.
        </p>
      )}
      {m.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No material lines on the Cost plan.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
                <th className="py-1 text-left">Line</th>
                <th className="py-1 text-right">Planned</th>
                <th className="py-1 text-right">Delivered</th>
                <th className="py-1 text-right">Used</th>
                <th className="py-1 text-right">Cost var.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-hairline">
                  <td className="max-w-[180px] py-1.5">
                    <Link to={`/projects/${projectId}/materials`} className="block truncate text-foreground hover:underline" title={l.name}>{l.name}</Link>
                    <span className="block truncate text-[11px] text-muted-subtle">{featName(l.featureId)}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {l.plannedQty} <span className="text-[11px] text-muted-subtle">{l.unit}</span>
                    <span className="block text-[11px] text-muted-subtle">{formatCurrency(l.plannedCost)}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{l.deliveredQty || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.usedQty || "—"}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", l.variance != null && l.variance > 0 ? "text-destructive" : "text-foreground")}>
                    {l.variance != null ? signed(l.variance) : l.partial ? <span className="text-xs text-muted-subtle">partial</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {m.lines.length > 8 && (
            <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${m.lines.length} lines`}
            </button>
          )}
        </div>
      )}
      {m.deliveries.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Deliveries</div>
          <ul className="space-y-1">
            {m.deliveries.map((d) => (
              <li key={d.orderId} className="flex items-baseline justify-between gap-2 text-sm">
                <Link to={`/projects/${projectId}/material-orders`} className="min-w-0 truncate text-foreground hover:underline">
                  {d.supplier ?? "Supplier"} · {d.date ? formatDate(d.date) : "no date"}
                  <span className="text-xs text-muted-subtle"> · {d.status}{d.unplannedLines ? ` · ${d.unplannedLines} unplanned` : ""}</span>
                </Link>
                <span className="shrink-0 tabular-nums">{d.deliveredAmount > 0 ? formatCurrency(d.deliveredAmount) : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(m.unplannedDeliveredCost > 0 || m.materialExpenseCount > 0) && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {m.unplannedDeliveredCost > 0 && <>Unplanned material delivered: {formatCurrency(m.unplannedDeliveredCost)} (not on any Cost plan line). </>}
          {m.materialExpenseCount > 0 && (
            <>
              {pluralize(m.materialExpenseCount, "material expense")} ({formatCurrency(m.materialExpenses)}) logged by hand — not matched to a Cost plan line
              {m.deliveredTotal > 0 ? "; if it's the bill for a delivery above, it's the same material (deliveries only count once reconciled)." : "."}
            </>
          )}
        </p>
      )}
    </section>
  );
}
