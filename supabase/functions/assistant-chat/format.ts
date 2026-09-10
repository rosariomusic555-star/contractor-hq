// Pure math ported from the main app's src/lib/{api,metrics,aging}.ts.
//
// This Edge Function runs on Deno and can't import those files directly —
// src/lib/api.ts pulls in src/lib/supabase.ts, which reads import.meta.env
// (a Vite/browser-only mechanism) and throws if it's missing. So the small
// set of pure formulas actually needed here are duplicated, not shared.
// If these drift from the client versions, the assistant's numbers will
// disagree with what the app displays — keep them in sync by hand when the
// source functions change.

export interface QuoteItemLike {
  price: number;
  quantity?: number | null;
  is_optional: boolean;
  client_selected: boolean;
  category_id?: string | null;
}
export interface QuoteSectionLike {
  is_optional: boolean;
  quote_items: QuoteItemLike[];
}

/** Mirrors quoteItemIncluded() in src/lib/api.ts. */
export function quoteItemIncluded(section: QuoteSectionLike, item: QuoteItemLike): boolean {
  if (section.is_optional || item.is_optional) return item.client_selected;
  return true;
}

/** Mirrors quoteLineTotal() in src/lib/api.ts. */
export function quoteLineTotal(item: Pick<QuoteItemLike, "price" | "quantity">): number {
  return Number(item.price) * (item.quantity == null ? 1 : Number(item.quantity));
}

/** Mirrors quoteTotal() in src/lib/api.ts. */
export function quoteTotal(sections: QuoteSectionLike[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.quote_items ?? []) {
      if (quoteItemIncluded(section, item)) total += quoteLineTotal(item);
    }
  }
  return total;
}

export interface QuoteLike {
  id: string;
  status: "draft" | "sent" | "approved";
  created_at: string;
  quote_sections: QuoteSectionLike[];
}

/** Mirrors pickHeadlineQuote() in src/lib/api.ts. */
export function pickHeadlineQuote(quotes: QuoteLike[]): QuoteLike | undefined {
  const byRecency = (a: QuoteLike, b: QuoteLike) => b.created_at.localeCompare(a.created_at);
  const mostRecentWithStatus = (status: QuoteLike["status"]) =>
    quotes.filter((q) => q.status === status).sort(byRecency)[0];
  return mostRecentWithStatus("approved") ?? mostRecentWithStatus("sent") ?? mostRecentWithStatus("draft");
}

export interface MaterialsItemLike {
  quantity: number;
  unit_cost: number;
}
export interface MaterialsSectionLike {
  materials_items: MaterialsItemLike[];
}

/** Mirrors materialsCogs() in src/lib/api.ts. */
export function materialsCogs(sections: MaterialsSectionLike[] = []): number {
  let total = 0;
  for (const section of sections) {
    for (const item of section.materials_items ?? []) {
      total += Number(item.quantity) * Number(item.unit_cost);
    }
  }
  return total;
}

export interface InvoiceLike {
  amount: number;
  status: "draft" | "sent" | "paid" | "overdue";
  due_date: string | null;
  created_at: string;
  quote_id?: string | null;
}

const DAY = 86_400_000;
const parseDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** Mirrors invoiceDaysLate() in src/lib/aging.ts. */
export function invoiceDaysLate(inv: Pick<InvoiceLike, "due_date" | "status">, now: Date = new Date()): number {
  if (!inv.due_date || inv.status === "paid" || inv.status === "draft") return 0;
  return Math.floor((now.getTime() - parseDay(inv.due_date).getTime()) / DAY);
}

export interface MonthPoint {
  key: string;
  month: string;
  revenue: number;
}

const monthKey = (iso: string) => iso.slice(0, 7);
const monthShort = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00").toLocaleString("en-US", { month: "short" });

/** Mirrors monthlyRevenue() in src/lib/metrics.ts. */
export function monthlyRevenue(invoices: Pick<InvoiceLike, "amount" | "created_at">[]): MonthPoint[] {
  const buckets = new Map<string, MonthPoint>();
  for (const inv of invoices) {
    const key = monthKey(inv.created_at);
    const point = buckets.get(key) ?? { key, month: monthShort(inv.created_at), revenue: 0 };
    point.revenue += Number(inv.amount);
    buckets.set(key, point);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Mirrors momChange() in src/lib/metrics.ts. */
export function momChange(points: MonthPoint[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2].revenue;
  const curr = points[points.length - 1].revenue;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export interface CategoryRevenue {
  id: string;
  name: string;
  amount: number;
}

/** Mirrors revenueByCategory() in src/lib/metrics.ts. */
export function revenueByCategory(
  quotes: QuoteLike[],
  invoices: InvoiceLike[],
  categories: { id: string; name: string }[],
): CategoryRevenue[] {
  const totals = new Map<string, number>();
  const add = (categoryId: string | null | undefined, amount: number) => {
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
    const total = quoteTotal(quote.quote_sections);
    if (total <= 0) continue;
    if ((paidByQuote.get(quote.id) ?? 0) < total) continue;
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
