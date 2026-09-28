import { describe, it, expect } from "vitest";
import { nextInvoiceNumber } from "./api";

// Money-record bug (2026-09-28): numbers came from a count, so deleting
// INV-002 of three made the next invoice a second INV-003.
describe("nextInvoiceNumber", () => {
  it("is one past the highest used, never a count", () => {
    expect(nextInvoiceNumber(["INV-001", "INV-003"])).toBe("INV-004");
    expect(nextInvoiceNumber([])).toBe("INV-001");
    expect(nextInvoiceNumber([null, "INV-009", "custom"])).toBe("INV-010");
    expect(nextInvoiceNumber(["INV-999"])).toBe("INV-1000");
  });
});
