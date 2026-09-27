import { describe, expect, it } from "vitest";
import { buildProjectSummaryPdf } from "./projectSummaryPdf";
import type { PortalProjectDetail } from "./portalApi";

// An internal value planted on every object must never reach the PDF.
const SECRET = "INTERNAL-SECRET-4242";
const leak = { overhead_rate: SECRET, margin: SECRET, cost: SECRET, internal_notes: SECRET, note: SECRET, site_conditions: SECRET };

const detail = {
  ...leak,
  project: { ...leak, id: "p", name: "Backyard Patio", status: "in_progress", address: "14 Oak St" },
  business: { ...leak, company_name: "Sample Hardscapes", phone: "555-0100", email: null, logo_url: null },
  client: { ...leak, name: "Jordan Sample" },
  quotes: [{ ...leak, id: "q", kind: "original", status: "approved", deposit_percentage: 30, signed_at: null, signed_by: null, declined_at: null, decline_comment: null, created_at: "2026-03-01", total: 28000, sections: [] }],
  change_orders: [{ ...leak, id: "c", number: 1, title: "Paver upgrade", description: null, reason: null, amount: 3500, total: 3500, status: "approved", schedule_impact_days: 0, approved_at: null, approved_by: null, declined_at: null, decline_comment: null, created_at: "2026-04-01", sections: [] }],
  invoices: [{ ...leak, id: "i", invoice_number: "INV-001", amount: 10000, amount_paid: 4000, status: "sent", due_date: null, paid_at: null, created_at: "2026-03-05" }],
  payments: [{ ...leak, token: "t", receipt_number: "R-0001", amount: 4000, paid_on: "2026-03-06", method: "check", reference: "1042", status: "active", voided_at: null, created_at: "x", applied_to: [{ invoice_id: "i", invoice_number: "INV-001", amount: 4000 }] }],
  versions: [],
  photos: [], deliveries: [], events: [],
} as unknown as PortalProjectDetail;

describe("project summary PDF", () => {
  it("contains the contract math, documents, payments — and nothing internal", () => {
    const pdf = buildProjectSummaryPdf(detail, { now: new Date("2026-09-27T12:00:00") }).output();
    for (const s of ["Backyard Patio", "Jordan Sample", "Current contract value", "Approved change order #1", "Paver upgrade", "INV-001", "R-0001", "1042", "As of September 27, 2026"])
      expect(pdf, s).toContain(s);
    expect(pdf).not.toContain(SECRET);
  });
});
