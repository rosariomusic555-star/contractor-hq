import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  clientHubLink,
  fillTemplate,
  firstName,
  templateKeyFor,
  templateVars,
  unknownPlaceholders,
} from "./messageTemplates";
import { mailtoHref, normalizePhone, smsHref } from "./clientMessaging";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";

describe("templateKeyFor", () => {
  it("picks rain for Rain/Weather delays, schedule change otherwise", () => {
    expect(templateKeyFor({ source: "delay", reason: "rain", from_start: "2026-10-01" })).toBe("rain_delay");
    expect(templateKeyFor({ source: "delay", reason: "weather_other", from_start: "2026-10-01" })).toBe("rain_delay");
    expect(templateKeyFor({ source: "delay", reason: "material", from_start: "2026-10-01" })).toBe("schedule_change");
    expect(templateKeyFor({ source: "manual", reason: null, from_start: "2026-10-01" })).toBe("schedule_change");
  });
  it("start confirmed for confirmations and first-time scheduling", () => {
    expect(templateKeyFor({ source: "confirm", reason: null, from_start: "2026-10-01" })).toBe("start_confirmed");
    expect(templateKeyFor({ source: "manual", reason: null, from_start: null })).toBe("start_confirmed");
  });
});

describe("filling", () => {
  const base = { clientName: "Greg Gray", companyName: "Stone & Co", projectName: "Greg Patio", hubLink: "https://x/portal/projects/p" };

  it("fills the rain template for a pushed job", () => {
    const vars = templateVars({
      ...base,
      update: { source: "delay", reason: "rain", from_start: "2026-10-01", from_end: "2026-10-06", to_start: "2026-10-02", to_end: "2026-10-07" },
      delayDay: "2026-10-01",
      daysDelayed: 1,
    });
    expect(fillTemplate(DEFAULT_TEMPLATES.rain_delay.body, vars)).toBe(
      "Hi Greg, it's Stone & Co. Rain is expected Thu Oct 1, so we're moving your Greg Patio work to Fri Oct 2. We'll keep you posted. Any questions, just reply here.",
    );
    expect(fillTemplate(DEFAULT_TEMPLATES.rain_delay.subject, vars)).toBe("Schedule update: Greg Patio");
  });

  it("uses the day work resumes when an in-progress job is extended", () => {
    const vars = templateVars({
      ...base,
      update: { source: "delay", reason: "rain", from_start: "2026-09-28", from_end: "2026-10-02", to_start: "2026-09-28", to_end: "2026-10-05" },
      delayDay: "2026-10-01",
      daysDelayed: 1,
    });
    expect(vars.new_start_date).toBe("Fri Oct 2");
    expect(vars.new_end_date).toBe("Mon Oct 5");
  });

  it("reason words, fallbacks, unknown placeholders", () => {
    const vars = templateVars({
      ...base,
      clientName: "",
      companyName: "",
      update: { source: "delay", reason: "material", from_start: "2026-10-01", from_end: null, to_start: "2026-10-05", to_end: null },
      delayDay: "2026-10-01",
      daysDelayed: 2,
    });
    expect(vars.reason).toBe("a material delay");
    expect(vars.client_first_name).toBe("there");
    expect(vars.company_name).toBe("your contractor");
    expect(vars.new_end_date).toBe("Mon Oct 5");
    expect(fillTemplate("{project_name} {oops}", vars)).toBe("Greg Patio {oops}");
    expect(unknownPlaceholders("Hi {client_first_name} {oops} {new_start_or_date}")).toEqual(["oops"]);
    expect(firstName("  Ana  María ")).toBe("Ana");
    expect(clientHubLink("p1", "https://app.test")).toBe("https://app.test/portal/projects/p1");
  });
});

describe("messaging links", () => {
  it("sms: uses & on Apple and ? elsewhere, with an encoded body", () => {
    expect(smsHref("(555) 123-4567", "Hi Greg & co", IPHONE)).toBe("sms:5551234567&body=Hi%20Greg%20%26%20co");
    expect(smsHref("+1 555 123 4567", "Hi", ANDROID)).toBe("sms:+15551234567?body=Hi");
    expect(normalizePhone(" +1 (555) 000-1111 ")).toBe("+15550001111");
  });
  it("mailto: has to, subject and CRLF body", () => {
    expect(mailtoHref("greg@example.com", "Schedule update: Greg Patio", "Line 1\nLine 2")).toBe(
      "mailto:greg@example.com?subject=Schedule%20update%3A%20Greg%20Patio&body=Line%201%0D%0ALine%202",
    );
  });
});
