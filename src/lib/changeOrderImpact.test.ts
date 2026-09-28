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
