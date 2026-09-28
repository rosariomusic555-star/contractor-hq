import { describe, expect, it } from "vitest";
import {
  depositAmount,
  remainingToInvoice,
  restoreOverpays,
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

describe("contract breakdown", () => {
  it("original + approved COs (credits subtract) + approved add-ons = contract value; pending/declined never count", async () => {
    const { contractBreakdown } = await import("./projectMoney");
    const { projectContractValue } = await import("./api");
    const mkQuote = (id: string, kind: "original" | "addon", status: string, price: number, created_at: string) => ({
      id, kind, status, created_at, deposit_percentage: 0,
      quote_sections: [{ id: `${id}-s`, is_optional: false, quote_items: [{ id: `${id}-i`, price, quantity: 1, is_optional: false, client_selected: false }] }],
    });
    const quotes = [
      mkQuote("old", "original", "declined", 30_000, "2026-01-01"),
      mkQuote("orig", "original", "approved", 28_000, "2026-01-02"),
      mkQuote("add1", "addon", "approved", 2_000, "2026-02-01"),
      mkQuote("add2", "addon", "sent", 9_000, "2026-02-02"),
    ];
    const cos = [
      { id: "co1", status: "approved", amount: 3_500, number: 1, title: "paver upgrade", created_at: "2026-01-10" },
      { id: "co2", status: "approved", amount: -500, number: 2, title: "credit", created_at: "2026-01-11" },
      { id: "co3", status: "declined", amount: 7_000, number: 3, title: "no", created_at: "2026-01-12" },
      { id: "co4", status: "sent", amount: 1_000, number: 4, title: "pending", created_at: "2026-01-13" },
    ];
    const b = contractBreakdown(
      quotes.map((q) => ({ ...q, total: q.quote_sections[0].quote_items[0].price })),
      cos,
    );
    expect(b.lines.map((l) => [l.kind, l.amount])).toEqual([
      ["original", 28_000],
      ["change_order", 3_500],
      ["change_order", -500],
      ["addon", 2_000],
    ]);
    expect(b.lines[1].label).toBe("Approved change order #1 (paver upgrade)");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(b.total).toBe(projectContractValue(quotes as any, cos as any));
    expect(b.total).toBe(33_000);
  });
});

// Money bug (2026-09-28): the New invoice menu said "Remaining balance ·
// $10,000" while the invoice it created was $7,000 (a $3,000 draft deposit
// was subtracted by one and not the other). One helper now.
describe("remainingToInvoice", () => {
  it("subtracts every invoice, drafts included, never below 0", () => {
    expect(remainingToInvoice(10000, [{ amount: 3000 }])).toBe(7000);
    expect(remainingToInvoice(10000, [{ amount: 6000 }, { amount: 6000 }])).toBe(0);
    expect(remainingToInvoice(0.3, [{ amount: 0.1 }, { amount: 0.1 }])).toBe(0.1);
  });
});

// Money bug (2026-09-28): a $1,000 invoice paid by payment A (voided) and
// then payment B — restoring A made it $2,000 paid.
describe("restoreOverpays", () => {
  const inv = { id: "i1", amount: 1000, amount_paid: 1000, invoice_number: "INV-001" };
  it("flags an invoice the restore would push past its amount", () => {
    expect(restoreOverpays([{ invoice_id: "i1", amount: 1000 }], [inv])).toEqual([{ invoice_id: "i1", invoice_number: "INV-001", over: 1000 }]);
  });
  it("allows it when there's room (still unpaid, or partly paid)", () => {
    expect(restoreOverpays([{ invoice_id: "i1", amount: 1000 }], [{ ...inv, amount_paid: 0 }])).toEqual([]);
    expect(restoreOverpays([{ invoice_id: "i1", amount: 400 }], [{ ...inv, amount_paid: 600 }])).toEqual([]);
    expect(restoreOverpays([{ invoice_id: "i1", amount: 400.01 }], [{ ...inv, amount_paid: 600 }])).toEqual([{ invoice_id: "i1", invoice_number: "INV-001", over: 0.01 }]);
  });
});

// Money bug (2026-09-28): the quote builder rounded the deposit to whole
// dollars ($12,345 × 33% = $4,074) while the client page and the deposit
// invoice used $4,073.85; and 150% / negative deposits saved.
describe("depositAmount", () => {
  it("rounds to the cent, the same everywhere", () => {
    expect(depositAmount(12345, 33)).toBe(4073.85);
    expect(depositAmount(20000, "30")).toBe(6000);
  });
  it("the % is clamped to 0–100; blanks are 0", () => {
    expect(depositAmount(1000, 150)).toBe(1000);
    expect(depositAmount(1000, -10)).toBe(0);
    expect(depositAmount(1000, null)).toBe(0);
  });
});

