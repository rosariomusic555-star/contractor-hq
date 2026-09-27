import { describe, expect, it } from "vitest";
import type { ChangeOrder, Client, Invoice, MaterialsSection, Payment, MaterialsSheet, Project, Quote, QuoteItem, QuoteSection } from "./api";
import { projectContractValue } from "./api";
import {
  ALL_TIME_RANGE,
  avgMargin,
  buildProjectFinancials,
  closedJobRows,
  collectedByCategory,
  collectedByClient,
  collectedTotal,
  invoicedTotal,
  isExcludedFromFinancials,
  isProjectClosed,
  marginRowsInRange,
  outstandingTotal,
  projectBillingBadge,
  resolveCost,
} from "./financials";

// ---------------------------------------------------------------------------
// Fixture factories — every required field gets a sane default so each test
// only spells out what it actually cares about.
// ---------------------------------------------------------------------------

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function makeQuoteItem(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: nextId("item"),
    section_id: "section-1",
    name: "Line item",
    description: null,
    price: 1000,
    quantity: 1,
    unit: null,
    is_optional: false,
    client_selected: true,
    sort_order: 0,
    category_id: null,
    quote_item_images: [],
    ...overrides,
  };
}

function makeQuoteSection(overrides: Partial<QuoteSection> = {}): QuoteSection {
  return {
    id: nextId("section"),
    quote_id: "quote-1",
    name: "Section",
    is_optional: false,
    sort_order: 0,
    quote_items: [],
    ...overrides,
  };
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: nextId("quote"),
    project_id: "project-1",
    client_id: null,
    user_id: "user-1",
    status: "approved",
    deposit_percentage: 30,
    notes: null,
    terms: null,
    share_token: null,
    signed_at: null,
    signed_by: null,
    signed_ip: null,
    declined_at: null,
    decline_comment: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    material_sheet_id: null,
    quote_sections: [],
    ...overrides,
  };
}

function makeChangeOrder(overrides: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: nextId("co"),
    project_id: "project-1",
    user_id: "user-1",
    title: "Change order",
    description: null,
    reason: null,
    amount: 0,
    status: "approved",
    schedule_impact_days: null,
    approved_at: null,
    approved_by: null,
    approved_ip: null,
    declined_at: null,
    decline_comment: null,
    share_token: null,
    signed_at: null,
    signed_by: null,
    material_sheet_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: nextId("invoice"),
    project_id: "project-1",
    quote_id: null,
    change_order_id: null,
    user_id: "user-1",
    amount: 0,
    status: "sent",
    due_date: null,
    notes: null,
    share_token: null,
    paid_at: null,
    invoice_number: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: nextId("payment"),
    user_id: "user-1",
    project_id: "project-1",
    amount: 0,
    paid_on: "2026-02-01",
    method: "check",
    reference: null,
    note: null,
    status: "active",
    voided_at: null,
    voided_by: null,
    void_reason: null,
    receipt_number: null,
    share_token: nextId("token"),
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    payment_allocations: [],
    ...overrides,
  };
}

const allocate = (invoiceId: string, amount: number) => ({
  id: nextId("alloc"),
  payment_id: "",
  invoice_id: invoiceId,
  amount,
  created_at: "2026-02-01T00:00:00Z",
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    user_id: "user-1",
    client_id: "client-1",
    name: "Test project",
    address: null,
    status: "scheduled",
    target_install_month: null,
    scheduled_start_date: null,
    scheduled_end_date: null,
    estimated_duration_days: null,
    actual_start_date: null,
    actual_end_date: null,
    size_sqft: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    user_id: "user-1",
    name: "Test client",
    email: null,
    phone: null,
    address: null,
    created_at: "2026-01-01T00:00:00Z",
    status: "lead",
    lead_source: null,
    preferred_contact_method: null,
    tags: [],
    internal_notes: null,
    custom_fields: {},
    portal_invited_at: null,
    portal_last_sign_in_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Invariant 1: Invoiced − Collected = Outstanding, all-time.
// ---------------------------------------------------------------------------

describe("Invoiced − Collected = Outstanding", () => {
  it("holds for a mix of draft, sent, paid, and overdue invoices", () => {
    const invoices: Invoice[] = [
      makeInvoice({ status: "draft", amount: 5_000 }), // never sent — must not count toward invoiced
      makeInvoice({ status: "sent", amount: 3_000 }),
      makeInvoice({ status: "overdue", amount: 1_500 }),
      makeInvoice({ id: "inv-paid", status: "paid", amount: 7_000, amount_paid: 7_000, paid_at: "2026-02-01T00:00:00Z" }),
    ];
    const payments = [
      makePayment({ amount: 7_000, payment_allocations: [allocate("inv-paid", 7_000)] }),
      makePayment({ amount: 900, status: "void", payment_allocations: [] }), // voided — counts nowhere
    ];

    const invoiced = invoicedTotal(invoices, ALL_TIME_RANGE);
    const collected = collectedTotal(payments, ALL_TIME_RANGE);
    const outstanding = outstandingTotal(invoices);

    expect(invoiced).toBe(11_500); // sent + overdue + paid, draft excluded
    expect(collected).toBe(7_000);
    expect(outstanding).toBe(4_500); // sent + overdue only
    expect(invoiced - collected).toBe(outstanding);
  });

  it("partial payments leave only the balance outstanding", () => {
    const invoices: Invoice[] = [makeInvoice({ status: "sent", amount: 10_000, amount_paid: 4_000 })];
    expect(outstandingTotal(invoices)).toBe(6_000);
  });

  it("draft invoices never move any of the three figures", () => {
    const invoices: Invoice[] = [makeInvoice({ status: "draft", amount: 99_000 })];
    expect(invoicedTotal(invoices, ALL_TIME_RANGE)).toBe(0);
    expect(collectedTotal([], ALL_TIME_RANGE)).toBe(0);
    expect(outstandingTotal(invoices)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: sum of collected by client = sum of collected by category =
// total collected, same range and basis.
// ---------------------------------------------------------------------------

describe("Collected by client / by category reconcile with the total", () => {
  it("sums to the same total across both breakdowns", () => {
    const categoryA = "cat-a";
    const categoryB = "cat-b";
    const categories = [
      { id: categoryA, name: "Patios", user_id: "user-1", sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
      { id: categoryB, name: "Walls", user_id: "user-1", sort_order: 1, created_at: "2026-01-01T00:00:00Z" },
    ];

    const quote = makeQuote({
      id: "quote-shared",
      project_id: "project-1",
      quote_sections: [
        makeQuoteSection({
          quote_items: [
            makeQuoteItem({ price: 7_000, category_id: categoryA }),
            makeQuoteItem({ price: 3_000, category_id: categoryB }),
          ],
        }),
      ],
    });

    const client = makeClient({ id: "client-1" });
    const project = makeProject({ id: "project-1", client_id: "client-1" });

    const invoices: Invoice[] = [
      makeInvoice({ id: "inv-10k", project_id: "project-1", quote_id: "quote-shared", status: "paid", amount: 10_000, amount_paid: 10_000, paid_at: "2026-02-01T00:00:00Z" }),
      makeInvoice({ project_id: "project-1", quote_id: "quote-shared", status: "sent", amount: 5_000 }), // unpaid — excluded from both breakdowns
    ];
    const payments: Payment[] = [
      makePayment({ amount: 10_000, payment_allocations: [allocate("inv-10k", 10_000)] }),
      // Unallocated project credit — split by the project's contract mix.
      makePayment({ amount: 2_000 }),
    ];

    const projectFinancials = buildProjectFinancials(
      [project],
      new Map([["project-1", [quote]]]),
      new Map(),
      new Map([["project-1", payments]]),
      [],
      [],
      new Map(),
      categories,
    );

    const byCategory = collectedByCategory(payments, invoices, [quote], categories, projectFinancials, ALL_TIME_RANGE);
    const byClient = collectedByClient(payments, invoices, [project], [client], ALL_TIME_RANGE);
    const totalCollected = collectedTotal(payments, ALL_TIME_RANGE);

    const categorySum = byCategory.reduce((s, r) => s + r.revenue, 0);
    const clientSum = byClient.reduce((s, r) => s + r.revenue, 0);

    expect(totalCollected).toBe(12_000);
    expect(clientSum).toBe(12_000);
    expect(categorySum).toBeCloseTo(12_000, 6);
    // 70/30 split of the $10k applied payment (its invoice's quote mix) and
    // of the $2k credit (the project's contract mix) — never the unpaid $5k.
    expect(byCategory.find((r) => r.id === categoryA)?.revenue).toBeCloseTo(8_400, 6);
    expect(byCategory.find((r) => r.id === categoryB)?.revenue).toBeCloseTo(3_600, 6);
    expect(byClient[0].outstanding).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: contract value = approved quote total (required + selected
// optionals) + approved change orders — identical everywhere it's derived.
// ---------------------------------------------------------------------------

describe("Contract value", () => {
  it("excludes unselected optional items and non-approved change orders", () => {
    const quote = makeQuote({
      quote_sections: [
        makeQuoteSection({
          quote_items: [
            makeQuoteItem({ price: 10_000, is_optional: false }), // required
            makeQuoteItem({ price: 4_000, is_optional: true, client_selected: true }), // selected add-on
            makeQuoteItem({ price: 2_500, is_optional: true, client_selected: false }), // never picked
          ],
        }),
      ],
    });

    const changeOrders: ChangeOrder[] = [
      makeChangeOrder({ status: "approved", amount: 1_000 }),
      makeChangeOrder({ status: "sent", amount: 5_000 }), // pending — not counted yet
      makeChangeOrder({ status: "declined", amount: 9_000 }), // never counted
    ];

    const value = projectContractValue([quote], changeOrders);

    // 10,000 (required) + 4,000 (selected optional) + 1,000 (approved CO)
    // = 15,000 — the $2,500 unselected optional and the $5,000 pending /
    // $9,000 declined change orders never appear.
    expect(value).toBe(15_000);
  });

  it("a quote no one has approved/sent yet still contributes its committed total", () => {
    const quote = makeQuote({
      status: "draft",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 8_000 })] })],
    });
    expect(projectContractValue([quote], [])).toBe(8_000);
  });

  it("a project with no quote at all has zero contract value", () => {
    expect(projectContractValue([], [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Invariant 4: draft, declined, and pending documents never count toward
// any total.
// ---------------------------------------------------------------------------

describe("Draft / declined / pending documents never count", () => {
  it("a draft invoice is invisible to invoiced, collected, and outstanding", () => {
    const invoices = [makeInvoice({ status: "draft", amount: 50_000 })];
    expect(invoicedTotal(invoices, ALL_TIME_RANGE)).toBe(0);
    expect(outstandingTotal(invoices)).toBe(0);
  });

  it("declined and pending change orders never move contract value", () => {
    const quote = makeQuote({ quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 20_000 })] })] });
    const declined = makeChangeOrder({ status: "declined", amount: 6_000 });
    const pending = makeChangeOrder({ status: "sent", amount: 4_000 });
    expect(projectContractValue([quote], [declined, pending])).toBe(20_000);
  });
});

// ---------------------------------------------------------------------------
// Invariant 5: est. cost / profit / margin only average over jobs with a
// known cost; unknown-cost jobs are excluded, not treated as zero.
// ---------------------------------------------------------------------------

describe("Cost / profit / margin", () => {
  it("resolveCost prefers actual expenses, falls back to predicted, else unknown", () => {
    expect(resolveCost(4_000, 6_000)).toBe(4_000); // actual wins
    expect(resolveCost(null, 6_000)).toBe(6_000); // predicted fallback
    expect(resolveCost(null, null)).toBeNull(); // unknown, not zero
  });

  it("avgMargin excludes unknown-cost jobs instead of counting them as 0%", () => {
    const priced = makeProject({ id: "priced", client_id: "client-1" });
    const unknown = makeProject({ id: "unknown", client_id: "client-1" });

    const pricedQuote = makeQuote({
      project_id: "priced",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 10_000 })] })],
    });
    const unknownQuote = makeQuote({
      project_id: "unknown",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 10_000 })] })],
    });

    const materialsSheet: MaterialsSheet = {
      id: "sheet-1",
      project_id: "priced",
      name: "Sheet",
      sort_order: 0,
      created_at: "2026-01-01T00:00:00Z",
    };
    const materialsSection: MaterialsSection = {
      id: "ms-1",
      project_id: "priced",
      sheet_id: "sheet-1",
      name: "Materials",
      sort_order: 0,
      smart_section_build_type: null,
      materials_items: [
        { id: "mi-1", section_id: "ms-1", name: "Pavers", quantity: 100, unit_cost: 60, sort_order: 0, expense_category_id: null, category: null, unit: null, price_book_item_id: null, catalog_product_id: null, waste_percent: 0, conversion_unit: null, conversion_factor: null, reconciled_at: null, disposition: null, return_credit: null, tracked: true },
      ],
    };

    const rows = buildProjectFinancials(
      [priced, unknown],
      new Map([
        ["priced", [pricedQuote]],
        ["unknown", [unknownQuote]],
      ]),
      new Map(),
      new Map(),
      [materialsSheet],
      [materialsSection],
      new Map(),
      [],
    );

    const result = avgMargin(rows);
    // "priced" has a $10,000 contract and $6,000 predicted cost (100 × $60)
    // = 40% margin. "unknown" has no materials sheet and no expenses at
    // all, so its cost — and margin — is null, not 0%.
    expect(result.includedCount).toBe(1);
    expect(result.excludedCount).toBe(1);
    expect(result.avgPct).toBe(40);
  });

  it("prefers actual logged expenses over the materials-sheet prediction when both exist", () => {
    const project = makeProject({ id: "priced", client_id: "client-1" });
    const quote = makeQuote({
      project_id: "priced",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 10_000 })] })],
    });
    const materialsSheet: MaterialsSheet = { id: "sheet-1", project_id: "priced", name: "Sheet", sort_order: 0, created_at: "2026-01-01T00:00:00Z" };
    const materialsSection: MaterialsSection = {
      id: "ms-1",
      project_id: "priced",
      sheet_id: "sheet-1",
      name: "Materials",
      sort_order: 0,
      smart_section_build_type: null,
      materials_items: [
        { id: "mi-1", section_id: "ms-1", name: "Pavers", quantity: 100, unit_cost: 60, sort_order: 0, expense_category_id: null, category: null, unit: null, price_book_item_id: null, catalog_product_id: null, waste_percent: 0, conversion_unit: null, conversion_factor: null, reconciled_at: null, disposition: null, return_credit: null, tracked: true },
      ],
    };
    // Actual expenses ($8,000) logged, different from the $6,000 predicted.
    const expenses = [{ amount: 8_000 }];

    const rows = buildProjectFinancials(
      [project],
      new Map([["priced", [quote]]]),
      new Map(),
      new Map(),
      [materialsSheet],
      [materialsSection],
      new Map([["priced", expenses]]),
      [],
    );

    expect(rows[0].cost).toBe(8_000);
    expect(rows[0].marginPct).toBe(20); // (10,000 - 8,000) / 10,000
  });
});

// ---------------------------------------------------------------------------
// Invariant 6: a job is "closed" once fully collected, derived — never a
// manual status field.
// ---------------------------------------------------------------------------

describe("Closed jobs are derived from collected vs. contract value", () => {
  it("isProjectClosed is true only once collected reaches contract value", () => {
    expect(isProjectClosed(10_000, 9_999)).toBe(false);
    expect(isProjectClosed(10_000, 10_000)).toBe(true);
    expect(isProjectClosed(10_000, 12_000)).toBe(true); // overpaid still counts as closed
    expect(isProjectClosed(0, 0)).toBe(false); // no contract at all is never "closed"
  });

  it("closedJobRows ignores the project.status lifecycle field entirely", () => {
    // Job-lifecycle status still says "scheduled" (nobody's marked the
    // physical work complete) — but it's been fully paid, so it must
    // still show up as closed. Closed is a billing concept, derived from
    // money, independent of where the job physically is.
    const project = makeProject({ id: "priced", client_id: "client-1", status: "scheduled" });
    const quote = makeQuote({
      project_id: "priced",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 5_000 })] })],
    });
    const payments = [makePayment({ project_id: "priced", amount: 5_000, paid_on: "2026-03-02" })];

    const rows = buildProjectFinancials(
      [project],
      new Map([["priced", [quote]]]),
      new Map(),
      new Map([["priced", payments]]),
      [],
      [],
      new Map(),
      [],
    );

    expect(rows[0].closed).toBe(true);
    const closed = closedJobRows(rows, ALL_TIME_RANGE);
    expect(closed).toHaveLength(1);
  });

  it("a project billed but not yet fully paid is not closed", () => {
    const project = makeProject({ id: "priced", client_id: "client-1" });
    const quote = makeQuote({
      project_id: "priced",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 5_000 })] })],
    });
    // Billed, $4,999 received — one voided $1 payment doesn't close it.
    const payments = [
      makePayment({ project_id: "priced", amount: 4_999 }),
      makePayment({ project_id: "priced", amount: 1, status: "void" }),
    ];

    const rows = buildProjectFinancials(
      [project],
      new Map([["priced", [quote]]]),
      new Map(),
      new Map([["priced", payments]]),
      [],
      [],
      new Map(),
      [],
    );

    expect(rows[0].closed).toBe(false);
    expect(closedJobRows(rows, ALL_TIME_RANGE)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// marginRowsInRange still includes priced-but-not-yet-closed jobs — margin
// doesn't require the job to be paid off, unlike "closed".
// ---------------------------------------------------------------------------

describe("marginRowsInRange", () => {
  it("includes any priced job regardless of collection status", () => {
    const project = makeProject({ id: "priced", client_id: "client-1" });
    const quote = makeQuote({
      project_id: "priced",
      quote_sections: [makeQuoteSection({ quote_items: [makeQuoteItem({ price: 5_000 })] })],
    });
    const rows = buildProjectFinancials(
      [project],
      new Map([["priced", [quote]]]),
      new Map(),
      new Map(),
      [],
      [],
      new Map(),
      [],
    );
    expect(marginRowsInRange(rows, ALL_TIME_RANGE)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Opportunity/Project restructure (migrations 0073-0078) — the pure,
// client-side pieces of the new model. Lazy project creation's race-safety
// (the DB row lock in get_or_create_opportunity_project), the Won
// transaction's atomicity, and Lost/un-Lost's project sync are all
// enforced by triggers/functions in Postgres, not application code — this
// repo has no SQL test harness (migrations are applied by hand, per
// CLAUDE.md), so those are verified live against the real database instead
// of here. What IS pure TS and testable: which statuses a project's
// billing badge and financial-total exclusion resolve to.
// ---------------------------------------------------------------------------

describe("isExcludedFromFinancials", () => {
  it("excludes estimating and lost, nothing else", () => {
    expect(isExcludedFromFinancials("estimating")).toBe(true);
    expect(isExcludedFromFinancials("lost")).toBe(true);
    expect(isExcludedFromFinancials("scheduled")).toBe(false);
    expect(isExcludedFromFinancials("in_progress")).toBe(false);
    expect(isExcludedFromFinancials("complete")).toBe(false);
  });
});

describe("projectBillingBadge", () => {
  it("shows nothing when there's no contract value yet", () => {
    expect(projectBillingBadge(0, 0, 0, 0)).toBeNull();
  });

  it("shows paid once collected reaches the contract value", () => {
    expect(projectBillingBadge(10_000, 10_000, 10_000, 3_000)).toBe("paid");
    expect(projectBillingBadge(10_000, 10_000, 12_000, 3_000)).toBe("paid"); // overpaid
  });

  it("shows partially paid once something's collected but not everything", () => {
    expect(projectBillingBadge(10_000, 10_000, 4_000, 3_000)).toBe("partially_paid");
  });

  it("shows deposit due before the deposit itself is covered", () => {
    expect(projectBillingBadge(10_000, 3_000, 0, 3_000)).toBe("deposit_due");
  });

  it("shows invoiced when something's billed but there's no deposit to speak of", () => {
    expect(projectBillingBadge(10_000, 5_000, 0, 0)).toBe("invoiced");
  });

  it("shows nothing when nothing's been invoiced and there's no deposit set", () => {
    expect(projectBillingBadge(10_000, 0, 0, 0)).toBeNull();
  });
});
