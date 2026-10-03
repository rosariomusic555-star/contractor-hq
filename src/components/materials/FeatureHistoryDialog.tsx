import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { describeCostChange } from "@/lib/changeOrderCost";
import type { FeatureHistoryEvent } from "@/lib/api";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

const signed = (v: number) => (Math.abs(v) < 0.005 ? "no change" : `${v < 0 ? "−" : "+"}${formatCurrency(Math.abs(v))}`);

/**
 * A feature's life since its original scope: Original → CO #1 → CO #2 →
 * Current, each with planned cost and customer price. Declined change orders
 * stay in the list, marked declined and changing nothing.
 */
function FeatureHistoryDialogInner({
  open,
  onOpenChange,
  featureName,
  events,
  currentCost,
  currentPrice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  events: FeatureHistoryEvent[];
  currentCost: number;
  currentPrice: number;
}) {
  const first = events[0];
  const startsAsAddon = first?.event === "addon_approved";
  const original = first
    ? { cost: startsAsAddon ? first.cost_after : first.cost_before, price: startsAsAddon ? first.price_after : first.price_before }
    : { cost: currentCost, price: currentPrice };
  const rest = startsAsAddon ? events.slice(1) : events;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{featureName} · history</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-subtle">Original</div>
            <div className="mt-0.5 tabular-nums text-foreground">
              {formatCurrency(original.price)} price · {formatCurrency(original.cost)} cost
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-subtle">Current</div>
            <div className="mt-0.5 font-bold tabular-nums text-foreground">
              {formatCurrency(currentPrice)} price · {formatCurrency(currentCost)} cost
            </div>
          </div>
        </div>

        <ol className="relative mt-1 space-y-3 border-l-2 border-hairline pl-4">
          <TimelineItem
            title={startsAsAddon ? `Added · ${first.label ?? "Add-on quote"}` : "Original scope"}
            meta={`${formatCurrency(original.price)} price · ${formatCurrency(original.cost)} cost`}
          />
          {rest.map((e) => {
            const declined = e.event === "change_order_declined" || e.event === "addon_declined";
            return (
              <TimelineItem
                key={e.id}
                title={`${e.label ?? "Change"}${e.details?.title ? ` — ${e.details.title}` : ""}`}
                badge={declined ? "Declined" : "Approved"}
                muted={declined}
                meta={
                  declined
                    ? "Nothing applied"
                    : `Price ${signed(e.price_after - e.price_before)} · cost ${signed(e.cost_after - e.cost_before)}`
                }
                date={e.created_at}
              >
                {!declined && e.details?.scope && <p className="text-xs text-foreground">Scope: {e.details.scope}</p>}
                {!declined &&
                  (e.details?.changes ?? []).map((c, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {describeCostChange(c)}
                    </p>
                  ))}
              </TimelineItem>
            );
          })}
          <TimelineItem
            title="Current"
            meta={`${formatCurrency(currentPrice)} price · ${formatCurrency(currentCost)} cost · ${
              currentPrice > 0 ? `${Math.round(((currentPrice - currentCost) / currentPrice) * 100)}% margin` : "no price yet"
            }`}
            strong
          />
        </ol>
        {events.length === 0 && <p className="text-xs text-muted-foreground">No change orders on this feature yet.</p>}
      </DialogContent>
    </Dialog>
  );
}

function TimelineItem({
  title,
  meta,
  badge,
  date,
  muted,
  strong,
  children,
}: {
  title: string;
  meta: string;
  badge?: string;
  date?: string;
  muted?: boolean;
  strong?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className={cn("relative space-y-0.5", muted && "opacity-60")}>
      <span className={cn("absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-card", strong ? "bg-primary" : "bg-border")} />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-sm", strong ? "font-bold" : "font-semibold", muted ? "line-through" : "", "text-foreground")}>{title}</span>
        {badge && (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", muted ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary")}>
            {badge}
          </span>
        )}
        {date && <span className="text-[11px] text-muted-subtle">{new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">{meta}</p>
      {children}
    </li>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const FeatureHistoryDialog = withErrorBoundary(FeatureHistoryDialogInner, "FeatureHistoryDialog");
