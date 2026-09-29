import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  crewDayHours,
  formatLabor,
  requiredSellRatePerHour,
  trueCost,
  TRUE_COST_STATUS_CLASS,
  type OverheadSettings,
} from "@/lib/overhead";


const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

/** The quiet link shown in a totals area while overhead isn't set up. */
export function SetUpOverheadLink({ className }: { className?: string }) {
  return (
    <Link to="/settings/overhead" className={cn("text-xs font-semibold text-muted-foreground hover:text-primary hover:underline", className)}>
      Set up overhead to see true profit →
    </Link>
  );
}

/**
 * The internal true-cost summary (0110) — direct cost, overhead burden,
 * break-even, price, expected vs fully loaded profit, the price that hits
 * the target margin, and what labor has to sell for. Used by the quote
 * builder's totals card and the Cost plan totals. Internal only: never
 * rendered on a client-facing page.
 *
 * `rate` null = overhead not set up → just the set-up link.
 */
export function TrueCostSummary({
  direct,
  manHours,
  rate,
  price,
  targetMarginPct,
  laborRate,
  settings,
  lumpSumsWithoutHours = 0,
  directNote,
  rateNote,
  collapsible = false,
  className,
}: {
  direct: number;
  manHours: number;
  rate: number | null;
  /** The quote / contract price — null: no price yet (Cost plan before a quote). */
  price: number | null;
  targetMarginPct: number | null;
  /** Average planned labor cost per man-hour. */
  laborRate: number | null;
  settings: OverheadSettings | null;
  lumpSumsWithoutHours?: number;
  /** Small print under Direct cost (e.g. what's included beyond the lines). */
  directNote?: string;
  /** e.g. "Rate stored on this quote" / a Recalculate action. */
  rateNote?: ReactNode;
  /** Starts folded to the fully loaded line (mobile totals card). */
  collapsible?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(!collapsible);
  if (rate == null) return <SetUpOverheadLink className={className} />;

  const tc = trueCost({ direct, manHours, rate, price: price ?? 0, targetMarginPct });
  const sellHour = requiredSellRatePerHour(laborRate, rate, tc.targetMarginPct);
  const dayHours = settings ? crewDayHours(settings) : 24;
  const hasPrice = price != null && price > 0;

  const rows = (
    <div className="space-y-1.5 text-sm tabular-nums">
      <Row label="Direct cost" value={formatCurrency(tc.direct)} sub={directNote} />
      <Row
        label="Overhead burden"
        value={formatCurrency(tc.overhead)}
        sub={`${formatLabor(manHours, settings)} × ${formatCurrency(rate)}/hr`}
      />
      <Row label="Break-even price" value={formatCurrency(tc.breakEven)} strong />
      {hasPrice && (
        <>
          <Row label="Quote price" value={formatCurrency(tc.price)} />
          <Row label="Expected profit" value={`${formatCurrency(tc.expectedProfit)} · ${pct(tc.expectedMarginPct)}`} sub="price − direct" />
          <Row
            label="Fully loaded profit"
            value={`${formatCurrency(tc.fullyLoadedProfit)} · ${pct(tc.fullyLoadedMarginPct)}`}
            sub="price − direct − overhead"
            valueClass={cn("font-extrabold", TRUE_COST_STATUS_CLASS[tc.status])}
          />
        </>
      )}
      {tc.requiredPrice != null && (
        <Row
          label={`Price for ${pct(tc.targetMarginPct)} target`}
          value={formatCurrency(tc.requiredPrice)}
          sub={
            hasPrice && tc.requiredGap != null
              ? `${tc.requiredGap >= 0 ? "Current price is" : "Current price is"} ${formatCurrency(Math.abs(tc.requiredGap))} ${tc.requiredGap >= 0 ? "above" : "below"}`
              : undefined
          }
          valueClass={hasPrice && tc.requiredGap != null && tc.requiredGap < 0 ? "text-warning-strong" : undefined}
        />
      )}
      {sellHour != null && (
        <Row
          label="Labor must sell for"
          value={`${formatCurrency(sellHour)}/man-hour`}
          sub={`${formatCurrency(sellHour * dayHours)} per crew-day`}
        />
      )}
      {lumpSumsWithoutHours > 0 && (
        <p className="text-xs text-warning-strong">
          {lumpSumsWithoutHours} lump-sum labor {lumpSumsWithoutHours === 1 ? "block has" : "blocks have"} no man-hours, so no overhead is
          applied to {lumpSumsWithoutHours === 1 ? "it" : "them"} — add man-hours in the Cost plan.
        </p>
      )}
      {rateNote && <div className="pt-1 text-xs text-muted-foreground">{rateNote}</div>}
    </div>
  );

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("flex w-full items-center gap-2 text-left", !collapsible && "cursor-default")}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-subtle">True cost · internal</span>
        {collapsible && hasPrice && !open && (
          <span className={cn("ml-auto text-sm font-extrabold tabular-nums", TRUE_COST_STATUS_CLASS[tc.status])}>
            {formatCurrency(tc.fullyLoadedProfit)} · {pct(tc.fullyLoadedMarginPct)}
          </span>
        )}
        {collapsible && <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-subtle transition-transform", !open && "ml-auto", open && "ml-auto rotate-180")} />}
      </button>
      {open && rows}
    </div>
  );
}

function Row({ label, value, sub, strong, valueClass }: { label: string; value: string; sub?: string; strong?: boolean; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>{label}</div>
        {sub && <div className="text-[11px] text-muted-subtle">{sub}</div>}
      </div>
      <div className={cn("shrink-0 text-right font-semibold text-foreground", strong && "font-bold", valueClass)}>{value}</div>
    </div>
  );
}
