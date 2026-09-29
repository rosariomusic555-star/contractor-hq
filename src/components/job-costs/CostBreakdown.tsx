import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FilterSegment } from "@/components/common/FilterControls";
import { COST_BUCKETS, COST_TYPE_SHORT_LABEL, type CostBucket } from "@/lib/costPlanMath";
import { VARIANCE_TONE_CLASS } from "@/lib/plannedActual";
import type { JobCostReport, MatrixCell, MatrixRow } from "@/lib/jobCosts";
import { cn, formatCurrency } from "@/lib/utils";

export interface CellFilter {
  featureId?: string | null | "labor";
  costType?: CostBucket;
}

const DOT: Record<MatrixCell["tone"], string> = { green: "bg-success", amber: "bg-warning", red: "bg-destructive", none: "bg-border" };

function Cell({ c, onClick, active }: { c: MatrixCell; onClick?: () => void; active?: boolean }) {
  if (c.planned === 0 && c.actual === 0) return <span className="block px-1.5 text-right text-muted-subtle">—</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("w-full rounded-md px-1.5 py-1 text-right tabular-nums hover:bg-muted/60", active && "bg-primary/10 ring-1 ring-primary/40")}
    >
      <span className="flex items-center justify-end gap-1.5 font-semibold text-foreground">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[c.tone])} />
        {formatCurrency(c.actual)}
      </span>
      <span className="block text-[11px] text-muted-subtle">of {formatCurrency(c.planned)}</span>
    </button>
  );
}

/**
 * Feature × cost type (or one row per cost type): actual of planned per
 * cell with a variance dot (the contractor's thresholds). Tapping a cell
 * filters the cost list to it. Labor logged for the whole job sits in its
 * own row, never split across features by guess.
 */
export function CostBreakdown({
  report,
  filter,
  onFilter,
}: {
  report: JobCostReport;
  filter: CellFilter | null;
  onFilter: (f: CellFilter | null) => void;
}) {
  const [mode, setMode] = useState<"feature" | "type">("feature");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const rows = mode === "feature" ? report.matrix : report.byType;
  const shownBuckets = COST_BUCKETS.filter((b) => rows.some((r) => r.cells[b].planned > 0 || r.cells[b].actual > 0));
  const isActive = (r: MatrixRow, b?: CostBucket) =>
    !!filter &&
    (mode === "feature" ? filter.featureId === (r.featureId ?? null) : filter.costType === r.featureId) &&
    (b ? filter.costType === b : mode === "type" || filter.costType == null);
  const pick = (r: MatrixRow, b?: CostBucket) => {
    const next: CellFilter = mode === "feature" ? { featureId: r.featureId, ...(b ? { costType: b } : {}) } : { costType: r.featureId as CostBucket };
    onFilter(isActive(r, b) ? null : next);
  };
  const totals = (b: CostBucket | "total"): MatrixCell => {
    const planned = rows.reduce((s, r) => s + (b === "total" ? r.total.planned : r.cells[b].planned), 0);
    const actual = rows.reduce((s, r) => s + (b === "total" ? r.total.actual : r.cells[b].actual), 0);
    return { planned, actual, tone: "none" };
  };

  return (
    <section className="card-surface space-y-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">Breakdown</h3>
        <FilterSegment
          options={[
            { value: "feature", label: "By feature" },
            { value: "type", label: "By cost type" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "feature" | "type")}
        />
      </div>
      {report.laborTracking === "project" && mode === "feature" && (
        <p className="text-xs text-muted-foreground">Labor is logged for the whole job, so it has its own row — feature labor cells show the plan.</p>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
              <th className="py-2 pr-2 text-left">{mode === "feature" ? "Feature" : "Cost type"}</th>
              {mode === "feature" && shownBuckets.map((b) => <th key={b} className="px-1.5 py-2 text-right">{COST_TYPE_SHORT_LABEL[b]}</th>)}
              <th className="py-2 pl-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline align-top last:border-0">
                <td className="py-1.5 pr-2 font-semibold text-foreground">{r.name}</td>
                {mode === "feature" &&
                  shownBuckets.map((b) => (
                    <td key={b} className="px-0.5 py-0.5">
                      <Cell c={r.cells[b]} onClick={() => pick(r, b)} active={isActive(r, b)} />
                    </td>
                  ))}
                <td className="py-0.5 pl-0.5">
                  <Cell c={r.total} onClick={() => pick(r)} active={isActive(r)} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-bold">
              <td className="py-2 pr-2 text-foreground">Total</td>
              {mode === "feature" && shownBuckets.map((b) => <td key={b} className="px-0.5 py-0.5"><Cell c={totals(b)} /></td>)}
              <td className="py-0.5 pl-0.5"><Cell c={totals("total")} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile — collapsible rows */}
      <div className="divide-y divide-hairline md:hidden">
        {rows.map((r) => {
          const open = openRow === r.key;
          return (
            <div key={r.key} className="py-2">
              <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpenRow(open ? null : r.key)} aria-expanded={open}>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{r.name}</span>
                <span className="text-right text-sm tabular-nums">
                  <span className={cn("font-bold", VARIANCE_TONE_CLASS[r.total.tone])}>{formatCurrency(r.total.actual)}</span>
                  <span className="block text-[11px] text-muted-subtle">of {formatCurrency(r.total.planned)}</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-subtle transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(mode === "feature" ? shownBuckets : []).map((b) => (
                    <div key={b} className="rounded-lg bg-muted/40 p-1.5">
                      <div className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">{COST_TYPE_SHORT_LABEL[b]}</div>
                      <Cell c={r.cells[b]} onClick={() => pick(r, b)} active={isActive(r, b)} />
                    </div>
                  ))}
                  <button type="button" className="col-span-2 rounded-lg border border-border py-1.5 text-xs font-semibold text-primary" onClick={() => pick(r)}>
                    {isActive(r) ? "Clear filter" : "Show these costs"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
