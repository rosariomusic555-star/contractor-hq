import type { Category, Invoice, Quote } from "./api";
import { quoteItemIncluded, quoteLineTotal } from "./api";

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

export interface CategoryRevenue {
  /** Category id, or "uncategorized" for the null bucket. */
  id: string;
  name: string;
  amount: number;
}

/**
 * Revenue recognized per category, for the Money page's "Revenue by
 * category" card.
 *
 * A quote counts only once it's "fully paid": the sum of its paid invoices'
 * amounts covers what was actually committed to — required items plus any
 * optional ones the client actually selected (quoteItemIncluded()), NOT
 * quoteTotal()'s full all-in figure, which includes optional work nobody
 * picked and so would never be reached by real payments. At that point the
 * committed total (not the raw invoice sum, which needn't match it) is
 * attributed across categories in proportion to each category's share of
 * the quote's included line items — each item's quoteLineTotal() bucketed
 * by category_id. Partially-paid quotes contribute nothing yet, anywhere.
 *
 * An invoice with no quote_id (standalone, or a project invoice never linked
 * to a quote) has no line items to categorize — a paid one counts its full
 * amount toward Uncategorized instead of being dropped.
 */
export function revenueByCategory(
  quotes: Quote[],
  invoices: Invoice[],
  categories: Category[],
): CategoryRevenue[] {
  const totals = new Map<string, number>();
  const add = (categoryId: string | null, amount: number) => {
    const key = categoryId ?? "uncategorized";
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  const paidByQuote = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    if (inv.quote_id) {
      paidByQuote.set(inv.quote_id, (paidByQuote.get(inv.quote_id) ?? 0) + Number(inv.amount));
    } else {
      add(null, Number(inv.amount));
    }
  }

  for (const quote of quotes) {
    let committedTotal = 0;
    for (const section of quote.quote_sections) {
      for (const item of section.quote_items ?? []) {
        if (quoteItemIncluded(section, item)) committedTotal += quoteLineTotal(item);
      }
    }
    if (committedTotal <= 0) continue;
    if ((paidByQuote.get(quote.id) ?? 0) < committedTotal) continue;
    for (const section of quote.quote_sections) {
      for (const item of section.quote_items ?? []) {
        if (quoteItemIncluded(section, item)) add(item.category_id, quoteLineTotal(item));
      }
    }
  }

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  return [...totals.entries()]
    .map(([id, amount]) => ({
      id,
      name: id === "uncategorized" ? "Uncategorized" : (nameById.get(id) ?? "Uncategorized"),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}
