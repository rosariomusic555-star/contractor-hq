import { describe, expect, it } from "vitest";
import { highlightParts, matchPages, phoneDigits, phoneMatches, resultHref } from "./globalSearch";

describe("phone matching", () => {
  it("ignores formatting on both sides", () => {
    expect(phoneDigits("(555) 123-4567")).toBe("5551234567");
    expect(phoneMatches("(555) 123-4567", "5551234")).toBe(true);
    expect(phoneMatches("(555) 123-4567", "123-45")).toBe(true);
    expect(phoneMatches("+1 555.123.4567", "555 123 4567")).toBe(true);
  });

  it("needs 3+ digits and no false hits", () => {
    expect(phoneMatches("(555) 123-4567", "55")).toBe(false);
    expect(phoneMatches("(555) 123-4567", "999")).toBe(false);
    expect(phoneMatches(null, "555")).toBe(false);
  });
});

describe("matchPages", () => {
  it("finds sidebar pages anywhere in the label", () => {
    expect(matchPages("time").map((p) => p.label)).toContain("Timesheets");
    expect(matchPages("TIME")[0].to).toBe("/timesheets");
  });

  it("includes Settings pages, flagged as such", () => {
    const profile = matchPages("profile").find((p) => p.to === "/settings/profile");
    expect(profile).toMatchObject({ label: "My profile", section: "Settings" });
  });

  it("starts-with (any word) ranks first; under 2 characters finds nothing", () => {
    const labels = matchPages("in").map((p) => p.label);
    expect(labels[0]).toBe("Invoices");
    expect(matchPages("t")).toEqual([]);
  });
});

describe("resultHref / highlightParts", () => {
  it("links each type to its page", () => {
    expect(resultHref({ type: "project", href_params: { id: "p1" } })).toBe("/projects/p1");
    expect(resultHref({ type: "change_order", href_params: { id: "c1", project_id: "p1" } })).toBe("/projects/p1?tab=change-orders");
    expect(resultHref({ type: "opportunity", href_params: { id: "o1" } })).toBe("/pipeline/o1");
  });

  it("marks the first case-insensitive match", () => {
    expect(highlightParts("Backyard Patio", "pat")).toEqual([
      { text: "Backyard ", match: false },
      { text: "Pat", match: true },
      { text: "io", match: false },
    ]);
    expect(highlightParts("Deck", "zz")).toEqual([{ text: "Deck", match: false }]);
  });
});
