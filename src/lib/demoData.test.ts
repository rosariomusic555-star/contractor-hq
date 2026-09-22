import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { demoJobMeta } from "./demoData";
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
    const a = demoJobMeta({ id: "abc-123", status: "in_progress" });
    const b = demoJobMeta({ id: "abc-123", status: "in_progress" });
    expect(a).toEqual(b);
  });

  it("varies output by id", () => {
    const a = demoJobMeta({ id: "abc-123", status: "in_progress" });
    const b = demoJobMeta({ id: "zzz-999", status: "in_progress" });
    expect(a).not.toEqual(b);
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
    for (const s of ["estimating", "scheduled", "in_progress", "complete", "lost"]) {
      expect(projectStatusMeta(s).badge).toContain("badge-status");
    }
  });
  it("tolerates unknown strings", () => {
    expect(quoteStatusMeta("wat").label).toBeTruthy();
  });
});
