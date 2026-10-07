import { describe, expect, it } from "vitest";
import type { ChangeOrder, Quote } from "./api";
import type { JobCostReport, MatrixRow } from "./jobCosts";
import {
  buildNextActions,
  featureProfitRows,
  overviewStage,
  overviewStatusLabel,
  profitPrice,
  projectNeedsYou,
  recentUpdates,
  timeElapsed,
} from "./projectOverview";

const zero = () => ({ material: 0, labor: 0, subcontractor: 0, equipment: 0, other: 0 });
const cell = (planned: number, actual: number) => ({ planned, actual, variance: actual - planned, pct: null, tone: "none" as const });
function row(key: string, featureId: string | null, name: string, planned: Partial<Record<string, number>>, actual: Partial<Record<string, number>>): MatrixRow {
  const p = { ...zero(), ...planned } as Record<string, number>;
  const a = { ...zero(), ...actual } as Record<string, number>;
  const cells = Object.fromEntries(Object.keys(zero()).map((b) => [b, cell(p[b], a[b])])) as unknown as MatrixRow["cells"];
  const tp = Object.values(p).reduce((s, v) => s + v, 0);
  const ta = Object.values(a).reduce((s, v) => s + v, 0);
  return { key, featureId, name, cells, total: cell(tp, ta) } as MatrixRow;
}
const quote = (sections: { feature_id: string | null; price: number }[]): Quote =>
  ({
    status: "approved",
    kind: "original",
    quote_sections: sections.map((s, i) => ({ id: `s${i}`, feature_id: s.feature_id, is_optional: false, quote_items: [{ price: s.price, quantity: 1, is_optional: false }] })),
  }) as unknown as Quote;

describe("stage + status label", () => {
  it("never says Scheduled without dates, and Ready to start only when readiness is done", () => {
    const won = { status: "scheduled" as const, actual_start_date: null, scheduled_start_date: null };
    expect(overviewStage(won)).toBe("before");
    expect(overviewStatusLabel(won, false)).toBe("Won · not scheduled yet");
    expect(overviewStatusLabel({ ...won, scheduled_start_date: "2026-11-02" }, false)).toBe("Scheduled");
    expect(overviewStatusLabel({ ...won, scheduled_start_date: "2026-11-02" }, true)).toBe("Ready to start");
    expect(overviewStatusLabel({ ...won, actual_start_date: "2026-11-02" }, false)).toBe("In progress");
    expect(overviewStatusLabel({ ...won, status: "complete" }, null)).toBe("Completed");
  });
});

describe("timeElapsed", () => {
  it("counts working days from the actual start and caps the bar, with the real ratio", () => {
    // Mon 2026-10-05 → Fri 2026-10-23 = 15 working days, estimate 12.
    const t = timeElapsed({ estimated_duration_days: 12, actual_start_date: "2026-10-05", actual_end_date: null }, 0, new Date("2026-10-23T12:00:00"));
    expect(t).toMatchObject({ kind: "elapsed", elapsed: 15, estimate: 12, pct: 100, overDays: 3 });
  });
  it("weather days never count as running over", () => {
    const t = timeElapsed({ estimated_duration_days: 12, actual_start_date: "2026-10-05", actual_end_date: null }, 3, new Date("2026-10-23T12:00:00"));
    expect(t).toMatchObject({ kind: "elapsed", overDays: 0, weatherDays: 3 });
  });
  it("empty states", () => {
    expect(timeElapsed({ estimated_duration_days: null, actual_start_date: null, actual_end_date: null }, 0).kind).toBe("no_estimate");
    expect(timeElapsed({ estimated_duration_days: 5, actual_start_date: null, actual_end_date: null }, 0).kind).toBe("not_started");
  });
});

describe("featureProfitRows", () => {
  const quotes = [quote([{ feature_id: "patio", price: 10000 }, { feature_id: "wall", price: 6000 }, { feature_id: null, price: 500 }])];
  const changeOrders: ChangeOrder[] = [];

  it("reconciles with the report totals; labor logged for the whole job gets its own row", () => {
    const report = {
      matrix: [
        row("patio", "patio", "Paver Patio", { material: 4000, labor: 2000 }, { material: 4450 }),
        row("wall", "wall", "Retaining Wall", { material: 2000, labor: 1000 }, {}),
        row("__general__", null, "General", { other: 300 }, { other: 100 }),
        row("labor", "labor", "Labor (whole job)", {}, { labor: 2500 }),
      ],
      laborTracking: "project" as const,
      planned: 9300,
      actual: 7050,
      profit: { expected: 7200, projected: 6450, expectedFullyLoaded: null, projectedFullyLoaded: null, overheadRate: null },
    } as unknown as JobCostReport;
    const { rows, total } = featureProfitRows({ report, quotes, changeOrders, jobOpen: true, materialsCounted: false });
    expect(rows.map((r) => r.name)).toEqual(["Paver Patio", "Retaining Wall", "General / unassigned", "Labor (whole job)"]);
    // Planned + actual add up to the report (the Money tab's numbers).
    expect(rows.reduce((s, r) => s + r.planned, 0)).toBe(9300);
    expect(rows.reduce((s, r) => s + r.actual, 0)).toBe(7050);
    const patio = rows[0];
    expect(patio).toMatchObject({ price: 10000, planned: 4000, actual: 4450, overPlan: 450, laborAtPlan: true });
    // Projected cost: material overrun 4450 + labor at plan 2000.
    expect(patio.margin).toBeCloseTo(((10000 - 6450) / 10000) * 100);
    expect(rows[2].price).toBe(500);
    expect(rows[3]).toMatchObject({ planned: 3000, actual: 2500, price: null, margin: null });
    expect(total).toMatchObject({ price: 16500, planned: 9300, actual: 7050, profit: 6450 });
    expect(total.margin).toBeCloseTo((6450 / 16500) * 100);
  });

  it("no linked price or no planned cost → no margin, with the reason", () => {
    const report = {
      matrix: [row("kitchen", "kitchen", "Outdoor Kitchen", {}, {}), row("patio", "patio", "Paver Patio", {}, {})],
      laborTracking: "none" as const,
      planned: 0,
      actual: 0,
      profit: { expected: 0, projected: 0, expectedFullyLoaded: null, projectedFullyLoaded: null, overheadRate: null },
    } as unknown as JobCostReport;
    const { rows } = featureProfitRows({ report, quotes, changeOrders, jobOpen: true, materialsCounted: false });
    expect(rows[0]).toMatchObject({ margin: null, marginWhy: "No approved quote price linked to this feature" });
    expect(rows[1]).toMatchObject({ margin: null, marginWhy: "No planned cost yet" });
  });

  it("profitPrice counts every approved quote + approved change orders", () => {
    expect(profitPrice(quotes, [])).toBe(16500);
  });
});

describe("next actions + recent updates", () => {
  it("keeps this project's Needs you items, readiness and open tasks, without duplicates", () => {
    const ny = projectNeedsYou(
      [
        { key: "deposit-1", title: "Collect deposit", subtitle: "Smith", href: "/projects/p1/invoices/i1" },
        { key: "co-2", title: "Change order waiting", subtitle: "Jones", href: "/projects/p2/change-orders/c" },
        { key: "quote-3", title: "Quote going cold", subtitle: "Smith", href: "/quotes/q1" },
      ],
      "p1",
      ["q1"],
    );
    expect(ny.map((n) => n.key)).toEqual(["deposit-1", "quote-3"]);
    const actions = buildNextActions({
      projectId: "p1",
      needsYou: ny,
      preconOpen: [{ key: "crew", label: "Crew assigned" }],
      tasks: [
        { id: "t1", title: "Call the HOA", due_at: "2026-10-09", completed: false, project_id: "p1" },
        { id: "t2", title: "Done already", due_at: null, completed: true, project_id: "p1" },
        { id: "t3", title: "Other job", due_at: null, completed: false, project_id: "p2" },
      ],
      extras: [{ key: "schedule", title: "Schedule the job", href: "/projects/p1?tab=schedule" }],
    });
    expect(actions.map((a) => a.title)).toEqual(["Schedule the job", "Collect deposit", "Quote going cold", "Crew assigned", "Call the HOA"]);
    expect(actions.find((a) => a.taskId)?.taskId).toBe("t1");
  });

  it("mixes updates, photos and meaningful events, newest first, capped", () => {
    const items = recentUpdates({
      progress: [{ id: "u1", created_at: "2026-10-05T10:00:00Z", author_employee_id: "e1", milestone: "Base in", note: null, status: "shared", photos: [{ id: "ph", storage_path: "a.jpg", original_path: null }] }],
      images: [
        { id: "i1", created_at: "2026-10-06T10:00:00Z", storage_path: "b.jpg", caption: null },
        { id: "i2", created_at: "2026-10-05T10:00:00Z", storage_path: "a.jpg", caption: null },
      ],
      events: [
        { id: "e1", created_at: "2026-10-07T10:00:00Z", kind: "payment_received", summary: "Payment received" },
        { id: "e2", created_at: "2026-10-08T10:00:00Z", kind: "expense_logged", summary: "Expense" },
      ],
    });
    expect(items.map((i) => i.source)).toEqual(["System", "Photo", "Crew update"]);
  });
});
