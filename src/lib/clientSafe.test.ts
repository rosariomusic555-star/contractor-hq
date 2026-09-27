import { describe, expect, it } from "vitest";
import { CLIENT_FIELDS, INTERNAL_FIELDS, allKeys, clientSafeProjectDetail } from "./clientSafe";
import type { PortalProjectDetail } from "./portalApi";

// Every internal field, sprinkled on every object — the serializer must
// drop them all, however they got there.
const leak = Object.fromEntries(INTERNAL_FIELDS.map((f) => [f, 123]));
const withLeaks = <T extends object>(o: T) => ({ ...leak, ...o });

const item = withLeaks({ id: "i1", name: "Pavers", description: null, price: 10, quantity: 2, unit: "sf", is_optional: false, client_selected: false, images: [withLeaks({ id: "img", storage_path: "p" })] });
const quote = withLeaks({
  id: "q1", kind: "original", status: "approved", deposit_percentage: 30, notes: "n", terms: "t", signed_at: null, signed_by: "Pat",
  declined_at: null, decline_comment: null, total: 20, approval: withLeaks({ name: "Pat", at: "2026-09-01" }),
  sections: [
    withLeaks({
      id: "s1", name: "Patio", is_optional: false, sort_order: 0, items: [item],
      selections: [
        withLeaks({
          id: "g1", name: "Paver color", help_text: null, required: true, multi: false, approved_at: null, picked: ["o1"], approved_price: 0,
          options: [withLeaks({ id: "o1", name: "Shale Grey", description: null, image_path: "p", price_delta: 0, is_default: true, cost_delta: 99, link_item_id: "x", link_set: { unit_cost: 5 }, catalog_product_id: "c", vendor: "Stone Co" })],
          history: [withLeaks({ source: "original", option_names: ["Shale Grey"], created_at: "x", change_order_number: null })],
        }),
      ],
    }),
  ],
});
const changeOrder = withLeaks({
  id: "c1", number: 1, title: "Upgrade", description: null, reason: null, amount: 500, status: "approved", schedule_impact_days: 0,
  approved_at: null, approved_by: null, declined_at: null, decline_comment: null, created_at: "2026-09-02", total: 500,
  sections: [withLeaks({ id: "cs", name: "Patio", sort_order: 0, scope_note: "+50 sf", items: [item] })],
});
const invoice = withLeaks({ id: "inv", invoice_number: "INV-001", amount: 100, amount_paid: 0, status: "sent", due_date: null, notes: null, paid_at: null, created_at: "2026-09-03", items: [withLeaks({ description: "Deposit", quantity: 1, unit_price: 100 })] });
const payment = withLeaks({ token: "tok", receipt_number: "R-0001", amount: 50, paid_on: "2026-09-04", method: "check", reference: "1", status: "active", voided_at: null, created_at: "x", applied_to: [withLeaks({ invoice_id: "inv", invoice_number: "INV-001", amount: 50 })] });

const raw = withLeaks({
  project: withLeaks({ id: "p", name: "Patio", status: "in_progress", address: "1 Main" }),
  business: withLeaks({ company_name: "Co", phone: null, email: null, logo_url: null }),
  client: withLeaks({ name: "Pat" }),
  quotes: [quote],
  change_orders: [changeOrder],
  invoices: [invoice],
  payments: [payment],
  versions: [
    withLeaks({ doc_type: "quote", doc_id: "q1", version: 1, state: "approved", event: "baseline", total: 20, approval: null, created_at: "x", decided_at: null, content: quote }),
    withLeaks({ doc_type: "change_order", doc_id: "c1", version: 1, state: "approved", event: "sent", total: 500, approval: null, created_at: "x", decided_at: null, content: changeOrder }),
    withLeaks({ doc_type: "invoice", doc_id: "inv", version: 1, state: "issued", event: "sent", total: 100, approval: null, created_at: "x", decided_at: null, content: invoice }),
  ],
  money: withLeaks({ contract_value: 520, received: 50, receipts: [withLeaks({ number: "R-0001", amount: 50, paid_on: "x", token: "tok" })] }),
  photos: [withLeaks({ id: "ph", storage_path: "p", caption: null })],
  deliveries: [withLeaks({ id: "d", supplier: "Stone Co", expected_delivery_date: null, status: "ordered", photos: [] })],
  events: [withLeaks({ id: "e", kind: "quote_sent", summary: "Quote sent", created_at: "x" })],
  review: withLeaks({ link_path: "/r/tok" }),
  schedule_updates: [withLeaks({ id: "su", posted_at: "x", reason: "rain", from_start: "2026-10-01", from_end: "2026-10-06", to_start: "2026-10-02", to_end: "2026-10-07" })],
}) as unknown as PortalProjectDetail;

describe("client-facing serializer", () => {
  it("whitelists no internal field", () => {
    const whitelisted = new Set(Object.values(CLIENT_FIELDS).flat());
    for (const f of INTERNAL_FIELDS) expect(whitelisted.has(f as never), `${f} is whitelisted`).toBe(false);
  });

  it("drops every internal field from the whole Client Hub payload", () => {
    const keys = allKeys(clientSafeProjectDetail(raw));
    const leaked = INTERNAL_FIELDS.filter((f) => keys.has(f));
    expect(leaked).toEqual([]);
  });

  it("only ever outputs whitelisted keys", () => {
    const whitelisted = new Set<string>([...Object.values(CLIENT_FIELDS).flat(), "project", "business", "client", "quotes", "change_orders", "invoices", "payments", "versions", "money", "photos", "deliveries", "events", "schedule_updates", "review"]);
    const unknown = [...allKeys(clientSafeProjectDetail(raw))].filter((k) => !whitelisted.has(k));
    expect(unknown).toEqual([]);
  });

  it("keeps what the client needs", () => {
    const d = clientSafeProjectDetail(raw);
    expect(d.quotes[0].sections[0].items[0].price).toBe(10);
    expect(d.change_orders[0].sections[0].scope_note).toBe("+50 sf");
    expect(d.payments?.[0].applied_to[0].invoice_number).toBe("INV-001");
    expect((d.versions?.[0].content as { total?: number }).total).toBe(20);
    expect(d.deliveries[0].supplier).toBe("Stone Co");
    expect(d.review).toEqual({ link_path: "/r/tok" });
    expect(d.schedule_updates?.[0]).toEqual({ id: "su", posted_at: "x", reason: "rain", from_start: "2026-10-01", from_end: "2026-10-06", to_start: "2026-10-02", to_end: "2026-10-07" });
    const g = d.quotes[0].sections[0].selections![0];
    expect(g.options[0]).toEqual({ id: "o1", name: "Shale Grey", description: null, image_path: "p", price_delta: 0, is_default: true });
    expect(g.picked).toEqual(["o1"]);
  });
});
