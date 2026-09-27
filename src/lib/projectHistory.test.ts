import { describe, expect, it } from "vitest";
import { buildProjectHistory, clientProjectMoney } from "./projectHistory";
import type { PortalProjectDetail } from "./portalApi";

const quote = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "original", status: "approved", deposit_percentage: 30, signed_at: "2026-03-02", signed_by: "Pat",
  declined_at: null, decline_comment: null, created_at: "2026-03-01", total: 28_000, sections: [], ...over,
});
const co = (id: string, n: number, status: string, amount: number, created_at: string) => ({
  id, number: n, title: `CO ${n}`, description: null, reason: null, amount, total: amount, status, schedule_impact_days: 0,
  approved_at: null, approved_by: null, declined_at: null, decline_comment: null, created_at, sections: [],
});

const detail = {
  project: { id: "p", name: "Patio", status: "in_progress", scheduled_start_date: null, scheduled_end_date: null, actual_start_date: null, actual_end_date: null },
  business: { company_name: "Co", phone: null, email: null, logo_url: null },
  quotes: [quote("q"), quote("a1", { kind: "addon", addon_number: 1, total: 2_000, created_at: "2026-05-01" }), quote("a2", { kind: "addon", addon_number: 2, status: "sent", total: 9_000, created_at: "2026-05-02" })],
  change_orders: [co("c1", 1, "approved", 3_500, "2026-04-01"), co("c2", 2, "declined", 1_000, "2026-04-02"), co("c3", 3, "approved", -500, "2026-04-03")],
  invoices: [{ id: "i1", invoice_number: "INV-001", amount: 10_000, amount_paid: 4_000, status: "sent", due_date: null, paid_at: null, created_at: "2026-03-05" }],
  payments: [
    { token: "t1", receipt_number: "R-0001", amount: 5_000, paid_on: "2026-03-06", method: "check", reference: "12", status: "active", voided_at: null, created_at: "x", applied_to: [{ invoice_id: "i1", invoice_number: "INV-001", amount: 4_000 }] },
    { token: "t2", receipt_number: "R-0002", amount: 700, paid_on: "2026-03-07", method: "cash", reference: null, status: "void", voided_at: "x", created_at: "x", applied_to: [] },
  ],
  versions: [
    { doc_type: "quote", doc_id: "q", version: 1, state: "sent", event: "sent", total: 30_000, approval: null, created_at: "2026-02-01", decided_at: null, content: quote("q", { status: "sent", total: 30_000 }) },
    { doc_type: "quote", doc_id: "q", version: 2, state: "approved", event: "sent", total: 28_000, approval: { name: "Pat", at: "2026-03-02" }, created_at: "2026-03-01", decided_at: "2026-03-02", content: quote("q") },
  ],
  photos: [], deliveries: [], events: [],
} as unknown as PortalProjectDetail;

describe("project history", () => {
  it("lists every version, labels superseded and uncounted entries, newest first", () => {
    const h = buildProjectHistory(detail);
    expect(h.map((e) => e.title)).toEqual([
      "Add-on quote #2",
      "Add-on quote #1",
      "Change order #3 · CO 3",
      "Change order #2 · CO 2",
      "Change order #1 · CO 1",
      "Payment received · R-0002",
      "Payment received · R-0001",
      "Invoice INV-001",
      "Revised quote v2",
      "Original quote v1",
    ]);
    const byTitle = Object.fromEntries(h.map((e) => [e.title, e]));
    expect(byTitle["Original quote v1"].note).toBe("Superseded by v2");
    expect(byTitle["Original quote v1"].counted).toBe(false);
    expect(byTitle["Original quote v1"].href).toEqual({ doc: { kind: "quote", id: "q", version: 1 } });
    expect(byTitle["Revised quote v2"].counted).toBe(true);
    expect(byTitle["Change order #2 · CO 2"].counted).toBe(false);
    expect(byTitle["Add-on quote #2"].note).toMatch(/not included/);
    expect(byTitle["Payment received · R-0002"].struck).toBe(true);
    expect(byTitle["Invoice INV-001"].status.label).toBe("Partially paid");
    expect(buildProjectHistory(detail, "oldest")[0].title).toBe("Original quote v1");
  });

  it("money blocks: contract math and balances from the shared summary", () => {
    const { breakdown, summary, unpaidInvoices } = clientProjectMoney(detail);
    expect(breakdown.total).toBe(28_000 + 3_500 - 500 + 2_000);
    expect(summary.received).toBe(5_000); // void excluded
    expect(summary.unpaidInvoiceBalance).toBe(6_000);
    expect(summary.remaining).toBe(33_000 - 5_000);
    expect(unpaidInvoices.map((i) => i.id)).toEqual(["i1"]);
  });
});
