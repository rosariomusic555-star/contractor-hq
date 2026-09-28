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
