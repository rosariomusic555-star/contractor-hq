import { describe, expect, it } from "vitest";
import {
  OVERHEAD_SETTINGS_DEFAULTS,
  annualAmount,
  annualOverhead,
  averageLaborRate,
  burdenPerCrewDay,
  burdenPerHour,
  crewDayHours,
  formatLabor,
  looksLikeOverhead,
  lumpSumsWithoutHours,
  plannedManHours,
  productiveCrewDays,
  productiveManHours,
  requiredSellRatePerHour,
  trueCost,
  type OverheadSettings,
} from "./overhead";
import { laborFormula, sectionLaborCost, sectionLaborHours } from "./costPlanMath";

const settings = (patch: Partial<OverheadSettings> = {}): OverheadSettings => ({
  ...OVERHEAD_SETTINGS_DEFAULTS,
  items: [
    { key: "insurance", label: "Insurance", amount: 12000, period: "year" },
    { key: "rent", label: "Rent", amount: 2000, period: "month" },
    { key: "software", label: "Software", amount: 500, period: "month" },
    { key: "trucks", label: "Truck payments", amount: 3000, period: "month" },
  ],
  field_workers: 4,
  weeks_per_year: 50,
  days_per_week: 5,
  hours_per_day: 8,
  utilization_pct: 70,
  crew_size: 3,
  ...patch,
});

describe("overhead settings", () => {
  it("annualizes rows and totals them", () => {
    expect(annualAmount({ amount: 2000, period: "month" })).toBe(24000);
    expect(annualAmount({ amount: null, period: "year" })).toBe(0);
    expect(annualOverhead(settings())).toBe(12000 + 24000 + 6000 + 36000);
  });

  it("productive capacity from the helper, or typed in", () => {
    // 4 × 50 × 5 × 8 × 70% = 5,600
    expect(productiveManHours(settings())).toBe(5600);
    expect(crewDayHours(settings())).toBe(24);
    expect(productiveCrewDays(settings())).toBeCloseTo(233.33, 1);
    expect(productiveManHours(settings({ manual_man_hours: 4000 }))).toBe(4000);
    expect(productiveManHours(settings({ manual_crew_days: 200 }))).toBe(4800);
    expect(productiveManHours(settings({ field_workers: null }))).toBeNull();
  });

  it("burden per man-hour and per crew-day", () => {
    // $78,000 ÷ 5,600 h
    expect(burdenPerHour(settings())).toBeCloseTo(13.93, 2);
    expect(burdenPerCrewDay(settings())).toBeCloseTo(13.93 * 24, 0);
    expect(burdenPerHour(settings({ items: [] }))).toBeNull();
    expect(burdenPerHour(null)).toBeNull();
  });
});

describe("labor → overhead", () => {
  const sections = [
    { labor_mode: "crew" as const, labor_crew_size: 3, labor_days: 4, labor_hours_per_day: 8, labor_rate: 30, materials_items: [] },
    { labor_mode: "hours" as const, labor_man_hours: 20, labor_rate: 40, materials_items: [] },
    { labor_mode: "lump_sum" as const, labor_lump_sum: 2000, labor_man_hours: 40, materials_items: [] },
    { labor_mode: "lump_sum" as const, labor_lump_sum: 900, materials_items: [] },
    { labor_mode: "crew" as const, labor_crew_size: 2, labor_days: 5, labor_hours_per_day: 8, labor_rate: 30, feature: { status: "proposed" as const }, materials_items: [] },
  ];

  it("man-hours per labor mode", () => {
    expect(sectionLaborHours(sections[1])).toBe(20);
    expect(sectionLaborCost(sections[1])).toBe(800);
    expect(laborFormula(sections[1])).toBe("20 man-hours × $40 = $800");
    expect(laborFormula(sections[2])).toBe("Lump sum $2,000 · 40 man-hours");
    expect(plannedManHours(sections)).toBe(96 + 20 + 40); // proposed feature left out
    expect(lumpSumsWithoutHours(sections)).toBe(1);
    // (2,880 + 800 + 2,000) ÷ 156 h
    expect(averageLaborRate(sections)).toBeCloseTo(5680 / 156, 4);
  });

  it("true cost: break-even, expected vs fully loaded, required price, status", () => {
    const tc = trueCost({ direct: 10000, manHours: 100, rate: 15, price: 15000, targetMarginPct: 25 });
    expect(tc.overhead).toBe(1500);
    expect(tc.breakEven).toBe(11500);
    expect(tc.expectedProfit).toBe(5000);
    expect(tc.expectedMarginPct).toBeCloseTo(33.33, 1);
    expect(tc.fullyLoadedProfit).toBe(3500);
    expect(tc.fullyLoadedMarginPct).toBeCloseTo(23.33, 1);
    expect(tc.requiredPrice).toBeCloseTo(15333.33, 1);
    expect(tc.requiredGap).toBeCloseTo(-333.33, 1);
    expect(tc.status).toBe("amber");
    expect(trueCost({ direct: 10000, manHours: 100, rate: 15, price: 16000, targetMarginPct: 25 }).status).toBe("green");
    expect(trueCost({ direct: 10000, manHours: 100, rate: 15, price: 11000, targetMarginPct: 25 }).status).toBe("red");
    expect(trueCost({ direct: 10000, manHours: 100, rate: 15, price: 12000, targetMarginPct: null })).toMatchObject({ requiredPrice: null, status: "green" });
  });

  it("required selling rate per man-hour", () => {
    expect(requiredSellRatePerHour(30, 15, 25)).toBe(60);
    expect(requiredSellRatePerHour(null, 15, 25)).toBeNull();
  });

  it("formats labor in the preferred unit", () => {
    expect(formatLabor(96, { display_unit: "hours", crew_size: 3, hours_per_day: 8 })).toBe("96 man-hours");
    expect(formatLabor(96, { display_unit: "crew_days", crew_size: 3, hours_per_day: 8 })).toBe("4 crew-days");
  });
});

describe("looks like overhead", () => {
  it("flags company-wide costs, never job-specific ones", () => {
    for (const n of ["General liability insurance", "Truck payment", "Software subscription", "Office rent", "Marketing", "Cell phone"])
      expect(looksLikeOverhead(n)).toBe(true);
    for (const n of ["Permit", "Dumpster", "Skid steer rental", "Equipment rental", "Gravel delivery", "Pavers", "Porta potty", ""])
      expect(looksLikeOverhead(n)).toBe(false);
  });
});
