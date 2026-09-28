import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Truck } from "lucide-react";
import { cn, pluralize } from "@/lib/utils";
import { listMaterialOrders, listProjects, materialOrderUnitLabel } from "@/lib/api";
import { upcomingDeliveries } from "@/lib/materialOrders";
import { useCardLink } from "@/hooks/use-card-link";

/**
 * "A crew standing around waiting on a pallet is the most expensive thing
 * that happens to these guys" — deliveries expected in the next 14 days,
 * soonest first, across every project. Flags a conflict when the job's
 * target_install_month has already begun before the delivery is expected
 * (see upcomingDeliveries() — same scheduled_start gap as the Weather Strip).
 */
export function MaterialDeliveriesCard({ className }: { className?: string }) {
  const cardLink = useCardLink("/projects");
  const { data: orders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });

  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const deliveries = upcomingDeliveries(orders, projectsById);

  return (
    <section onClick={cardLink.onClick} className={cn(cardLink.className, "card-surface p-5", className)}>
      <header className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Deliveries <span className="text-muted-foreground">· next 14 days</span>
        </h3>
      </header>

      {deliveries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing expected in the next 2 weeks.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {deliveries.map((d) => (
            <li key={d.itemId}>
              <Link
                to={`/projects/${d.projectId}/material-orders`}
                className="flex items-start gap-3 py-3 first:pt-1 hover:opacity-80"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Truck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    {d.quantity} {materialOrderUnitLabel(d.unit, d.quantity)} {d.description}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.dayLabel} · {d.projectName}
                  </p>
                  {d.conflict && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-destructive">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Job's install month starts before this arrives
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {deliveries.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-subtle">{pluralize(deliveries.length, "delivery", "deliveries")}</p>
      )}
    </section>
  );
}
