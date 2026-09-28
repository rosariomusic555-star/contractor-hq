import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn, formatCurrency } from "@/lib/utils";
import { listOpportunities, listQuotes, projectContractValue } from "@/lib/api";
import { dueBuckets, maintenanceStats, monthYear } from "@/lib/maintenance";
import { isoDate } from "@/lib/weatherRisk";
import { useMaintenanceItems } from "@/components/maintenance/useMaintenance";
import { useCardLink } from "@/hooks/use-card-link";

/**
 * Dashboard "Maintenance due" (0127): past clients due this month / next
 * month (plus anything overdue), and this year's numbers — due, reached
 * out, converted to jobs, revenue from those jobs. Hidden until there's
 * at least one reminder.
 */
export function MaintenanceDueCard({ className }: { className?: string }) {
  const cardLink = useCardLink("/projects");
  const { data: items = [] } = useMaintenanceItems();
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: listOpportunities });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  if (!items.length) return null;

  const today = isoDate(new Date());
  const live = items.filter((i) => !i.project?.client?.maintenance_opt_out && !i.opportunity_id);
  const b = dueBuckets(live, today);
  const stats = maintenanceStats(items, opportunities, (pid) => projectContractValue(quotes.filter((q) => q.project_id === pid), []), today);
  const groups = [
    { label: "Overdue", rows: b.overdue, red: true },
    { label: "This month", rows: b.thisMonth, red: false },
    { label: "Next month", rows: b.nextMonth, red: false },
  ].filter((g) => g.rows.length);

  return (
    <section onClick={cardLink.onClick} className={cn(cardLink.className, "card-surface p-5", className)}>
      <h3 className="text-base font-bold text-foreground">Maintenance due</h3>
      {groups.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No past clients due this month or next.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="mt-3">
            <p className={cn("text-xs font-bold uppercase tracking-wide", g.red ? "text-destructive" : "text-muted-foreground")}>{g.label}</p>
            <ul className="mt-1 divide-y divide-hairline">
              {g.rows.map((i) => (
                <li key={i.id}>
                  <Link to={`/projects/${i.project_id}?maintenance=${i.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{i.project?.client?.name ?? i.project?.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.label} · {i.project?.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{monthYear(i.next_due).split(" ")[0]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-hairline pt-3 text-center">
        {[
          ["Due this yr", String(stats.due)],
          ["Reached out", String(stats.reachedOut)],
          ["Converted", `${stats.converted}/${stats.opportunities}`],
          ["Revenue", formatCurrency(stats.revenue)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className="text-sm font-bold text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
