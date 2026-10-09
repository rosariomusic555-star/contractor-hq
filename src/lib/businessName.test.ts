import { describe, expect, it } from "vitest";
import { stripLegalSuffix } from "./businessName";

describe("stripLegalSuffix", () => {
  it.each([
    ["CleanGarden Landscaping LLC", "CleanGarden Landscaping"],
    ["CleanGarden Landscaping, LLC.", "CleanGarden Landscaping"],
    ["Acme L.L.C.", "Acme"],
    ["Acme Inc.", "Acme"],
    ["Acme, Inc", "Acme"],
    ["Smith & Sons Co.", "Smith & Sons"],
    ["Big Stone Corp.", "Big Stone"],
    ["Pavers Ltd", "Pavers"],
    ["Acme Co. Inc.", "Acme"],
    ["Green Lawns!", "Green Lawns!"],
    ["Ridge Landscaping.", "Ridge Landscaping"],
  ])("%s → %s", (input, expected) => {
    expect(stripLegalSuffix(input)).toBe(expected);
  });

  it("keeps words that only end like a suffix", () => {
    expect(stripLegalSuffix("Disco")).toBe("Disco");
    expect(stripLegalSuffix("Lincoln Inc")).toBe("Lincoln");
  });

  it("never empties a name that is only a suffix", () => {
    expect(stripLegalSuffix("LLC")).toBe("LLC");
  });
});
