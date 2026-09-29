import { describe, it, expect } from "vitest";
import type { ChangeOrder, Invoice, Project } from "./api";
import { computeProjectImpact } from "./changeOrderImpact";

const inv = (amount: number, status: Invoice["status"]) =>
  ({ id: `${amount}-${status}`, amount, status, amount_paid: 0, issue_date: "2026-09-01", created_at: "2026-09-01T12:00:00Z" }) as unknown as Invoice;
const co = (amount: number) => ({ id: `co-${amount}`, amount, status: "approved", schedule_impact_days: 0 }) as unknown as ChangeOrder;

const impact = (invoices: Invoice[], thisTotal: number) =>
  computeProjectImpact({
    project: { estimated_duration_days: null } as unknown as Project,
    quotes: [],
    otherChangeOrders: [co(22789), co(513)],
    invoices,
    payments: [],
    materialsSections: [],
    thisChangeOrderTotal: thisTotal,
    thisChangeOrderItemCount: 1,
    draftScheduleImpactDays: null,
  });

describe("computeProjectImpact — remaining to bill", () => {
  it("counts a drafted invoice as already billed (no second bill for an invoiced change order)", () => {
    // $23,302 contract; $22,789 sent + a $513 change-order invoice still in draft.
    const r = impact([inv(7520.37, "paid"), inv(15268.63, "sent"), inv(513, "draft")], -250);
    expect(r.invoicedToDate).toBeCloseTo(22789, 2); // drafts aren't "invoiced to date"
    expect(r.remainingToBillBefore).toBe(0);
    expect(r.remainingToBill).toBe(0); // a credit never goes negative
  });

  it("an added change order is what's left to bill", () => {
    const r = impact([inv(7520.37, "paid"), inv(15268.63, "sent"), inv(513, "draft")], 400.1);
    expect(r.remainingToBill).toBe(400.1);
  });
});

describe("computeProjectImpact — estimated duration", () => {
  const withDuration = (days: number, others: ChangeOrder[], draft: number | null, applied = false) =>
    computeProjectImpact({
      project: { estimated_duration_days: days } as unknown as Project,
      quotes: [],
      otherChangeOrders: others,
      invoices: [],
      payments: [],
      materialsSections: [],
      thisChangeOrderTotal: 0,
      thisChangeOrderItemCount: 0,
      draftScheduleImpactDays: draft,
      scheduleAlreadyApplied: applied,
    });
  const approvedWithDays = (d: number) => ({ id: `co-d${d}`, amount: 0, status: "approved", schedule_impact_days: d }) as unknown as ChangeOrder;

  it("never re-adds other approved change orders' days — the project's estimate already has them", () => {
    // 10-day job + an approved +1 (the trigger made it 11); a new draft adds 2.
    const r = withDuration(11, [approvedWithDays(1)], 2);
    expect(r.estimatedDurationBefore).toBe(11);
    expect(r.estimatedDurationAfter).toBe(13);
  });

  it("an approved change order backs its own days out of before", () => {
    const r = withDuration(11, [], 1, true);
    expect(r.estimatedDurationBefore).toBe(10);
    expect(r.estimatedDurationAfter).toBe(11);
  });
});
