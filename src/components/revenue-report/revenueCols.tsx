import { Repeat, Wrench } from "lucide-react";
import type { BreakdownRow } from "@/lib/revenueReport";
import { formatCurrency } from "@/lib/utils";
import type { Col } from "./RevenueSections";

/** Formatting + column helpers for the Revenue report tables (kept out of
 * the component file so fast refresh keeps working). */
export const pctText = (v: number | null | undefined, digits = 0) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(digits)}%`);
export const signedMoney = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;

export const labelCol = (label: string, withBadges = false): Col => ({
  key: "label",
  label,
  render: (r) => (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-foreground">
      <span className="[overflow-wrap:anywhere]">{r.label}</span>
      {withBadges && r.extra?.repeat && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-info/15 px-1.5 text-[10px] font-bold text-info">
          <Repeat className="h-2.5 w-2.5" /> repeat
        </span>
      )}
      {withBadges && r.extra?.maintenance && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-success">
          <Wrench className="h-2.5 w-2.5" /> maintenance
        </span>
      )}
    </span>
  ),
});
export const amountCol = (label = "Revenue"): Col => ({ key: "amount", label, right: true, render: (r) => formatCurrency(r.amount) });
export const countCol = (label = "Jobs"): Col => ({ key: "count", label, right: true, render: (r) => r.count });
