// Pure math ported from the main app's src/lib/{api,financials}.ts.
//
// This Edge Function runs on Deno and can't import those files directly —
// src/lib/api.ts pulls in src/lib/supabase.ts, which reads import.meta.env
// (a Vite/browser-only mechanism) and throws if it's missing. So the small
// set of pure formulas actually needed here are duplicated, not shared.
// If these drift from the client versions, the assistant's numbers will
// disagree with what the app displays — keep them in sync by hand when the
// source functions change.
//
// Canonical definitions (must match src/lib/{api,financials}.ts exactly):
//   - quoteTotal() already only counts required + selected-optional items.
//   - A project's contract value = quoteTotal() + APPROVED change orders
//     only (approvedChangeOrderTotal()).
//   - "Invoiced" never counts a draft invoice.
//   - Revenue by category means COLLECTED (paid invoices), not invoiced.

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

export interface ChangeOrderLike {
  status: "draft" | "sent" | "approved" | "declined";
  amount: number;
}

/** Mirrors approvedChangeOrderTotal() in src/lib/api.ts — approved change
 * orders only; pending/declined never count toward contract value. */
export function approvedChangeOrderTotal(changeOrders: ChangeOrderLike[]): number {
  return changeOrders.filter((co) => co.status === "approved").reduce((sum, co) => sum + Number(co.amount), 0);
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

/** Mirrors invoiceDaysLate() in src/lib/financials.ts. */
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

/** Mirrors monthlyRevenue() in src/lib/financials.ts. */
export function monthlyRevenue(invoices: Pick<InvoiceLike, "amount" | "created_at" | "status">[]): MonthPoint[] {
  const buckets = new Map<string, MonthPoint>();
  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    const key = monthKey(inv.created_at);
    const point = buckets.get(key) ?? { key, month: monthShort(inv.created_at), revenue: 0 };
    point.revenue += Number(inv.amount);
    buckets.set(key, point);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Mirrors momChange() in src/lib/financials.ts. */
export function momChange(points: MonthPoint[]): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2].revenue;
  const curr = points[points.length - 1].revenue;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/** Mirrors formatCurrency() in src/lib/utils.ts. */
export function formatCurrency(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export interface CategoryRevenue {
  id: string;
  name: string;
  amount: number;
}

/**
 * Mirrors collectedByCategory() in src/lib/financials.ts — same collected
 * (cash-received) basis as the real Revenue page: each PAID invoice's
 * dollar amount is split across categories in proportion to its linked
 * quote's committed line items' category mix, not gated on the whole quote
 * being fully paid off. A paid invoice with no quote, or whose quote has no
 * categorized items, counts its full amount toward Uncategorized.
 */
export function collectedByCategory(
  quotes: QuoteLike[],
  invoices: InvoiceLike[],
  categories: { id: string; name: string }[],
): CategoryRevenue[] {
  const totals = new Map<string, number>();
  const add = (categoryId: string | null | undefined, amount: number) => {
    const key = categoryId ?? "uncategorized";
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  const quotesById = new Map(quotes.map((q) => [q.id, q]));

  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const amount = Number(inv.amount);
    const quote = inv.quote_id ? quotesById.get(inv.quote_id) : undefined;
    if (!quote) {
      add(null, amount);
      continue;
    }
    const itemTotals = new Map<string, number>();
    let committedTotal = 0;
    for (const section of quote.quote_sections) {
      for (const item of section.quote_items ?? []) {
        if (!quoteItemIncluded(section, item)) continue;
        const key = item.category_id ?? "uncategorized";
        const lineTotal = quoteLineTotal(item);
        itemTotals.set(key, (itemTotals.get(key) ?? 0) + lineTotal);
        committedTotal += lineTotal;
      }
    }
    if (committedTotal <= 0) {
      add(null, amount);
      continue;
    }
    for (const [key, lineTotal] of itemTotals) {
      add(key === "uncategorized" ? null : key, (lineTotal / committedTotal) * amount);
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
