import { describe, expect, it } from "vitest";
import { PROJECT_STATUS_META, TONE_SOLID_CLASS, bookingDisplayStatus, projectStatusSolidClass } from "./statusMeta";

describe("bookingDisplayStatus", () => {
  it("is null for a day with no jobs", () => {
    expect(bookingDisplayStatus([])).toBeNull();
  });

  it("uses the only status when there's one", () => {
    expect(bookingDisplayStatus([{ status: "complete" }])).toBe("complete");
  });

  it("picks In progress > Scheduled > Complete on mixed days", () => {
    expect(bookingDisplayStatus([{ status: "complete" }, { status: "scheduled" }])).toBe("scheduled");
    expect(bookingDisplayStatus([{ status: "scheduled" }, { status: "in_progress" }, { status: "complete" }])).toBe("in_progress");
  });
});

describe("projectStatusSolidClass", () => {
  it("is the legend's color for each calendar status", () => {
    for (const s of ["scheduled", "in_progress", "complete"] as const) {
      expect(projectStatusSolidClass(s)).toBe(TONE_SOLID_CLASS[PROJECT_STATUS_META[s].tone]);
    }
  });
});
