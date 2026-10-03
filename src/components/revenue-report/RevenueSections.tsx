import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info, Repeat, Wrench } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BreakdownRow, JobRow } from "@/lib/revenueReport";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { pctText, signedMoney } from "./revenueCols";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";


/** A definition, on hover / tap. */
export function Def({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="What this means" className={cn("inline-flex text-muted-subtle hover:text-foreground", className)} onClick={(e) => e.stopPropagation()}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

export interface RecordRow {
  key: string;
  label: string;
  sub?: string | null;
  date?: string | null;
  amount?: number | null;
  href?: string | null;
}

/** The records behind a number — every clickable figure opens this. */
function RecordsSheetInner({ open, onOpenChange, title, description, rows }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; rows: RecordRow[] }) {
  const isMobile = useIsMobile();
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[88dvh] rounded-t-2xl px-4 pb-6 pt-5" : "w-full sm:max-w-md")}>
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <p className="mt-3 text-sm text-muted-foreground">
          {rows.length} record{rows.length === 1 ? "" : "s"}
          {rows.some((r) => r.amount != null) && <> · <span className="font-bold text-foreground">{formatCurrency(total)}</span></>}
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing in this period.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {rows.map((r) => {
              const body = (
                <span className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground [overflow-wrap:anywhere]">{r.label}</span>
                    {(r.date || r.sub) && <span className="block text-xs text-muted-foreground">{[r.date ? formatDate(r.date) : null, r.sub].filter(Boolean).join(" · ")}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
                    {r.amount != null && formatCurrency(r.amount)}
                    {r.href && <ChevronRight className="h-3.5 w-3.5 text-muted-subtle" />}
                  </span>
                </span>
              );
              return <li key={r.key}>{r.href ? <Link to={r.href} className="block hover:bg-muted/40">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Card({ title, def, right, children, className }: { title: string; def?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card-surface min-w-0 space-y-3 p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-foreground">
          {title}
          {def && <Def text={def} />}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export type Col = { key: string; label: string; right?: boolean; render: (r: BreakdownRow) => ReactNode; sort?: (r: BreakdownRow) => number | string };

/** A compact, sortable breakdown with a share bar; rows open their records. */
export function BreakdownTable({ rows, cols, onRow, empty }: { rows: BreakdownRow[]; cols: Col[]; onRow?: (r: BreakdownRow) => void; empty: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "amount", dir: -1 });
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    const val = (r: BreakdownRow) => (col?.sort ? col.sort(r) : sort.key === "amount" ? r.amount : sort.key === "count" ? r.count : r.label.toLowerCase());
    return [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [rows, cols, sort]);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-subtle">
            {cols.map((c) => (
              <th
                key={c.key}
                className={cn("cursor-pointer select-none py-1.5", c.right ? "pl-2 text-right" : "pr-2 text-left")}
                onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.key === "label" ? 1 : -1 }))}
              >
                {c.label}
                {sort.key === c.key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className={cn("border-b border-hairline last:border-0", onRow && "cursor-pointer hover:bg-muted/40")} onClick={() => onRow?.(r)}>
              {cols.map((c, i) => (
                <td key={c.key} className={cn("py-1.5 align-top", c.right ? "pl-2 text-right tabular-nums" : "pr-2")}>
                  {c.render(r)}
                  {i === 0 && (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-secondary">
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(Math.abs(r.amount) / max) * 100}%` }} />
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Jobs table
// ---------------------------------------------------------------------------

const ALL = "__all";
type JobSort = keyof Pick<JobRow, "name" | "contract" | "invoiced" | "collected" | "cost" | "profit" | "fullyLoaded" | "marginPct" | "variance">;

export function JobsTable({
  jobs,
  featureOptions,
  crewOptions,
  sourceOptions,
  showLoaded,
}: {
  jobs: JobRow[];
  featureOptions: { id: string; label: string }[];
  crewOptions: { id: string; label: string }[];
  sourceOptions: string[];
  showLoaded: boolean;
}) {
  const isMobile = useIsMobile();
  const [f, setF] = useState({ status: ALL, feature: ALL, crew: ALL, source: ALL });
  const [sort, setSort] = useState<{ key: JobSort; dir: 1 | -1 }>({ key: "contract", dir: -1 });
  const statuses = [...new Set(jobs.map((j) => j.status))];
  const rows = useMemo(() => {
    const out = jobs.filter(
      (j) =>
        (f.status === ALL || j.status === f.status) &&
        (f.feature === ALL || j.featureCategoryIds.includes(f.feature)) &&
        (f.crew === ALL || (f.crew === "none" ? !j.crewId : j.crewId === f.crew)) &&
        (f.source === ALL || j.leadSource === f.source),
    );
    const v = (j: JobRow) => (sort.key === "name" ? j.name.toLowerCase() : (j[sort.key] as number | null) ?? -Infinity);
    return out.sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * sort.dir);
  }, [jobs, f, sort]);
  const sum = (k: "contract" | "invoiced" | "collected" | "cost" | "profit" | "fullyLoaded") => rows.reduce((s, j) => s + ((j[k] as number | null) ?? 0), 0);
  // Dollar-weighted, like every margin in the report.
  const priced = rows.filter((j) => j.profit != null && (j.price ?? 0) > 0);
  const totPrice = priced.reduce((s, j) => s + (j.price ?? 0), 0);
  const totMargin = totPrice > 0 ? (priced.reduce((s, j) => s + (j.profit ?? 0), 0) / totPrice) * 100 : null;
  const th = (key: JobSort, label: string, right = true) => (
    <th className={cn("cursor-pointer select-none whitespace-nowrap py-2", right ? "pl-2 text-right" : "pr-2 text-left")} onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }))}>
      {label}
      {sort.key === key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );
  const money = (v: number | null) => (v == null ? "—" : formatCurrency(v));
  const filter = (key: keyof typeof f, allLabel: string, options: { value: string; label: string }[]) => (
    <Select value={f[key]} onValueChange={(v) => setF({ ...f, [key]: v })}>
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={allLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {filter("status", "All statuses", statuses.map((s) => ({ value: s, label: s.replace("_", " ") })))}
        {filter("feature", "All features", featureOptions.map((o) => ({ value: o.id, label: o.label })))}
        {filter("crew", "All crews", [...crewOptions.map((o) => ({ value: o.id, label: o.label })), { value: "none", label: "No crew" }])}
        {filter("source", "All lead sources", sourceOptions.map((s) => ({ value: s, label: s })))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs match.</p>
      ) : isMobile ? (
        <ul className="space-y-2">
          {rows.map((j) => (
            <li key={j.projectId} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/projects/${j.projectId}`} className="min-w-0 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{j.name}</Link>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatCurrency(j.contract)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{[j.client, j.status.replace("_", " ")].filter(Boolean).join(" · ")}</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                <span>Invoiced <b className="block text-foreground">{formatCurrency(j.invoiced)}</b></span>
                <span>Collected <b className="block text-foreground">{formatCurrency(j.collected)}</b></span>
                <span>Profit <b className={cn("block", (j.profit ?? 0) < 0 ? "text-destructive" : "text-foreground")}>{money(j.profit)} {j.marginPct != null && `(${pctText(j.marginPct)})`}</b></span>
              </div>
              {j.closeoutId && <Link to={`/projects/${j.projectId}`} className="mt-1 block text-[11px] font-semibold text-primary">Closeout on file</Link>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                {th("name", "Project", false)}
                <th className="pr-2 text-left">Status</th>
                {th("contract", "Contract")}
                {th("invoiced", "Invoiced")}
                {th("collected", "Collected")}
                {th("cost", "Cost")}
                {th("profit", "Gross profit")}
                {showLoaded && th("fullyLoaded", "Fully loaded")}
                {th("marginPct", "Margin")}
                {th("variance", "vs plan")}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.projectId}>
                  <td className="max-w-[220px]">
                    <Link to={`/projects/${j.projectId}`} className="block truncate font-medium text-foreground hover:underline" title={j.name}>{j.name}</Link>
                    <span className="block truncate text-[11px] text-muted-subtle">{j.client ?? "No client"}{j.closeoutId ? " · closeout on file" : ""}</span>
                  </td>
                  <td className="whitespace-nowrap capitalize">{j.status.replace("_", " ")}</td>
                  <td className="text-right tabular-nums">{formatCurrency(j.contract)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(j.invoiced)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(j.collected)}</td>
                  <td className="text-right tabular-nums">{money(j.cost)}</td>
                  <td className={cn("text-right font-semibold tabular-nums", (j.profit ?? 0) < 0 && "text-destructive")}>{money(j.profit)}</td>
                  {showLoaded && <td className="text-right tabular-nums">{money(j.fullyLoaded)}</td>}
                  <td className="text-right tabular-nums">{pctText(j.marginPct)}</td>
                  <td className={cn("text-right tabular-nums", (j.variance ?? 0) < 0 ? "text-destructive" : "text-success")}>{j.variance == null ? "—" : signedMoney(j.variance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className="py-2">Total · {rows.length}</td>
                <td />
                <td className="text-right tabular-nums">{formatCurrency(sum("contract"))}</td>
                <td className="text-right tabular-nums">{formatCurrency(sum("invoiced"))}</td>
                <td className="text-right tabular-nums">{formatCurrency(sum("collected"))}</td>
                <td className="text-right tabular-nums">{formatCurrency(sum("cost"))}</td>
                <td className="text-right tabular-nums">{formatCurrency(sum("profit"))}</td>
                {showLoaded && <td className="text-right tabular-nums">{formatCurrency(sum("fullyLoaded"))}</td>}
                <td className="text-right tabular-nums">{pctText(totMargin)}</td>
                <td className="text-right tabular-nums">{signedMoney(rows.reduce((s, j) => s + (j.variance ?? 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-subtle">
        Contract = signed value (quotes + add-ons + approved change orders). Cost and profit: a completed job's closeout when it has one, otherwise the live Planned vs actual numbers
        (an open job counts each cost type as spent or planned, whichever is more).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seasonality heat map
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SeasonalityMap({ rows, onCell }: { rows: { year: number; months: number[] }[]; onCell?: (year: number, month: number) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No revenue yet.</p>;
  const max = Math.max(1, ...rows.flatMap((r) => r.months));
  const monthAvg = MONTHS.map((_, m) => rows.reduce((s, r) => s + r.months[m], 0) / rows.length);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-1 text-[11px]">
        <thead>
          <tr>
            <th />
            {MONTHS.map((m) => (
              <th key={m} className="font-semibold text-muted-subtle">{m}</th>
            ))}
            <th className="pl-1 text-right font-semibold text-muted-subtle">Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="pr-1 font-semibold text-foreground">{r.year}</td>
              {r.months.map((v, m) => (
                <td key={m}>
                  <button
                    type="button"
                    onClick={() => onCell?.(r.year, m)}
                    title={`${MONTHS[m]} ${r.year}: ${formatCurrency(v)}`}
                    className="h-8 w-full rounded-md text-[10px] font-semibold tabular-nums"
                    style={{ background: v > 0 ? `hsl(var(--primary) / ${0.12 + 0.88 * (v / max)})` : "hsl(var(--muted))", color: v / max > 0.55 ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))" }}
                  >
                    {v > 0 ? (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)) : ""}
                  </button>
                </td>
              ))}
              <td className="pl-1 text-right font-semibold tabular-nums">{formatCurrency(r.months.reduce((s, v) => s + v, 0))}</td>
            </tr>
          ))}
          {rows.length > 1 && (
            <tr>
              <td className="pr-1 text-muted-subtle">Avg</td>
              {monthAvg.map((v, m) => (
                <td key={m} className="text-center tabular-nums text-muted-subtle">{v >= 1000 ? `${Math.round(v / 1000)}k` : v > 0 ? Math.round(v) : ""}</td>
              ))}
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const RecordsSheet = withErrorBoundary(RecordsSheetInner, "RecordsSheet");
