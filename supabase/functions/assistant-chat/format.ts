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
export interface SelectionGroupRowLike {
  approved_price?: number | null;
  quote_selection_options?: { id: string; price_delta: number; is_default: boolean }[];
  quote_selection_picks?: { option_id: string }[];
}
export interface QuoteSectionLike {
  is_optional: boolean;
  quote_items: QuoteItemLike[];
  /** Client Selections (0115) — each group's chosen (or default) option prices. */
  quote_selection_groups?: SelectionGroupRowLike[];
}

/** Mirrors groupPrice() / effectiveOptions() in src/lib/selections.ts:
 * the approved price once locked, else the picks (or the defaults). */
export function selectionGroupPrice(g: SelectionGroupRowLike): number {
  if (g.approved_price != null) return Number(g.approved_price);
  const options = g.quote_selection_options ?? [];
  const picked = (g.quote_selection_picks ?? []).map((p) => p.option_id);
  const ids = picked.length ? picked : options.filter((o) => o.is_default).map((o) => o.id);
  return options.filter((o) => ids.includes(o.id)).reduce((sum, o) => sum + (Number(o.price_delta) || 0), 0);
}

/** Mirrors sectionIncluded() in src/lib/selections.ts. */
function sectionIncluded(section: QuoteSectionLike): boolean {
  if (!section.is_optional) return true;
  return (section.quote_items ?? []).some((i) => i.client_selected);
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
    if (section.quote_selection_groups?.length && sectionIncluded(section)) {
      for (const g of section.quote_selection_groups) total += selectionGroupPrice(g);
    }
  }
  return total;
}

export interface QuoteLike {
  id: string;
  status: "draft" | "sent" | "approved";
  created_at: string;
  /** 'addon' (0108) — new features on a Won job; never the headline. */
  kind?: "original" | "addon";
  quote_sections: QuoteSectionLike[];
}

/** Mirrors pickHeadlineQuote() in src/lib/api.ts. */
export function pickHeadlineQuote(quotes: QuoteLike[]): QuoteLike | undefined {
  const byRecency = (a: QuoteLike, b: QuoteLike) => b.created_at.localeCompare(a.created_at);
  const originals = quotes.filter((q) => (q.kind ?? "original") === "original");
  const mostRecentWithStatus = (status: QuoteLike["status"]) =>
    originals.filter((q) => q.status === status).sort(byRecency)[0];
  return mostRecentWithStatus("approved") ?? mostRecentWithStatus("sent") ?? mostRecentWithStatus("draft");
}

/** Mirrors approvedAddonQuoteTotal() in src/lib/api.ts. */
export function approvedAddonQuoteTotal(quotes: QuoteLike[]): number {
  return quotes.filter((q) => q.kind === "addon" && q.status === "approved").reduce((s, q) => s + quoteTotal(q.quote_sections), 0);
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

// ---------------------------------------------------------------------------
// Cost plan (stored as materials_sheets/sections/items). Mirrors
// src/lib/costPlanMath.ts — typed lines (material keeps waste %, every other
// type is quantity × rate) plus each section's labor block (crew × days ×
// hours/day × rate, or a lump sum).
// ---------------------------------------------------------------------------

export type CostBucket = "material" | "labor" | "subcontractor" | "equipment" | "other";
export const COST_BUCKETS: CostBucket[] = ["material", "labor", "subcontractor", "equipment", "other"];
export type CostTotals = Record<CostBucket, number> & { total: number; tax: number; subtotal: number };

export interface CostLineLike {
  quantity: number;
  unit_cost: number;
  waste_percent?: number | null;
  cost_type?: Exclude<CostBucket, "labor"> | null;
  /** 0163 — sales tax the contractor pays (effective %). */
  taxable?: boolean | null;
  tax_rate?: number | null;
}
export interface CostSectionLike {
  materials_items: CostLineLike[];
  labor_mode?: "crew" | "hours" | "lump_sum" | null;
  labor_man_hours?: number | null;
  labor_crew_size?: number | null;
  labor_days?: number | null;
  labor_hours_per_day?: number | null;
  labor_rate?: number | null;
  labor_lump_sum?: number | null;
}

const n = (v: unknown) => (isFinite(Number(v)) ? Number(v) : 0);
const zeroTotals = (): CostTotals => ({ material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0, total: 0, tax: 0, subtotal: 0 });

export function sectionLaborCost(s: CostSectionLike): number {
  if (s.labor_mode === "lump_sum") return n(s.labor_lump_sum);
  if (s.labor_mode === "crew") return n(s.labor_crew_size) * n(s.labor_days) * n(s.labor_hours_per_day) * n(s.labor_rate);
  if (s.labor_mode === "hours") return n(s.labor_man_hours) * n(s.labor_rate);
  return 0;
}

/** Mirrors sumSectionTotals() in src/lib/costPlanMath.ts. */
export function costPlanTotals(sections: CostSectionLike[] = []): CostTotals {
  const t = zeroTotals();
  for (const section of sections) {
    for (const item of section.materials_items ?? []) {
      const type = item.cost_type ?? "material";
      const cost =
        type === "material"
          ? n(item.quantity) * (1 + n(item.waste_percent) / 100) * n(item.unit_cost)
          : n(item.quantity) * n(item.unit_cost);
      // Sales tax (0163): after-tax by type, rounded per line like lineTax().
      const tax = item.taxable ? Math.round(((cost * n(item.tax_rate)) / 100) * 100) / 100 : 0;
      t[type] += cost + tax;
      t.tax += tax;
    }
    t.labor += sectionLaborCost(section);
  }
  t.total = COST_BUCKETS.reduce((s, k) => s + t[k], 0);
  t.subtotal = t.total - t.tax;
  return t;
}

export interface ExpenseLike {
  amount: number;
  expense_category_id: string | null;
  expense_lines?: { amount: number; expense_category_id: string | null }[];
}

/** Mirrors actualCostByType() in src/lib/costPlan.ts — expenses matched to a
 * type through their category's cost_type (split expenses per line;
 * uncategorized → other; a category with no type → material), plus actual
 * labor logged. */
export function actualCostByType(
  expenses: ExpenseLike[],
  categories: { id: string; cost_type: CostBucket | null }[],
  laborActual = 0,
): CostTotals {
  const bucket = (id: string | null): CostBucket =>
    !id ? "other" : (categories.find((c) => c.id === id)?.cost_type ?? "material");
  const t = zeroTotals();
  for (const e of expenses) {
    const lines = e.expense_lines ?? [];
    if (lines.length > 1) for (const l of lines) t[bucket(l.expense_category_id)] += n(l.amount);
    else t[bucket(e.expense_category_id)] += n(e.amount);
  }
  t.labor += laborActual;
  t.total = COST_BUCKETS.reduce((s, k) => s + t[k], 0);
  return t;
}

/** Only the non-zero buckets — keeps the tool result small. */
export function nonZeroBuckets(t: CostTotals): Partial<Record<CostBucket, number>> {
  return Object.fromEntries(COST_BUCKETS.filter((k) => t[k] !== 0).map((k) => [k, Math.round(t[k] * 100) / 100]));
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

export interface PaymentLike {
  amount: number;
  status: "active" | "void";
  project_id: string | null;
  payment_allocations?: { invoice_id: string; amount: number }[];
}

/**
 * Mirrors collectedByCategory() in src/lib/financials.ts — collected basis
 * (0111): every ACTIVE payment. The part applied to an invoice is split by
 * that invoice's linked quote's committed line-item category mix; the
 * unallocated part by the project's contract mix (headline original quote
 * + approved add-ons). No quote / no categorized items → Uncategorized.
 */
export function collectedByCategory(
  quotes: (QuoteLike & { project_id?: string | null })[],
  invoices: (InvoiceLike & { id: string; project_id?: string | null })[],
  categories: { id: string; name: string }[],
  payments: PaymentLike[],
): CategoryRevenue[] {
  const totals = new Map<string, number>();
  const add = (categoryId: string | null | undefined, amount: number) => {
    const key = categoryId ?? "uncategorized";
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  const quotesById = new Map(quotes.map((q) => [q.id, q]));
  const invoicesById = new Map(invoices.map((i) => [i.id, i]));
  const spread = (mix: QuoteLike[], amount: number) => {
    const itemTotals = new Map<string, number>();
    let committedTotal = 0;
    for (const quote of mix) {
      for (const section of quote.quote_sections ?? []) {
        for (const item of section.quote_items ?? []) {
          if (!quoteItemIncluded(section, item)) continue;
          const key = item.category_id ?? "uncategorized";
          const lineTotal = quoteLineTotal(item);
          itemTotals.set(key, (itemTotals.get(key) ?? 0) + lineTotal);
          committedTotal += lineTotal;
        }
      }
    }
    if (committedTotal <= 0) return add(null, amount);
    for (const [key, lineTotal] of itemTotals) add(key === "uncategorized" ? null : key, (lineTotal / committedTotal) * amount);
  };
  const projectMix = (projectId: string | null | undefined): QuoteLike[] => {
    if (!projectId) return [];
    const list = quotes.filter((q) => q.project_id === projectId);
    const headline = pickHeadlineQuote(list);
    return [...(headline ? [headline] : []), ...list.filter((q) => q.kind === "addon" && q.status === "approved")];
  };

  for (const p of payments) {
    if (p.status === "void") continue;
    let applied = 0;
    for (const a of p.payment_allocations ?? []) {
      applied += Number(a.amount);
      const inv = invoicesById.get(a.invoice_id);
      const quote = inv?.quote_id ? quotesById.get(inv.quote_id) : undefined;
      spread(quote ? [quote] : projectMix(inv?.project_id ?? p.project_id), Number(a.amount));
    }
    const credit = Number(p.amount) - applied;
    if (credit > 0.004) spread(projectMix(p.project_id), credit);
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
