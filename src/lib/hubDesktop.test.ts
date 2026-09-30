import { describe, expect, it } from "vitest";
import { attentionItems, coverPhotoPath, quoteBreakdown, whatsNext } from "./hubDesktop";
import { clientQuoteTotal } from "./selections";
import type { PortalProjectDetail, PortalQuoteSection } from "./portalApi";

const NOW = new Date("2026-09-29T12:00:00");

const item = (id: string, price: number, over: Record<string, unknown> = {}) => ({
  id, name: id, description: null, price, quantity: 1, unit: null, is_optional: false, client_selected: false, ...over,
});
const group = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, help_text: null, required: true, multi: false, approved_at: null, picked: [], history: [],
  options: [
    { id: `${id}-a`, name: "A", description: null, image_path: null, price_delta: 0, is_default: false },
    { id: `${id}-b`, name: "B", description: null, image_path: null, price_delta: 500, is_default: false },
  ],
  ...over,
});
const section = (id: string, items: unknown[], over: Record<string, unknown> = {}) =>
  ({ id, name: id, is_optional: false, sort_order: 0, items, selections: [], ...over }) as unknown as PortalQuoteSection;

const quote = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: "original", status: "approved", deposit_percentage: 30, signed_at: null, signed_by: null,
  declined_at: null, decline_comment: null, created_at: "2026-09-01", sections: [section("s", [item("i", 10_000)])], ...over,
});

const base = (over: Partial<Record<keyof PortalProjectDetail, unknown>> = {}, project: Record<string, unknown> = {}) =>
  ({
    project: { id: "p", name: "Patio", status: "in_progress", scheduled_start_date: "2026-09-21", scheduled_end_date: "2026-10-09", actual_start_date: "2026-09-21", actual_end_date: null, ...project },
    business: { company_name: "Co", phone: null, email: null, logo_url: null },
    quotes: [quote("q")],
    change_orders: [],
    invoices: [],
    payments: [],
    photos: [],
    deliveries: [],
    events: [],
    schedule_updates: [],
    progress: null,
    ...over,
  }) as unknown as PortalProjectDetail;

describe("attentionItems", () => {
  it("orders quotes, change orders, then invoices (overdue first)", () => {
    const d = base({
      quotes: [quote("q"), quote("a1", { kind: "addon", addon_number: 1, status: "sent" })],
      change_orders: [{ id: "c1", number: 1, title: "Wider steps", amount: 1_200, status: "sent", created_at: "2026-09-20", sections: [] }],
      invoices: [
        { id: "i-due", invoice_number: "INV-2", amount: 1_000, amount_paid: 0, status: "sent", due_date: "2026-10-10", paid_at: null, created_at: "x" },
        { id: "i-late", invoice_number: "INV-1", amount: 2_000, amount_paid: 500, status: "sent", due_date: "2026-09-01", paid_at: null, created_at: "x" },
        { id: "i-paid", invoice_number: "INV-0", amount: 900, amount_paid: 900, status: "paid", due_date: "2026-08-01", paid_at: "x", created_at: "x" },
      ],
    });
    const items = attentionItems(d, NOW);
    expect(items.map((i) => i.key)).toEqual(["q-a1", "co-c1", "inv-i-late", "inv-i-due"]);
    expect(items[0].cta).toBe("Review & sign");
    expect(items[1].detail).toBe("+$1,200.00 to your contract");
    expect(items[2]).toMatchObject({ tone: "red", eyebrow: "Invoice past due" });
    expect(items[2].detail).toMatch(/^\$1,500\.00 overdue/);
    expect(items[3].path).toBe("invoice/i-due");
  });

  it("asks for selections first when a required choice is open", () => {
    const d = base({ quotes: [quote("q", { status: "sent", sections: [section("s", [item("i", 100)], { selections: [group("g")] })] })] });
    expect(attentionItems(d, NOW)[0]).toMatchObject({ eyebrow: "Selections to make", cta: "Make selections" });
  });

  it("is empty when nothing is waiting", () => {
    expect(attentionItems(base(), NOW)).toEqual([]);
  });
});

describe("whatsNext", () => {
  it("approval beats everything", () => {
    const d = base({ quotes: [quote("q", { status: "sent" })] }, { status: "estimating", actual_start_date: null });
    expect(whatsNext(d, NOW)).toEqual({ text: "Waiting on your approval: Your quote", tone: "amber" });
  });

  it("complete", () => {
    expect(whatsNext(base({}, { status: "complete", actual_end_date: "2026-09-25" }), NOW).text).toMatch(/^Project complete · finished/);
  });

  it("a recent rain delay, then the next milestone", () => {
    const rain = { id: "s", posted_at: "2026-09-27T10:00:00Z", reason: "rain", from_start: "2026-09-29", from_end: "2026-10-09", to_start: "2026-10-02", to_end: "2026-10-12" };
    expect(whatsNext(base({ schedule_updates: [rain] }), NOW)).toEqual({ text: "Moved to Fri Oct 2 due to rain", tone: "blue" });

    const progress = {
      updates: [{ id: "u", date: "2026-09-26", text: null, milestone: "Excavation", feature: "f", photos: [], liked: false, comments: [] }],
      features: [{ id: "f", label: "Patio", category: null, milestones: ["Excavation", "Base", "Pavers"] }],
      milestone_presets: {},
      before_after: [],
      marketing_ok: null,
    };
    expect(whatsNext(base({ progress }), NOW).text).toMatch(/^Up next on Patio: Base · Day \d+ — work is underway$/);
  });

  it("scheduled and estimating", () => {
    expect(whatsNext(base({}, { status: "scheduled", scheduled_start_date: "2026-10-05", actual_start_date: null }), NOW).text).toBe("Work starts Mon, Oct 5");
    expect(whatsNext(base({ quotes: [] }, { status: "estimating", actual_start_date: null }), NOW).text).toBe("Reviewing your quote");
  });
});

describe("quoteBreakdown", () => {
  it("splits base / optional / selections and matches clientQuoteTotal", () => {
    const sections = [
      section("req", [item("a", 10_000), item("opt-in", 800, { is_optional: true, client_selected: true }), item("opt-out", 300, { is_optional: true })], {
        selections: [group("g", { picked: ["g-b"] })],
      }),
      section("fire", [item("pit", 2_000, { client_selected: true })], { is_optional: true, selections: [group("h", { picked: ["h-b"] })] }),
      section("lights", [item("led", 1_500)], { is_optional: true, selections: [group("k", { picked: ["k-b"] })] }),
    ];
    const b = quoteBreakdown(sections, { "g": ["g-a"] });
    // g overridden to the $0 option; h counts (section added); k doesn't (section not added).
    expect(b).toEqual({ base: 10_000, optional: 2_800, selections: 500, total: 13_300 });
    expect(b.total).toBe(clientQuoteTotal(sections, { g: ["g-a"] }));
  });
});

describe("coverPhotoPath", () => {
  it("prefers the after photo when complete, then the newest progress photo, then the first project photo", () => {
    const progress = {
      updates: [
        { id: "1", date: "2026-09-22", photos: ["old.jpg"], milestone: null, feature: null, text: null, liked: false, comments: [] },
        { id: "2", date: "2026-09-26", photos: ["new.jpg"], milestone: null, feature: null, text: null, liked: false, comments: [] },
      ],
      features: [], milestone_presets: {}, marketing_ok: null,
      before_after: [{ feature: null, before: "b.jpg", after: "a.jpg" }],
    };
    expect(coverPhotoPath(base({ progress }, { status: "complete" }))).toBe("a.jpg");
    expect(coverPhotoPath(base({ progress }))).toBe("new.jpg");
    expect(coverPhotoPath(base({ photos: [{ id: "x", storage_path: "p.jpg", caption: null }] }))).toBe("p.jpg");
    expect(coverPhotoPath(base())).toBeNull();
  });
});
