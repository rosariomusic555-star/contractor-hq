import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMaterialsCenter } from "@/hooks/use-materials-center";
import { cn, formatCurrency, formatDate, pluralize } from "@/lib/utils";

/** The project page's Materials card — purchases / on site at a
 * glance, the same numbers as the materials center it opens. */
export function MaterialsHubCard({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const data = useMaterialsCenter(projectId);
  const r = data?.report;
  const s = r?.summary;
  const nothing = !r || (s!.lineCount === 0 && r.orders.length === 0);
  const next = s?.nextDelivery;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-surface group flex items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-card-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">Materials</span>
        </span>
        {nothing ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">None yet</span>
        ) : (
          <>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {s!.fullyOrdered} of {s!.lineCount}
              </span>{" "}
              lines purchased · {s!.fullyDelivered} on site
            </span>
            {s!.plannedCost > 0 && (
              <span className="mt-0.5 block truncate text-[11px] text-muted-subtle">
                {formatCurrency(s!.orderedCost)} paid of {formatCurrency(s!.plannedCost)} planned
              </span>
            )}
            <span className={cn("mt-0.5 block truncate text-[11px]", next ? "text-foreground" : "text-muted-subtle")}>
              {next
                ? `Next: ${formatDate(next.date)} · ${next.order.supplier ?? "Supplier"} · ${next.items.slice(0, 2).join(" + ")}`
                : r.stillToOrder.length
                  ? `${pluralize(r.stillToOrder.length, "line")} still to purchase`
                  : "No delivery scheduled"}
            </span>
          </>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
