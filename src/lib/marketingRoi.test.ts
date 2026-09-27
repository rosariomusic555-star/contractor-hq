import { describe, expect, it } from "vitest";
import { buildRoiRows, cplTrend, fmtMultiple, overheadMismatch, resolvePeriod, roiTone } from "./marketingRoi";

const NOW = new Date(2026, 8, 27); // Sep 27 2026

describe("resolvePeriod", () => {
  it("resolves month ranges", () => {
    expect(resolvePeriod("this_month", null, NOW).months).toEqual(["2026-09"]);
    expect(resolvePeriod("last_month", null, NOW).months).toEqual(["2026-08"]);
    expect(resolvePeriod("last_3", null, NOW)).toMatchObject({ from: "2026-07", to: "2026-09" });
    expect(resolvePeriod("last_12", null, NOW)).toMatchObject({ from: "2025-10", to: "2026-09" });
    expect(resolvePeriod("ytd", null, NOW).months).toHaveLength(9);
    expect(resolvePeriod("custom", { from: "2026-05", to: "2026-03" }, NOW)).toMatchObject({ from: "2026-03", to: "2026-05" });
  });
});

const lead = (id: string, source: string | null, stage: string, created: string, project: string | null = null) => ({
  id,
  lead_source: source,
  stage,
  created_at: created,
  project_id: project,
});

describe("buildRoiRows", () => {
  const base = {
    sources: [
      { name: "Google", paid: true },
      { name: "Referral", paid: false },
      { name: "Yelp", paid: true },
    ],
    period: { from: "2026-07", to: "2026-09" },
    openValue: (p: string) => (p === "pOpen" ? 8000 : 0),
    wonMoney: (p: string) =>
      p === "pWon" ? { revenue: 24000, grossProfit: 9000, loadedProfit: 6000 } : p === "pNoCost" ? { revenue: 5000, grossProfit: null, loadedProfit: null } : null,
    hasOverhead: true,
  };

  it("attributes by lead creation month, even when won later", () => {
    const { rows, totals, stillOpen } = buildRoiRows({
      ...base,
      leads: [
        lead("a", "Google", "won", "2026-07-10T15:00:00Z", "pWon"),
        lead("b", "Google", "lost", "2026-08-02T15:00:00Z"),
        lead("c", "google ", "proposal_sent", "2026-09-01T15:00:00Z", "pOpen"),
        lead("d", "Google", "won", "2026-05-01T15:00:00Z", "pWon"), // created before the period
        lead("e", "Referral", "won", "2026-08-01T15:00:00Z", "pNoCost"),
      ],
      spend: [
        { lead_source: "Google", month: "2026-07-01", amount: 1000 },
        { lead_source: "Google", month: "2026-09-01", amount: 1000 },
        { lead_source: "Google", month: "2026-04-01", amount: 5000 }, // outside
        { lead_source: "Yelp", month: "2026-08-01", amount: 300 },
      ],
    });
    const g = rows.find((r) => r.source === "Google")!;
    expect(g).toMatchObject({ spend: 2000, leads: 3, won: 1, lost: 1, open: 1, openValue: 8000, wonRevenue: 24000, grossProfit: 9000, loadedProfit: 6000 });
    expect(g.costPerLead).toBeCloseTo(666.67, 1);
    expect(g.costPerWon).toBe(2000);
    expect(g.roas).toBe(12);
    expect(g.profitPerDollar).toBe(4.5);
    expect(g.winRate).toBe(50);

    const r = rows.find((x) => x.source === "Referral")!;
    expect(r).toMatchObject({ paid: false, spend: null, costPerLead: null, roas: null, unknownProfit: 1, wonRevenue: 5000 });

    // Spend with no leads still shows — and it's all loss.
    const y = rows.find((x) => x.source === "Yelp")!;
    expect(y).toMatchObject({ leads: 0, spend: 300, costPerLead: null, roas: 0, profitPerDollar: 0 });

    expect(totals).toMatchObject({ spend: 2300, leads: 4, won: 2, wonRevenue: 29000 });
    expect(totals.costPerLead).toBe(575);
    expect(stillOpen).toBe(1);
  });

  it("a paid source with no spend yet shows no cost per lead", () => {
    const { rows } = buildRoiRows({ ...base, leads: [lead("g", "Google", "won", "2026-09-02T12:00:00Z", "pWon")], spend: [] });
    expect(rows[0]).toMatchObject({ paid: true, spend: 0, costPerLead: null, costPerWon: null, roas: null });
  });

  it("an unlisted source is free unless spend was entered", () => {
    const { rows } = buildRoiRows({ ...base, leads: [lead("x", null, "new_lead", "2026-09-02T12:00:00Z")], spend: [] });
    expect(rows[0]).toMatchObject({ source: "Unknown", paid: false, spend: null });
  });
});

describe("tones and hints", () => {
  it("colours against thresholds", () => {
    expect(roiTone(6, 5, 2)).toBe("green");
    expect(roiTone(3, 5, 2)).toBe("amber");
    expect(roiTone(1, 5, 2)).toBe("red");
    expect(roiTone(null, 5, 2)).toBe(null);
    expect(fmtMultiple(12.44)).toBe("12.4×");
  });
  it("flags a big overhead mismatch only", () => {
    expect(overheadMismatch(14200, 9000)).toBe(true);
    expect(overheadMismatch(9300, 9000)).toBe(false);
    expect(overheadMismatch(14200, null)).toBe(false);
  });
  it("trends cost per lead by month", () => {
    const t = cplTrend(
      [lead("a", "Google", "new_lead", "2026-08-03T12:00:00Z"), lead("b", "Google", "new_lead", "2026-08-09T12:00:00Z")],
      [{ lead_source: "Google", month: "2026-08-01", amount: 500 }],
      ["2026-08", "2026-09"],
      ["Google"],
    );
    expect(t).toEqual([
      { month: "2026-08", Google: 250 },
      { month: "2026-09", Google: null },
    ]);
  });
});
