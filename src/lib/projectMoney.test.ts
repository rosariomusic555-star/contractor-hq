import { describe, expect, it } from "vitest";
import {
  invoiceBalance,
  invoicePaymentState,
  openInvoices,
  paymentAppliedToLabel,
  paymentUnallocated,
  projectMoneySummary,
  suggestAllocations,
} from "./projectMoney";

const inv = (id: string, amount: number, status: "draft" | "sent" | "paid" | "overdue", amount_paid = 0, created_at = "2026-01-01") => ({
  id,
  amount,
  status,
  amount_paid,
  created_at,
});
const pay = (amount: number, allocs: [string, number][] = [], status: "active" | "void" = "active") => ({
  amount,
  status,
  payment_allocations: allocs.map(([invoice_id, a]) => ({ invoice_id, amount: a, invoice: { invoice_number: invoice_id.toUpperCase() } })),
});

describe("project money summary", () => {
  it("contract, invoiced, received (applied + credit), unpaid balance, remaining", () => {
    const invoices = [inv("a", 5_000, "paid", 5_000), inv("b", 10_000, "sent", 3_000), inv("c", 4_000, "draft")];
    const payments = [pay(5_000, [["a", 5_000]]), pay(4_000, [["b", 3_000]]), pay(2_500, [], "void")];
    const m = projectMoneySummary({ contractValue: 20_000, invoices, payments });
    expect(m.invoiced).toBe(15_000); // draft left out
    expect(m.received).toBe(9_000); // void left out
    expect(m.applied).toBe(8_000);
    expect(m.unallocatedCredit).toBe(1_000);
    expect(m.unpaidInvoiceBalance).toBe(7_000); // invoiced − applied
    expect(m.remaining).toBe(11_000); // contract − received
    expect(m.overpaid).toBe(0);
  });

  it("overpayment is a credit balance, not blocked", () => {
    const m = projectMoneySummary({ contractValue: 1_000, invoices: [], payments: [pay(1_500)] });
    expect(m.remaining).toBe(-500);
    expect(m.overpaid).toBe(500);
    expect(m.unallocatedCredit).toBe(1_500);
  });
});

describe("invoice payment state", () => {
  it("paid / partial / unpaid / draft and balance", () => {
    expect(invoicePaymentState(inv("a", 100, "paid", 100))).toBe("paid");
    expect(invoicePaymentState(inv("a", 100, "sent", 40))).toBe("partial");
    expect(invoicePaymentState(inv("a", 100, "overdue", 0))).toBe("unpaid");
    expect(invoicePaymentState(inv("a", 100, "draft"))).toBe("draft");
    expect(invoiceBalance(inv("a", 100, "sent", 40))).toBe(60);
    expect(openInvoices([inv("a", 100, "sent", 100), inv("b", 100, "sent", 10), inv("c", 100, "draft")]).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("allocations", () => {
  it("unallocated amount and the applied-to label", () => {
    expect(paymentUnallocated(pay(1_000, [["a", 600]]))).toBe(400);
    expect(paymentAppliedToLabel(pay(1_000))).toBe("Applied to project balance");
    expect(paymentAppliedToLabel(pay(1_000, [["a", 600]]))).toBe("A + credit");
    expect(paymentAppliedToLabel(pay(1_000, [["a", 600], ["b", 400]]))).toBe("A · B");
  });

  it("fills oldest open invoices first, partial on the last", () => {
    const invoices = [inv("new", 500, "sent", 0, "2026-03-01"), inv("old", 1_000, "overdue", 200, "2026-01-01")];
    expect(suggestAllocations(1_000, invoices)).toEqual([
      { invoice_id: "old", amount: 800 },
      { invoice_id: "new", amount: 200 },
    ]);
  });
});
