import { useState } from "react";
import { ChevronDown, Info, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { usePlannedActual } from "@/hooks/use-planned-actual";
import {
  profitSentence,
  signedMoney,
  VARIANCE_TONE_CLASS,
  type BucketRow,
  type FeatureBlock,
  type PlannedActualReport,
  type VarianceCell,
} from "@/lib/plannedActual";
import { JobContextChips } from "./JobContextChips";
import { CloseoutPanel } from "./CloseoutPanel";

const pctText = (p: number | null) => (p == null ? "—" : `${Math.round(p) > 0 ? "+" : Math.round(p) < 0 ? "−" : ""}${Math.abs(Math.round(p))}%`);
const qtyText = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

function Variance({ c, className }: { c: VarianceCell; className?: string }) {
  if (c.tone === "none") return <span className={cn("text-muted-subtle", className)}>—</span>;
  return (
    <span className={cn("font-bold tabular-nums", VARIANCE_TONE_CLASS[c.tone], className)}>
      {c.dollars === 0 ? "$0" : signedMoney(c.dollars)} <span className="text-[11px] font-semibold">({pctText(c.pct)})</span>
    </span>
  );
}

/**
 * Planned vs actual (Feature 5) — how the job is going against the plan and
 * what it did to profit: the biggest variances first, a profit bridge
 * ("Gravel +$450, Labor +$900 → Profit −$1,350", fully loaded when overhead
 * is set up), then each feature by cost type with its material lines. On a
 * phone every row is a stacked card, biggest variance first. Internal only.
 */
export function PlannedVsActualCard({ projectId, showContext = true, showCloseout = true }: { projectId: string; showContext?: boolean; showCloseout?: boolean }) {
  const data = usePlannedActual(projectId);
  if (!data) return null;
  const { report, project } = data;
  const sentence = profitSentence(report);

  return (
    <section className="card-surface space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-foreground">Planned vs actual</h3>
        <span className="text-xs text-muted-foreground">Internal — never shown to the client</span>
      </div>

      {!report.hasActuals ? (
        <p className="text-sm text-muted-foreground">Nothing logged yet — expenses, labor and deliveries show up here against the plan as they come in.</p>
      ) : (
        <>
          <BiggestVariances report={report} />
          <ProfitImpact report={report} sentence={sentence} />
        </>
      )}

      <div className="space-y-2">
        {report.laborTracking === "project" && report.features.length > 1 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Labor is logged for the whole project, so it's compared project-wide. Per-feature labor below is an estimated split by planned share.
          </p>
        )}
        {!report.materialsCounted && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Delivered material cost counts in the totals once the job is Complete and every line is reconciled — the lines below show deliveries so far.
          </p>
        )}
        <ProjectTotals report={report} />
        {report.features.map((f) => (
          <FeatureSection key={f.featureId ?? "general"} f={f} report={report} />
        ))}
      </div>

      {showContext && (
        <div className="border-t border-hairline pt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Job context</div>
          <JobContextChips project={project} crewSize={data.crew} />
        </div>
      )}

      {showCloseout && project.status === "complete" && <CloseoutPanel projectId={projectId} />}
    </section>
  );
}

function BiggestVariances({ report }: { report: PlannedActualReport }) {
  if (report.biggest.length === 0)
    return (
      <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm font-semibold text-success">
        <TrendingDown className="h-4 w-4" />
        Nothing over plan so far.
      </div>
    );
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Biggest variances</div>
      <ul className="space-y-1.5">
        {report.biggest.map((b) => (
          <li key={b.key} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{b.label}</div>
              <div className="truncate text-xs text-muted-foreground">{b.where}</div>
            </div>
            <span className={cn("shrink-0 text-sm font-bold tabular-nums", VARIANCE_TONE_CLASS[b.tone])}>
              {signedMoney(b.dollars)} <span className="text-[11px]">({pctText(b.pct)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfitImpact({ report, sentence }: { report: PlannedActualReport; sentence: string | null }) {
  const p = report.profit;
  const loaded = p.expectedFullyLoaded != null && p.actualFullyLoaded != null;
  const exp = loaded ? p.expectedFullyLoaded! : p.expected;
  const act = loaded ? p.actualFullyLoaded! : p.actual;
  const delta = act - exp;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground">Expected {loaded ? "(fully loaded)" : "profit"}</div>
          <div className="text-base font-extrabold tabular-nums text-foreground">{formatCurrency(exp)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground">Actual {loaded ? "(fully loaded)" : "profit"}</div>
          <div className="text-base font-extrabold tabular-nums text-foreground">{formatCurrency(act)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground">Difference</div>
          <div className={cn("flex items-center justify-center gap-1 text-base font-extrabold tabular-nums", delta < 0 ? "text-destructive" : "text-success")}>
            {delta < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {signedMoney(delta)}
          </div>
        </div>
      </div>
      {sentence && <p className="mt-2 text-center text-xs font-semibold text-foreground">{sentence}</p>}
      {p.bridge.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-hairline pt-2 text-xs">
          {p.bridge.map((s) => (
            <li key={s.label} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-muted-foreground">{s.label}</span>
              <span className={cn("shrink-0 font-semibold tabular-nums", s.amount < 0 ? "text-destructive" : "text-success")}>
                {s.amount < 0 ? "−" : "+"}
                {formatCurrency(Math.abs(s.amount))} profit
              </span>
            </li>
          ))}
        </ul>
      )}
      {loaded && <p className="mt-1.5 text-[11px] text-muted-subtle">Fully loaded = after overhead at {formatCurrency(p.overheadRate!)}/man-hour (Feature 1).</p>}
    </div>
  );
}

function BucketLine({ b, strong }: { b: BucketRow | (VarianceCell & { label: string; estimatedSplit?: boolean; pending?: boolean }); strong?: boolean }) {
  const actualText = b.pending ? "Not counted yet" : formatCurrency(b.actual);
  return (
    <>
      {/* Desktop: one row */}
      <div className={cn("hidden grid-cols-[1fr_110px_110px_150px] items-center gap-2 py-1.5 text-sm md:grid", strong && "font-bold")}>
        <span className="min-w-0 truncate text-foreground">
          {b.label}
          {b.estimatedSplit && <span className="ml-1.5 text-[11px] font-normal text-muted-subtle">Estimated split (by planned share)</span>}
        </span>
        <span className="text-right tabular-nums text-muted-foreground">{formatCurrency(b.planned)}</span>
        <span className={cn("text-right tabular-nums text-foreground", b.pending && "text-xs text-muted-subtle")}>{actualText}</span>
        <span className="text-right">
          <Variance c={b} />
        </span>
      </div>
      {/* Phone: stacked */}
      <div className={cn("rounded-lg px-1 py-1.5 md:hidden", strong && "font-bold")}>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 text-foreground">{b.label}</span>
          <Variance c={b} className="text-sm" />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Planned {formatCurrency(b.planned)} · Actual {actualText}
          {b.estimatedSplit && <span className="block text-[11px] text-muted-subtle">Estimated split (by planned share)</span>}
        </div>
      </div>
    </>
  );
}

function ProjectTotals({ report }: { report: PlannedActualReport }) {
  const [open, setOpen] = useState(true);
  const buckets = [...report.project.buckets].sort((a, b) => b.dollars - a.dollars);
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="text-sm font-bold text-foreground">Whole project</span>
        <span className="flex items-center gap-2">
          <Variance c={report.project.total} className="text-sm" />
          <ChevronDown className={cn("h-4 w-4 text-muted-subtle transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="border-t border-hairline px-3 pb-2 pt-1">
          <div className="hidden grid-cols-[1fr_110px_110px_150px] gap-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle md:grid">
            <span />
            <span className="text-right">Planned</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Variance</span>
          </div>
          {buckets.map((b) => (
            <BucketLine key={b.bucket} b={b} />
          ))}
          <BucketLine b={{ ...report.project.total, label: "Total" }} strong />
          <p className="pt-1 text-xs text-muted-foreground">
            Labor: {qtyText(report.project.plannedHours)} planned vs {qtyText(report.project.actualHours)} actual man-hours
          </p>
        </div>
      )}
    </div>
  );
}

function FeatureSection({ f, report }: { f: FeatureBlock; report: PlannedActualReport }) {
  const [open, setOpen] = useState(false);
  if (f.total.planned === 0 && f.total.actual === 0 && f.lines.length === 0) return null;
  const buckets = [...f.buckets].sort((a, b) => b.dollars - a.dollars);
  const lines = [...f.lines].sort((a, b) => b.cost.dollars - a.cost.dollars || b.qty.dollars - a.qty.dollars);
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="min-w-0 truncate text-sm font-bold text-foreground">{f.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          <Variance c={f.total} className="text-sm" />
          <ChevronDown className={cn("h-4 w-4 text-muted-subtle transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-hairline px-3 pb-3 pt-1">
          <div>
            {buckets.map((b) => (
              <BucketLine key={b.bucket} b={b} />
            ))}
          </div>
          {(f.labor.plannedHours > 0 || (f.labor.actualHours ?? 0) > 0) && (
            <p className="text-xs text-muted-foreground">
              Labor: {qtyText(f.labor.plannedHours)} planned vs{" "}
              {f.labor.actualHours == null ? "—" : `${qtyText(f.labor.actualHours)}${f.labor.estimatedSplit ? " (estimated split)" : ""}`} actual man-hours
            </p>
          )}
          {lines.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-subtle">Material lines</div>
              <ul className="divide-y divide-hairline">
                {lines.map((l) => (
                  <li key={l.id} className="py-1.5 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{l.name}</span>
                      <Variance c={report.materialsCounted ? l.cost : l.qty} className="text-xs" />
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {qtyText(l.plannedQty)} {l.unit ?? ""} planned ·{" "}
                      {l.qtySource === "none" ? "nothing delivered yet" : `${qtyText(l.actualQty)} ${l.unit ?? ""} ${l.qtySource}`}
                      {" · "}
                      {formatCurrency(l.cost.planned)} vs {formatCurrency(l.cost.actual)} delivered
                    </div>
                  </li>
                ))}
              </ul>
              {!report.materialsCounted && <p className="mt-1 text-[11px] text-muted-subtle">Line variance is by quantity until materials count in the totals.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
