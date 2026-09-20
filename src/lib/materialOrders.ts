import type { MaterialOrder, MaterialOrderStatus, MaterialOrderUnit, Project } from "./api";

export interface UpcomingDelivery {
  orderId: string;
  itemId: string;
  projectId: string;
  projectName: string;
  description: string;
  quantity: number;
  unit: MaterialOrderUnit;
  supplier: string | null;
  expectedDeliveryDate: string;
  dayLabel: string;
  status: MaterialOrderStatus;
  /** The job's scheduled_start_date (0058) has already begun before this
   * delivery is expected to land. */
  conflict: boolean;
}

/** "Today" / "Tomorrow" / a weekday name within the next week / a short
 * date beyond that. */
export function deliveryDayLabel(dateStr: string, from: Date = new Date()): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Flattens material orders to their line items, filtered to not-yet-delivered
 * orders with an expected_delivery_date inside the next `windowDays` (default
 * 14), soonest first — the Dashboard deliveries card's exact list.
 */
export function upcomingDeliveries(
  orders: MaterialOrder[],
  projectsById: Map<string, Project>,
  windowDays = 14,
  from: Date = new Date(),
): UpcomingDelivery[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  const rows: UpcomingDelivery[] = [];
  for (const order of orders) {
    if (order.status === "delivered" || !order.expected_delivery_date) continue;
    const deliveryDate = new Date(`${order.expected_delivery_date}T00:00:00`);
    if (deliveryDate < today || deliveryDate > windowEnd) continue;

    const project = projectsById.get(order.project_id);
    const conflict =
      !!project?.scheduled_start_date &&
      deliveryDate > new Date(`${project.scheduled_start_date}T00:00:00`);

    for (const item of order.material_order_items) {
      rows.push({
        orderId: order.id,
        itemId: item.id,
        projectId: order.project_id,
        projectName: project?.name ?? order.project?.name ?? "Unknown job",
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        supplier: order.supplier,
        expectedDeliveryDate: order.expected_delivery_date,
        dayLabel: deliveryDayLabel(order.expected_delivery_date, from),
        status: order.status,
        conflict,
      });
    }
  }

  return rows.sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
}
