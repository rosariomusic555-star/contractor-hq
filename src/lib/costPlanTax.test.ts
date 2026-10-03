import { describe, expect, it } from "vitest";
import { lineTaxView, resolveTaxRate } from "./costPlanTax";
import { lineCostWithTax, lineTax, lineTaxFormula, sectionTotals, sumSectionTotals } from "./costPlanMath";
import { costChangeDelta } from "./changeOrderCost";

const ctx = { defaultRate: 7.25, suppliers: [{ name: "Acme Stone", tax_rate: 6 }, { name: "No Rate Co", tax_rate: null }], taxOff: false };

describe("cost plan sales tax (0163)", () => {
  it("figures a line's tax and the formula", () => {
    const line = { quantity: 1, unit_cost: 6300, cost_type: "material" as const, taxable: true, tax_rate: 7.25 };
    expect(lineTax(line)).toBe(456.75);
    expect(lineCostWithTax(line)).toBe(6756.75);
    expect(lineTaxFormula(line)).toBe("$6,300.00 + 7.25% tax $456.75 = $6,756.75");
    expect(lineTax({ ...line, taxable: false })).toBe(0);
    // Before 0163 a line has no taxable flag — untaxed.
    expect(lineTax({ quantity: 1, unit_cost: 100 })).toBe(0);
  });

  it("taxes the waste-adjusted cost", () => {
    expect(lineTax({ quantity: 100, unit_cost: 10, waste_percent: 10, taxable: true, tax_rate: 10 })).toBe(110);
  });

  it("totals: by type after tax, plus subtotal and tax; labor never taxed", () => {
    const t = sectionTotals({
      labor_mode: "lump_sum",
      labor_lump_sum: 1000,
      items: [
        { quantity: 1, unit_cost: 6300, cost_type: "material", taxable: true, tax_rate: 7.25 },
        { quantity: 1, unit_cost: 500, cost_type: "subcontractor", taxable: false, tax_rate: 7.25 },
      ],
    });
    expect(t.material).toBe(6756.75);
    expect(t.subcontractor).toBe(500);
    expect(t.labor).toBe(1000);
    expect(t.tax).toBe(456.75);
    expect(t.total).toBe(8256.75);
    expect(t.subtotal).toBe(7800);
    const all = sumSectionTotals([{ items: [{ quantity: 1, unit_cost: 100, taxable: true, tax_rate: 10 }] }, { items: [{ quantity: 1, unit_cost: 200, taxable: true, tax_rate: 5 }] }]);
    expect(all.tax).toBe(20);
    expect(all.total).toBe(320);
  });

  it("resolves supplier rate, else default", () => {
    expect(resolveTaxRate(" acme stone ", ctx)).toEqual({ rate: 6, source: "supplier" });
    expect(resolveTaxRate("No Rate Co", ctx)).toEqual({ rate: 7.25, source: "default" });
    expect(resolveTaxRate("", ctx)).toEqual({ rate: 7.25, source: "default" });
  });

  it("defaults taxable by type and plan", () => {
    expect(lineTaxView({ cost_type: "material", vendor: "" }, undefined, ctx).taxable).toBe(true);
    expect(lineTaxView({ cost_type: "equipment", vendor: "" }, undefined, ctx).taxable).toBe(true);
    expect(lineTaxView({ cost_type: "subcontractor", vendor: "" }, undefined, ctx).taxable).toBe(false);
    expect(lineTaxView({ cost_type: "other", vendor: "" }, undefined, ctx).taxable).toBe(false);
    expect(lineTaxView({ cost_type: "material", vendor: "" }, undefined, { ...ctx, taxOff: true }).taxable).toBe(false);
    expect(lineTaxView({ cost_type: "subcontractor", vendor: "", taxable: true }, undefined, ctx).taxable).toBe(true);
  });

  it("keeps a saved line's rate until its vendor changes; custom wins", () => {
    const saved = { vendor: "Old Yard", tax_rate: 5, tax_rate_source: "default" as const };
    expect(lineTaxView({ cost_type: "material", vendor: "Old Yard" }, saved, ctx)).toEqual({ taxable: true, rate: 5, source: "default" });
    expect(lineTaxView({ cost_type: "material", vendor: "Acme Stone" }, saved, ctx)).toEqual({ taxable: true, rate: 6, source: "supplier" });
    expect(lineTaxView({ cost_type: "material", vendor: "Old Yard", tax_custom_rate: 8.5 }, saved, ctx)).toEqual({ taxable: true, rate: 8.5, source: "custom" });
    // Custom → back to auto: re-resolved.
    const savedCustom = { vendor: "", tax_rate: 9, tax_rate_source: "custom" as const };
    expect(lineTaxView({ cost_type: "material", vendor: "" }, savedCustom, ctx).rate).toBe(7.25);
  });

  it("change order deltas are after tax", () => {
    expect(costChangeDelta({ kind: "add", line: { quantity: 1, unit_cost: 100, cost_type: "material", tax_rate: 10 } })).toBe(110);
    expect(costChangeDelta({ kind: "add", line: { quantity: 1, unit_cost: 100, cost_type: "subcontractor", tax_rate: 10 } })).toBe(100);
    expect(costChangeDelta({ kind: "remove", line: {}, before: { quantity: 2, unit_cost: 50, cost_type: "material", taxable: true, tax_rate: 10 } })).toBe(-110);
    expect(costChangeDelta({ kind: "edit", line: { quantity: 3 }, before: { quantity: 2, unit_cost: 50, cost_type: "material", taxable: true, tax_rate: 10 } })).toBe(55);
  });
});
