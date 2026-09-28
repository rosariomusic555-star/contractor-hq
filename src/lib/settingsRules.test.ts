import { describe, it, expect } from "vitest";
import { businessProfileProblem, quoteDefaultsProblem } from "./settingsRules";

describe("quoteDefaultsProblem", () => {
  it("accepts a normal default, including a fractional deposit", () => {
    expect(quoteDefaultsProblem({ deposit_pct: 33.5, quote_validity_days: 30 })).toBeNull();
    expect(quoteDefaultsProblem({ deposit_pct: 0, quote_validity_days: 1 })).toBeNull();
    expect(quoteDefaultsProblem({ deposit_pct: 100, quote_validity_days: 365 })).toBeNull();
  });
  it("refuses a deposit outside 0–100% (every new quote would fail to save)", () => {
    expect(quoteDefaultsProblem({ deposit_pct: 150, quote_validity_days: 14 })).toMatch(/Deposit/);
    expect(quoteDefaultsProblem({ deposit_pct: -5, quote_validity_days: 14 })).toMatch(/Deposit/);
    expect(quoteDefaultsProblem({ deposit_pct: null, quote_validity_days: 14 })).toMatch(/Deposit/);
  });
  it("refuses 0, negative, fractional or blank validity", () => {
    for (const v of [0, -3, 2.5, null]) expect(quoteDefaultsProblem({ deposit_pct: 50, quote_validity_days: v })).toMatch(/validity/);
  });
});

describe("businessProfileProblem", () => {
  it("accepts normal values and blanks", () => {
    expect(businessProfileProblem({ default_labor_rate: 42.5, material_over_order_margin_pct: 10, material_not_ordered_alert_days: 7 })).toBeNull();
    expect(businessProfileProblem({})).toBeNull();
  });
  it("refuses a negative labor rate, a margin over 100% and fractional / negative alert days", () => {
    expect(businessProfileProblem({ default_labor_rate: -5 })).toMatch(/labor rate/);
    expect(businessProfileProblem({ material_over_order_margin_pct: 150 })).toMatch(/margin/);
    expect(businessProfileProblem({ material_not_ordered_alert_days: 2.5 })).toMatch(/Alert days/);
    expect(businessProfileProblem({ material_not_ordered_alert_days: -1 })).toMatch(/Alert days/);
  });
});
