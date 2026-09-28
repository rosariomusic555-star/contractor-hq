import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { COST_BUCKETS, COST_TYPE_GROUP_LABEL } from "@/lib/costPlanMath";
import type { FeatureReport } from "@/lib/featureFinancials";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;
const overClass = (v: number) => (v > 0.5 ? "text-destructive" : v < -0.5 ? "text-success" : "text-foreground");

/** Planned vs actual by cost type for one feature. */
function TypeTable({ r }: { r: FeatureReport }) {
  const rows = COST_BUCKETS.filter((k) => r.planned[k] > 0 || r.actual[k] > 0);
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Nothing planned or spent yet.</p>;
  return (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-subtle">
          <th className="py-1 font-bold">Type</th>
          <th className="py-1 text-right font-bold">Planned</th>
          <th className="py-1 text-right font-bold">Actual</th>
          <th className="py-1 text-right font-bold">Variance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k) => (
          <tr key={k} className="border-t border-hairline">
            <td className="py-1.5 text-foreground">{COST_TYPE_GROUP_LABEL[k]}</td>
            <td className="py-1.5 text-right">{formatCurrency(r.planned[k])}</td>
            <td className="py-1.5 text-right">{r.actual[k] ? formatCurrency(r.actual[k]) : "—"}</td>
            <td className={cn("py-1.5 text-right font-semibold", overClass(r.actual[k] - r.planned[k]))}>
              {r.actual[k] ? signed(r.actual[k] - r.planned[k]) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The strip at the bottom of a Cost plan feature section once the job is
 * Won: planned vs actual, variance, price and margin planned → actual, with
 * the by-type breakdown one tap away.
 */
export function FeatureReportStrip({ report: r }: { report: FeatureReport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 text-left" aria-expanded={open}>
        <Metric label="Planned" value={formatCurrency(r.planned.total)} />
        <Metric label="Actual" value={r.actual.total ? formatCurrency(r.actual.total) : "—"} />
        <Metric
          label="Variance"
          value={r.actual.total ? `${signed(r.varianceCost)}${r.variancePct != null ? ` (${r.variancePct > 0 ? "+" : ""}${Math.round(r.variancePct)}%)` : ""}` : "—"}
          className={r.actual.total ? overClass(r.varianceCost) : undefined}
        />
        {r.featureId && <Metric label="Price" value={formatCurrency(r.price)} />}
        {r.featureId && <Metric label="Margin" value={`${pct(r.plannedMarginPct)} → ${r.actual.total ? pct(r.actualMarginPct) : "—"}`} />}
        <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-muted-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3">
          <TypeTable r={r} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-subtle">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums text-foreground", className)}>{value}</div>
    </div>
  );
}

/**
 * The project Profit Summary's per-feature breakdown: price, planned and
 * actual cost, variance and margin per feature (+ General). Rows add up to
 * the project totals above. A table on desktop, stacked cards on phones;
 * each row opens its by-type breakdown.
 */
export function FeatureProfitTable({ reports, projected = false }: { reports: FeatureReport[]; /** Job still open — "actual" is spend so far or plan, whichever is more. */ projected?: boolean }) {
  const actualLabel = projected ? "Projected" : "Actual";
  const [openId, setOpenId] = useState<string | null>(null);
  const keyOf = (r: FeatureReport) => r.featureId ?? "general";
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold text-foreground">By feature</h4>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-2 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-subtle md:grid">
        <span>Feature</span>
        <span className="text-right">Price</span>
        <span className="text-right">Planned</span>
        <span className="text-right">{actualLabel}</span>
        <span className="text-right">Variance</span>
        <span className="text-right">Margin</span>
      </div>
      {reports.map((r) => {
        const open = openId === keyOf(r);
        return (
          <div key={keyOf(r)} className="rounded-xl border border-hairline">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : keyOf(r))}
              aria-expanded={open}
              className="grid w-full grid-cols-2 gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm tabular-nums md:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] md:items-center md:gap-2"
            >
              <span className="col-span-2 flex min-w-0 items-center gap-1.5 font-semibold text-foreground md:col-span-1">
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-subtle transition-transform", open && "rotate-180")} />
                <span className="truncate">{r.name}</span>
              </span>
              <Cell label="Price" value={r.featureId || r.price ? formatCurrency(r.price) : "—"} />
              <Cell label="Planned" value={formatCurrency(r.planned.total)} />
              <Cell label={actualLabel} value={r.actual.total ? formatCurrency(r.actual.total) : "—"} />
              <Cell label="Variance" value={r.actual.total ? signed(r.varianceCost) : "—"} className={r.actual.total ? overClass(r.varianceCost) : undefined} />
              <Cell label="Margin" value={r.price ? `${pct(r.plannedMarginPct)} → ${r.actual.total ? pct(r.actualMarginPct) : "—"}` : "—"} />
            </button>
            {open && (
              <div className="border-t border-hairline px-3 py-2.5">
                <TypeTable r={r} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <span className="text-[11px] text-muted-subtle md:hidden">{label}</span>
      <span className={cn("font-semibold text-foreground", className)}>{value}</span>
    </span>
  );
}
