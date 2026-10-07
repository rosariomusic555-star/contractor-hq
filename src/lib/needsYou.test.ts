import { describe, it, expect } from "vitest";
import type { Invoice, Quote } from "./api";
import { buildNeedsYouItems, depositItems, standaloneApprovedItems } from "./needsYou";
import { suggestedProjectName } from "./standaloneQuote";
import { quoteListStatusMeta } from "./statusMeta";

const quote = (price: number, pct: number, id = "q1") =>
  ({
    id,
    status: "approved",
    project_id: `p-${id}`,
    project: { name: "Patio" },
    deposit_percentage: pct,
    updated_at: "2026-09-20T12:00:00Z",
    quote_sections: [{ quote_items: [{ quantity: 1, price, is_optional: false, client_selected: true }] }],
  }) as unknown as Quote;

describe("depositItems (Needs you: quote approved — needs deposit)", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  it("asks for the deposit amount", () => {
    const [item] = depositItems([quote(10000, 30)], [] as Invoice[], now);
    expect(item.subtitle).toBe("Patio · $3,000.00 (30%)");
  });
  it("skips a $0 quote or a 0% deposit — nothing to bill", () => {
    expect(depositItems([quote(0, 50, "a"), quote(5000, 0, "b")], [] as Invoice[], now)).toEqual([]);
  });
});

describe("approved standalone quote (0166)", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const standalone = { ...quote(10000, 30, "s"), project_id: null, project: null, client: { name: "Greg Gray" } } as unknown as Quote;

  it("is a red, top-of-list Create project item — not a deposit to bill", () => {
    const [item] = standaloneApprovedItems([standalone], now);
    expect(item).toMatchObject({ tone: "red", title: "Greg Gray approved a standalone quote", action: "Create project", href: "/quotes/s?convert=1" });
    expect(depositItems([standalone], [] as Invoice[], now)).toEqual([]);
    const all = buildNeedsYouItems([quote(10000, 30), standalone], [] as Invoice[], now);
    expect(all[0].key).toBe("quote-standalone-s");
  });
  it("only while approved and not in a project", () => {
    expect(standaloneApprovedItems([{ ...standalone, status: "declined" } as Quote, quote(100, 10)], now)).toEqual([]);
  });
  it("lists as Approved · No project", () => {
    expect(quoteListStatusMeta({ status: "approved", project_id: null }).label).toBe("Approved · No project");
    expect(quoteListStatusMeta({ status: "approved", project_id: "p" }).label).toBe("Approved");
  });
  it("names the project from the client and the work", () => {
    expect(suggestedProjectName("Greg Gray", ["Paver Patio"])).toBe("Greg Gray — Paver Patio");
    expect(suggestedProjectName("Greg Gray", ["Paver Patio", "Fire Pit", "Lighting"])).toBe("Greg Gray — Paver Patio + 2 more");
    expect(suggestedProjectName(null, [])).toBe("New project");
  });
});
