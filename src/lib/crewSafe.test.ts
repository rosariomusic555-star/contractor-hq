import { describe, expect, it } from "vitest";
import { CREW_FIELDS, CREW_FORBIDDEN_FIELDS, allKeys, crewSafeWorkOrder, type CrewWorkOrder } from "./crewSafe";
import { crewLocate, crewMaterialStatus, navigateUrl, telHref, workOrderChanges } from "./workOrder";

// Every forbidden field, sprinkled on every object — the serializer must drop them all.
const leak = Object.fromEntries(CREW_FORBIDDEN_FIELDS.map((f) => [f, 999]));
const L = <T extends object>(o: T) => ({ ...leak, ...o });

const raw = L({
  project: L({ id: "p", name: "Greg Patio", status: "scheduled", address: "1 Main St", scheduled_start_date: "2026-10-05", scheduled_end_date: "2026-10-09", actual_start_date: null, crew_name: "Crew A" }),
  site: L({ conditions: "36-inch gate", slope: "slight", access: "tight", soil: "normal", demo: "none" }),
  permits: [L({ kind: "locate", label: "811", status: "open", ticket: "A1", submitted: "2026-10-01", permit_status: null, number: null, date: null })],
  locate_rules: L({ wait_days: 3, valid_days: 15 }),
  client: L({ name: "Greg Gray", phone: "555-0100", notes_for_crew: "Dog in yard" }),
  crew_notes: L({ text: "Protect irrigation", photos: ["crew-notes/p/1.jpg", 5] }),
  features: [
    L({
      id: "f1", label: "Paver Patio", category: "Patio",
      measurements: [L({ id: "m1", build_type: "patio", label: null, data: L({ method: "dimensions", rect: L({ length_ft: 20, width_ft: 15, unit_cost: 9 }) }), totals: L({ area_sqft: 300, cost_estimate: 4 }) })],
      selections: [L({ group: "Paver color", choices: ["Chestnut Brown"] })],
      scope: [L({ name: "Patio install", description: "Excavate 8in", quantity: 300, unit: "sf" })],
      labor: L({ crew_days: 4, crew_size: 3, man_hours: null }),
      changes: [L({ number: 1, title: "Add border", approved_at: "x", scope_note: "+ border", items: [L({ name: "Border", description: null, quantity: 60, unit: "lf" })] })],
    }),
  ],
  general_scope: [],
  materials: [L({ id: "l1", feature_id: "f1", section: "Patio", name: "Pavers", color: "Chestnut", product: "Blu 60", quantity: 300, unit: "sf", waste_percent: 10, planned_quantity: 300, conversion_factor: 100, conversion_unit: "pallet", tracked: true, orders: [L({ quantity: 2, unit: "pallet", status: "delivered", expected_date: "2026-10-02" }), L({ quantity: 130, unit: "sf", status: "ordered", expected_date: "2026-10-03" })] })],
  deliveries: [L({ id: "d1", supplier: "Stone Co", expected_date: "2026-10-03", status: "ordered" })],
  photos: [L({ id: "ph", storage_path: "projects/p/a.jpg", caption: null })],
  delays: [L({ date: "2026-10-05", days: 1, reason: "rain" })],
  updated_at: "x",
  version: "v1",
  viewer: L({ is_owner: false, employee_id: "e", is_lead: true, can_log_usage: false }),
  last_open: null,
  reviews: [L({ name: "Marco", version: "v1", reviewed_at: "x" })],
});

describe("crew-facing serializer — no money, ever", () => {
  it("whitelists no forbidden field", () => {
    const whitelisted = new Set(Object.values(CREW_FIELDS).flat());
    for (const f of CREW_FORBIDDEN_FIELDS) expect(whitelisted.has(f as never), `${f} is whitelisted`).toBe(false);
  });
  it("drops every price / cost / internal field from the whole work order", () => {
    const keys = allKeys(crewSafeWorkOrder(raw));
    expect(CREW_FORBIDDEN_FIELDS.filter((f) => keys.has(f))).toEqual([]);
    expect([...keys].filter((k) => /price|cost|margin|overhead|amount|balance/i.test(k))).toEqual([]);
  });
  it("keeps what the crew needs", () => {
    const wo = crewSafeWorkOrder(raw)!;
    expect(wo.project.address).toBe("1 Main St");
    expect(wo.client.notes_for_crew).toBe("Dog in yard");
    expect(wo.crew_notes.photos).toEqual(["crew-notes/p/1.jpg"]);
    expect(wo.features[0].measurements[0].data).toEqual({ method: "dimensions", rect: { length_ft: 20, width_ft: 15 } });
    expect(wo.features[0].labor).toEqual({ crew_days: 4, crew_size: 3, man_hours: null });
    expect(wo.features[0].changes[0].items[0]).toEqual({ name: "Border", description: null, quantity: 60, unit: "lf" });
  });
});

describe("work order helpers", () => {
  const wo = crewSafeWorkOrder(raw)!;
  it("material status in the line's unit with waste", () => {
    // planned 300 + 10% = 330 sf; 2 pallets (200 sf) delivered + 130 sf ordered
    expect(crewMaterialStatus(wo.materials[0])).toEqual({ planned: 330, ordered: 330, delivered: 200, status: "partial" });
    expect(crewMaterialStatus({ ...wo.materials[0], orders: [] }).status).toBe("not_ordered");
    expect(crewMaterialStatus({ ...wo.materials[0], tracked: false }).status).toBe("untracked");
  });
  it("811 warnings", () => {
    expect(crewLocate(wo, "2026-10-02")).toMatchObject({ ticket: "A1", clearToDig: "2026-10-06", warning: "Not clear to dig yet" });
    expect(crewLocate(wo, "2026-10-07")?.warning).toBeNull();
    expect(crewLocate(wo, "2026-11-01")?.warning).toMatch(/EXPIRED/);
  });
  it("links", () => {
    expect(navigateUrl("1 Main St", "iPhone")).toBe("https://maps.apple.com/?daddr=1%20Main%20St");
    expect(navigateUrl("1 Main St", "Android")).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
    expect(telHref("(555) 010-0100")).toBe("tel:5550100100");
  });
  it("what changed since last opened", () => {
    const next: CrewWorkOrder = JSON.parse(JSON.stringify(wo));
    next.features[0].selections[0].choices = ["Onyx Black"];
    next.features[0].changes.push({ number: 2, title: "More", approved_at: null, scope_note: null, items: [] });
    next.crew_notes.text = "New note";
    expect(workOrderChanges(wo, next)).toEqual(["Crew notes updated", "Paver Patio: Paver color → Onyx Black", "Paver Patio: new change order"]);
    expect(workOrderChanges(null, next)).toEqual([]);
  });
});
