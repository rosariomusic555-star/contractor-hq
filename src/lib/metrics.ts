import type { Invoice } from "./api";

export interface MonthPoint {
  key: string; // "2024-01"
  month: string; // "Jan"
  revenue: number;
}

const monthKey = (isoDate: string) => isoDate.slice(0, 7);
const monthShort = (isoDate: string) =>
  new Date(isoDate.slice(0, 10) + "T00:00:00").toLocaleString("en-US", { month: "short" });

/** Invoice amounts summed per calendar month (by created_at), ascending. */
export function monthlyRevenue(invoices: Invoice[]): MonthPoint[] {
  const buckets = new Map<string, MonthPoint>();
  for (const inv of invoices) {
    const key = monthKey(inv.created_at);
    const point = buckets.get(key) ?? { key, month: monthShort(inv.created_at), revenue: 0 };
    point.revenue += Number(inv.amount);
    buckets.set(key, point);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Percent change between the two most recent months present; null if not computable. */
export function momChange(points: MonthPoint[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2].revenue;
  const curr = points[points.length - 1].revenue;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
