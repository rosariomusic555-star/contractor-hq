import { describe, expect, it } from "vitest";
import {
  bookedItems,
  collectedItems,
  comparePeriod,
  invoicedItems,
  isoOf,
  makeJobProfit,
  pctChange,
  profitTotals,
  resolvePeriod,
  revenueReport,
  sumIn,
} from "./revenueReport";

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = new Date(2026, 8, 29, 15, 0); // Sep 29, 2026 3 pm local
const iso = (p: { start: Date; end: Date }) => [isoOf(p.start), isoOf(p.end)];

describe("periods", () => {
  it("resolves each preset to [start, end)", () => {
    expect(iso(resolvePeriod("this_month", undefined, NOW))).toEqual(["2026-09-01", "2026-09-30"]);
    expect(iso(resolvePeriod("last_month", undefined, NOW))).toEqual(["2026-08-01", "2026-09-01"]);
    expect(iso(resolvePeriod("this_quarter", undefined, NOW))).toEqual(["2026-07-01", "2026-09-30"]);
    expect(iso(resolvePeriod("ytd", undefined, NOW))).toEqual(["2026-01-01", "2026-09-30"]);
    expect(iso(resolvePeriod("last_year", undefined, NOW))).toEqual(["2025-01-01", "2026-01-01"]);
    expect(iso(resolvePeriod("last_12", undefined, NOW))).toEqual(["2025-10-01", "2026-09-30"]);
    expect(iso(resolvePeriod("custom", { start: "2026-03-10", end: "2026-03-20" }, NOW))).toEqual(["2026-03-10", "2026-03-21"]);
  });

  it("compares with the previous period or the same dates last year", () => {
    const month = resolvePeriod("this_month", undefined, NOW);
    expect(iso(comparePeriod(month, "previous")!)).toEqual(["2026-08-01", "2026-08-30"]); // same days of last month
    expect(iso(comparePeriod(month, "last_year")!)).toEqual(["2025-09-01", "2025-09-30"]);
    const q = resolvePeriod("this_quarter", undefined, NOW);
    expect(iso(comparePeriod(q, "previous")!)).toEqual(["2026-04-01", "2026-06-30"]);
    const custom = resolvePeriod("custom", { start: "2026-03-10", end: "2026-03-19" }, NOW); // 10 days
    expect(iso(comparePeriod(custom, "previous")!)).toEqual(["2026-02-28", "2026-03-10"]);
    expect(comparePeriod(month, "none")).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(150, 0)).toBeNull();
  });
});

const project = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: `Job ${id}`, status: "in_progress", client_id: `c-${id}`, created_at: "2026-01-01T00:00:00Z", opportunities: [], ...extra }) as any;
const section = (price: number, extra: Record<string, unknown> = {}) =>
  ({ id: `s${price}`, is_optional: false, feature_id: null, quote_items: [{ price, quantity: 1, is_optional: false }], ...extra }) as any;

describe("the three revenue bases", () => {
  const projects = [project("a"), project("b", { status: "estimating" })];
  const quotes = [
    // signed Sep 28 at 11 pm local — must stay in September
    { id: "q1", project_id: "a", status: "approved", kind: "original", signed_at: new Date(2026, 8, 28, 23, 0).toISOString(), quote_sections: [section(20000)] },
    { id: "q2", project_id: "a", status: "sent", kind: "original", quote_sections: [section(99999)] }, // unsigned: never booked
    { id: "q3", project_id: "a", status: "approved", kind: "addon", signed_at: "2026-09-10T12:00:00Z", quote_sections: [section(3000)] },
    { id: "q4", project_id: "b", status: "approved", kind: "original", signed_at: "2026-09-10T12:00:00Z", quote_sections: [section(5000)] }, // estimating project
  ] as any;
  const cos = [{ id: "co1", project_id: "a", status: "approved", amount: 1500, approved_at: "2026-08-15T12:00:00Z" }] as any;
  const sep = resolvePeriod("this_month", undefined, NOW);
  const aug = resolvePeriod("last_month", undefined, NOW);

  it("booked = signed original + add-on quotes by signing date, approved change orders by approval date", () => {
    const b = bookedItems(projects, quotes, cos);
    expect(b.map((i) => i.key).sort()).toEqual(["co-co1", "q-q1", "q-q3"]);
    expect(sumIn(b, sep)).toBe(23000);
    expect(sumIn(b, aug)).toBe(1500);
  });

  it("invoiced = non-draft invoices by created date", () => {
    const inv = invoicedItems(
      [
        { id: "i1", project_id: "a", status: "sent", amount: 6000, created_at: "2026-09-02T14:00:00Z" },
        { id: "i2", project_id: "a", status: "draft", amount: 9000, created_at: "2026-09-03T14:00:00Z" },
        { id: "i3", project_id: "a", status: "paid", amount: 4000, created_at: "2026-08-20T14:00:00Z" },
      ] as any,
      projects,
    );
    expect(sumIn(inv, sep)).toBe(6000);
    expect(sumIn(inv, aug)).toBe(4000);
  });

  it("collected = active payments by the day paid, voided left out", () => {
    const col = collectedItems(
      [
        { id: "p1", project_id: "a", status: "active", amount: 5000, paid_on: "2026-09-01", method: "check", payment_allocations: [] },
        { id: "p2", project_id: "a", status: "void", amount: 700, paid_on: "2026-09-05", method: "cash", payment_allocations: [] },
        { id: "p3", project_id: "a", status: "active", amount: 200, paid_on: "2026-08-31", method: "card", payment_allocations: [] },
      ] as any,
      projects,
    );
    expect(sumIn(col, sep)).toBe(5000);
    expect(sumIn(col, aug)).toBe(200);
  });
});

describe("profit on completed jobs", () => {
  const base = {
    quotes: [] as any[],
    changeOrders: [] as any[],
    sections: [] as any[],
    expenses: [] as any[],
    expenseCategories: [],
    laborEntries: [] as any[],
    materialOrders: [] as any[],
    usageLogs: [] as any[],
    features: [] as any[],
    categories: [],
    burden: null,
  };

  it("uses the closeout's frozen numbers when there is one, else the live report; margin is dollar-weighted", () => {
    const projects = [
      project("x", { status: "complete", completed_at: "2026-09-10T15:00:00Z" }),
      project("y", { status: "complete", completed_at: "2026-09-12T15:00:00Z" }),
    ];
    const closeouts = [
      {
        id: "cl",
        project_id: "x",
        excluded: false,
        superseded_at: null,
        completed_on: "2026-09-10",
        created_at: "2026-09-11T00:00:00Z",
        snapshot: { report: { project: { price: 10000, total: { actual: 7000 } }, profit: { actual: 3000, expected: 3500, actualFullyLoaded: 2000, expectedFullyLoaded: 2500 }, features: [] } },
      },
    ] as any;
    const quotes = [{ id: "qy", project_id: "y", status: "approved", kind: "original", signed_at: "2026-08-01T12:00:00Z", quote_sections: [section(40000)] }];
    const sections = [{ id: "sy", project_id: "y", feature_id: null, feature: null, labor_mode: null, materials_items: [{ id: "m", name: "Pavers", quantity: 100, unit_cost: 200, waste_percent: 0, cost_type: "subcontractor", materials_item_baselines: [], tracked: true }] }];
    const jp = makeJobProfit({ ...base, projects, closeouts, quotes: quotes as any, sections: sections as any });
    expect(jp("x")).toMatchObject({ source: "closeout", price: 10000, profit: 3000, fullyLoaded: 2000 });
    const y = jp("y")!;
    expect(y).toMatchObject({ source: "live", price: 40000, profit: 20000 });
    // Dollar-weighted: (3000 + 20000) / (10000 + 40000) = 46%, not the average of 30% and 50%.
    const t = profitTotals([jp("x")!, y]);
    expect(t.marginPct).toBeCloseTo(46);
  });

  it("the report: headline with comparison, won jobs, upsell share, revenue type, payment methods", () => {
    const projects = [project("a"), project("m", { opportunities: [{ id: "o", stage: "won", source_project_id: "a" }] })];
    const quotes = [
      { id: "q1", project_id: "a", status: "approved", kind: "original", signed_at: "2026-09-05T12:00:00Z", quote_sections: [section(20000)] },
      { id: "q2", project_id: "m", status: "approved", kind: "original", signed_at: "2026-09-06T12:00:00Z", quote_sections: [section(800)] },
      { id: "q0", project_id: "a", status: "approved", kind: "addon", signed_at: "2026-08-05T12:00:00Z", quote_sections: [section(1000)] },
    ];
    const cos = [{ id: "co", project_id: "a", status: "approved", amount: 1200, approved_at: "2026-09-20T12:00:00Z", change_order_sections: [] }];
    const payments = [
      { id: "p1", project_id: "a", status: "active", amount: 6000, paid_on: "2026-09-08", method: "check", payment_allocations: [] },
      { id: "p2", project_id: "a", status: "active", amount: 500, paid_on: "2026-09-09", method: "card", payment_allocations: [] },
    ];
    const period = resolvePeriod("this_month", undefined, NOW);
    const r = revenueReport({
      ...base,
      projects,
      quotes: quotes as any,
      changeOrders: cos as any,
      closeouts: [],
      invoices: [],
      payments: payments as any,
      clients: [],
      opportunities: [],
      crews: [],
      spend: [],
      period,
      compare: comparePeriod(period, "previous"),
      basis: "booked",
    });
    expect(r.headline.now).toEqual({ booked: 22000, invoiced: 0, collected: 6500 });
    expect(r.headline.before!.booked).toBe(1000);
    expect(r.headline.jobsWon).toBe(2);
    expect(r.headline.avgJob).toBe(10400);
    expect(r.headline.upsell).toBe(1200);
    expect(r.headline.upsellPct).toBeCloseTo((1200 / 22000) * 100);
    expect(Object.fromEntries(r.revenueType.map((t) => [t.key, t.amount]))).toEqual({ original: 20000, change_order: 1200, addon: 0, maintenance: 800 });
    expect(r.paymentMethods.map((m) => [m.key, m.amount, m.count])).toEqual([["check", 6000, 1], ["card", 500, 1]]);
    // zero-filled trend: 12 months ending this month
    expect(r.trend).toHaveLength(12);
    expect(r.trend[11]).toMatchObject({ month: "2026-09", booked: 22000, collected: 6500 });
    expect(r.trend[10]).toMatchObject({ month: "2026-08", booked: 1000 });
  });
});

describe("revenue export", () => {
  it("CSV carries the period, basis, headline and jobs; the PDF builds", async () => {
    const { revenueCsv, buildRevenuePdf } = await import("./revenueExport");
    const period = resolvePeriod("this_month", undefined, NOW);
    const r = revenueReport({
      projects: [project("a")],
      quotes: [{ id: "q1", project_id: "a", status: "approved", kind: "original", signed_at: "2026-09-05T12:00:00Z", quote_sections: [section(20000)] }] as any,
      changeOrders: [],
      sections: [],
      expenses: [],
      expenseCategories: [],
      laborEntries: [],
      materialOrders: [],
      usageLogs: [],
      features: [],
      categories: [],
      closeouts: [],
      burden: null,
      invoices: [],
      payments: [],
      clients: [],
      opportunities: [],
      crews: [],
      spend: [],
      period,
      compare: null,
      basis: "booked",
    });
    const csv = revenueCsv({ report: r, period, compare: null, basis: "booked", businessName: "Biz" });
    expect(csv).toContain("Basis: Booked");
    expect(csv).toContain("Booked,20000");
    expect(csv).toContain("Job a,");
    expect(buildRevenuePdf({ report: r, period, compare: null, basis: "booked", businessName: "Biz" }).getNumberOfPages()).toBeGreaterThan(0);
  });
});
