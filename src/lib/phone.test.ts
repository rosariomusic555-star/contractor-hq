import { describe, expect, it } from "vitest";
import { formatPhone, phoneHref } from "./utils";

describe("formatPhone / phoneHref", () => {
  it.each(["7044385903", "704-438-5903", "(704) 438-5903", "704.438.5903", "+1 704 438 5903", "17044385903"])(
    "%s",
    (raw) => {
      expect(formatPhone(raw)).toBe("(704) 438-5903");
      expect(phoneHref(raw)).toBe("tel:+17044385903");
    },
  );

  it("leaves non-US numbers as entered, digits-only href", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(phoneHref("+44 20 7946 0958")).toBe("tel:+442079460958");
  });
});
