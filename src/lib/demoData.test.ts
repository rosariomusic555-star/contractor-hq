import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { demoJobMeta, demoQuoteFinancials } from "./demoData";
import {
  invoiceStatusMeta,
  projectStatusMeta,
  quoteStatusMeta,
} from "./statusMeta";

const src = (p: string) => readFileSync(join(__dirname, p), "utf8");

describe("demoData isolation", () => {
  it("never touches Supabase", () => {
    // strip comments — the module's own doc-comment mentions the rule
    const code = src("demoData.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(code).not.toMatch(/supabase/i);
    expect(code).not.toMatch(/\.from\(['"]/); // no PostgREST table access
  });

  it("is not imported by the real data layer", () => {
    expect(src("api.ts")).not.toMatch(/demoData/);
  });
});

describe("demoData helpers are deterministic and consistent", () => {
  it("returns identical output for identical input", () => {
    const a = demoJobMeta({ id: "abc-123", status: "approved" });
    const b = demoJobMeta({ id: "abc-123", status: "approved" });
    expect(a).toEqual(b);
  });

  it("varies output by id", () => {
    const a = demoJobMeta({ id: "abc-123", status: "approved" });
    const b = demoJobMeta({ id: "zzz-999", status: "approved" });
    expect(a).not.toEqual(b);
  });

  it("quote financials degrade gracefully at zero", () => {
    expect(demoQuoteFinancials(0, 6.25, 14).marginPct).toBe(0);
    expect(demoQuoteFinancials(10000, 6.25, 14).marginPct).toBeGreaterThan(0);
  });
});

describe("statusMeta covers every real status", () => {
  it("quotes", () => {
    for (const s of ["draft", "sent", "approved", "declined", "expired"]) {
      expect(quoteStatusMeta(s).badge).toContain("badge-status");
    }
  });
  it("invoices", () => {
    for (const s of ["draft", "sent", "paid", "overdue"]) {
      expect(invoiceStatusMeta(s).badge).toContain("badge-status");
    }
  });
  it("projects", () => {
    for (const s of ["draft", "quote_sent", "approved", "invoiced", "paid"]) {
      expect(projectStatusMeta(s).badge).toContain("badge-status");
    }
  });
  it("tolerates unknown strings", () => {
    expect(quoteStatusMeta("wat").label).toBeTruthy();
  });
});
