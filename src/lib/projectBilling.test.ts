import { describe, it, expect } from "vitest";
import type { ChangeOrder, Invoice } from "./api";
import {
  changeOrderDecisionLine,
  changeOrderNumbers,
  changeOrderSummary,
  invoiceClientStep,
  invoiceKindLabel,
  invoicesNeedingAttention,
  invoicesPaidLine,
  invoiceTiming,
  invoicesByChangeOrder,
  changeOrderInvoiceable,
  quoteDecisionLine,
  quoteKindLabel,
  quoteSummary,
} from "./projectBilling";

const now = new Date("2026-10-10T12:00:00");
const inv = (p: Partial<Invoice>): Invoice =>
  ({ id: Math.random().toString(), project_id: "p", quote_id: null, change_order_id: null, user_id: "u", amount: 1000, status: "sent", due_date: null, notes: null, share_token: "t", paid_at: null, amount_paid: 0, invoice_number: "INV-001", viewed_at: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...p }) as Invoice;
const co = (p: Partial<ChangeOrder>): ChangeOrder =>
  ({ id: Math.random().toString(), project_id: "p", user_id: "u", title: "More pavers", description: null, reason: null, amount: 500, status: "draft", schedule_impact_days: null, approved_at: null, approved_by: null, approved_ip: null, declined_at: null, decline_comment: null, share_token: null, signed_at: null, signed_by: null, created_at: "2026-10-01T00:00:00Z", material_sheet_id: null, ...p }) as ChangeOrder;

describe("project invoices page", () => {
  it("labels what an invoice bills", () => {
    const nums = new Map([["co1", "CO-002"]]);
    expect(invoiceKindLabel({ notes: "Deposit", change_order_id: null }, nums)).toBe("Deposit");
    expect(invoiceKindLabel({ notes: null, change_order_id: "co1" }, nums)).toBe("Change order CO-002");
    expect(invoiceKindLabel({ notes: null, change_order_id: null }, nums)).toBe("Progress / balance");
  });

  it("timing: late, due today, due soon, paid, draft", () => {
    expect(invoiceTiming(inv({ due_date: "2026-10-01" }), now)).toEqual({ text: "9 days late", tone: "bad" });
    expect(invoiceTiming(inv({ due_date: "2026-10-10" }), now)).toEqual({ text: "Due today", tone: "warn" });
    expect(invoiceTiming(inv({ due_date: "2026-10-12" }), now)).toEqual({ text: "Due in 2 days", tone: "warn" });
    expect(invoiceTiming(inv({ due_date: "2026-10-30" }), now).tone).toBe("muted");
    expect(invoiceTiming(inv({ status: "paid", amount_paid: 1000, paid_at: "2026-10-05T15:00:00Z" }), now).text).toBe("Paid Oct 5, 2026");
    expect(invoiceTiming(inv({ status: "draft", due_date: "2026-10-01" }), now).text).toBe("Not sent yet");
  });

  it("client step and the attention band", () => {
    expect(invoiceClientStep(inv({})).label).toBe("Sent · not opened");
    expect(invoiceClientStep(inv({ viewed_at: "2026-10-02T00:00:00Z" })).label).toBe("Viewed");
    expect(invoiceClientStep(inv({ amount_paid: 300 })).label).toBe("Partially paid");
    const list = [
      inv({ id: "late", due_date: "2026-10-01" }),
      inv({ id: "unopened", due_date: "2026-10-20" }),
      inv({ id: "viewed", due_date: "2026-10-20", viewed_at: "2026-10-03T00:00:00Z" }),
      inv({ id: "paid", status: "paid", amount_paid: 1000 }),
      inv({ id: "draft", status: "draft" }),
    ];
    const a = invoicesNeedingAttention(list, now);
    expect([a.overdue, a.notOpened, a.viewedUnpaid].map((x) => x.map((i) => i.id))).toEqual([["late"], ["unopened"], ["viewed"]]);
    expect(invoicesPaidLine(list)).toBe("1 of 4 paid");
  });
});

describe("project change orders page", () => {
  it("numbers by creation order and sums the contract story", () => {
    const list = [
      co({ id: "b", created_at: "2026-10-03T00:00:00Z", status: "approved", amount: 1200, schedule_impact_days: 2 }),
      co({ id: "a", created_at: "2026-10-01T00:00:00Z", status: "approved", amount: -200 }),
      co({ id: "c", created_at: "2026-10-05T00:00:00Z", status: "sent", amount: 800, schedule_impact_days: 3 }),
      co({ id: "d", created_at: "2026-10-06T00:00:00Z", status: "declined", amount: 999 }),
    ];
    expect(changeOrderNumbers(list).get("b")).toBe("CO-002");
    expect(changeOrderSummary(list, 21000)).toEqual({ original: 20000, approvedChanges: 1000, current: 21000, pending: { count: 1, total: 800 }, scheduleDays: 2 });
  });

  it("decision lines say who and how", () => {
    expect(changeOrderDecisionLine(co({ status: "approved", approved_at: "2026-10-02T12:00:00Z", signed_by: "Greg" }))).toBe("Approved Oct 2, 2026 by Greg");
    expect(
      changeOrderDecisionLine(co({ status: "approved", approved_at: "2026-10-02T12:00:00Z", signed_by: "Greg", approved_manually_by: "Rosa", approval_method: "paper" })),
    ).toBe("Approved on paper Oct 2, 2026 by Greg — recorded by Rosa");
    expect(changeOrderDecisionLine(co({ status: "sent" }))).toBe("Waiting on the client");
    expect(changeOrderDecisionLine(co({ status: "declined", declined_at: "2026-10-04T12:00:00Z", decline_comment: "Too much" }))).toBe('Declined Oct 4, 2026 — "Too much"');
  });

  it("finds each change order's invoices", () => {
    const m = invoicesByChangeOrder([inv({ id: "i1", change_order_id: "x" }), inv({ id: "i2" })]);
    expect(m.get("x")?.map((i) => i.id)).toEqual(["i1"]);
    expect(m.size).toBe(1);
  });
});

describe("project quotes page", () => {
  const q = (p: Record<string, unknown>) => ({ id: Math.random().toString(), kind: "original", status: "draft", signed_at: null, signed_by: null, approved_manually_by: null, approval_method: null, declined_at: null, decline_comment: null, updated_at: "2026-09-20T12:00:00Z", sent_at: null, view_count: 0, first_viewed_at: null, last_viewed_at: null, last_view_device: null, selections_changed_at: null, ...p }) as never;

  it("labels originals, options and add-ons", () => {
    const signed = q({ id: "a", status: "approved" });
    const addon = q({ id: "b", kind: "addon", status: "sent" });
    const alt = q({ id: "c" });
    const all = [signed, addon, alt];
    const nums = new Map([["b", 1]]);
    expect(quoteKindLabel(signed, all, nums)).toBe("Original quote");
    expect(quoteKindLabel(addon, all, nums)).toBe("Add-on #1");
    expect(quoteKindLabel(alt, all, nums)).toBe("Option / revision");
    expect(quoteKindLabel(alt, [alt], nums)).toBe("Quote");
  });

  it("decision lines: hub signature, manual approval, decline, out with the client, draft", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(quoteDecisionLine(q({ status: "approved", signed_at: "2026-09-24T12:00:00Z", signed_by: "Greg" }), now)).toBe("Signed Sep 24, 2026 by Greg in the Client Hub");
    expect(quoteDecisionLine(q({ status: "approved", signed_at: "2026-09-24T12:00:00Z", signed_by: "Greg", approved_manually_by: "Rosa", approval_method: "in_person" }), now)).toBe(
      "Approved in person Sep 24, 2026 by Greg — recorded by Rosa",
    );
    expect(quoteDecisionLine(q({ status: "declined", declined_at: "2026-10-01T12:00:00Z", decline_comment: "Over budget" }), now)).toBe('Declined Oct 1, 2026 — "Over budget"');
    expect(quoteDecisionLine(q({ status: "sent", sent_at: "2026-10-08T12:00:00Z" }), now)).toBe("Not opened yet · sent 2 days ago");
    expect(quoteDecisionLine(q({}), now)).toBe("Draft · last edited Sep 20, 2026");
  });

  it("sums by state", () => {
    const list = [q({ status: "sent", t: 100 }), q({ status: "sent", t: 50 }), q({ status: "draft", t: 20 }), q({ status: "declined", t: 999 })];
    const withTotals = list as unknown as ({ status: "sent" | "draft" | "declined" } & { t: number })[];
    expect(quoteSummary(withTotals as never[], (x) => (x as unknown as { t: number }).t)).toEqual({ sent: { count: 2, total: 150 }, drafts: { count: 1, total: 20 }, declined: 1 });
  });
});

// Money bug (2026-09-28): a change order could be invoiced again and again
// (the builder never checked; the list offered "Create another invoice").
describe("a change order is invoiced once", () => {
  it("only approved, positive and not yet billed", () => {
    expect(changeOrderInvoiceable({ status: "approved", amount: 1800 }, [])).toEqual({ ok: true });
    expect(changeOrderInvoiceable({ status: "approved", amount: 1800 }, [{ id: "inv-3" }])).toEqual({ ok: false, reason: "already_invoiced" });
    expect(changeOrderInvoiceable({ status: "approved", amount: -2400 }, [])).toEqual({ ok: false, reason: "credit" });
    expect(changeOrderInvoiceable({ status: "approved", amount: 0 }, [])).toEqual({ ok: false, reason: "credit" });
    expect(changeOrderInvoiceable({ status: "sent", amount: 950 }, [])).toEqual({ ok: false, reason: "not_approved" });
  });
});

