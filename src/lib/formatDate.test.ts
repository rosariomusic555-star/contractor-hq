import { describe, it, expect } from "vitest";
import { formatDate } from "./utils";

describe("formatDate", () => {
  it("reads date-only values as that local day", () => {
    expect(formatDate("2026-09-28")).toBe("Sep 28, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });
  it("formats timestamps and blanks", () => {
    expect(formatDate(new Date(2026, 8, 28, 15).toISOString())).toBe("Sep 28, 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});
