import { describe, expect, it } from "vitest";
import { GENERIC_MILESTONES, mergeFeed, milestoneTrackers, milestonesFor, shouldPromptClient } from "./progress";

describe("milestones", () => {
  it("defaults by build type, overridable, generic fallback", () => {
    expect(milestonesFor("Paver Patio")[1]).toBe("Base installed & compacted");
    expect(milestonesFor("Paver Patio", { paver_patio: ["Dig", "Lay"] })).toEqual(["Dig", "Lay"]);
    expect(milestonesFor("Something custom")).toEqual(GENERIC_MILESTONES);
    expect(milestonesFor(null)).toEqual(GENERIC_MILESTONES);
  });

  it("tracker: done, latest, next", () => {
    const t = milestoneTrackers(
      [
        { id: "f1", label: "Paver Patio", category: "Paver Patio" },
        { id: "f2", label: "Seating Wall", category: "Seating Wall" },
      ],
      [
        { feature_id: "f1", milestone: "Excavation done", date: "2026-10-01" },
        { feature_id: "f1", milestone: "Base installed & compacted", date: "2026-10-03" },
        { feature_id: "f1", milestone: null, date: "2026-10-04" },
      ],
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ label: "Paver Patio", latest: "Base installed & compacted", next: "Pavers laid" });
    expect(t[0].steps.filter((s) => s.done).map((s) => s.label)).toEqual(["Excavation done", "Base installed & compacted"]);
  });
});

describe("feed + prompts", () => {
  it("merges progress and schedule updates newest first", () => {
    const f = mergeFeed([{ date: "2026-10-03", id: "p" }], [{ posted_at: "2026-10-04", id: "s" }, { posted_at: "2026-10-01", id: "s0" }]);
    expect(f.map((x) => x.kind)).toEqual(["schedule", "progress", "schedule"]);
  });
  it("each / daily / never", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(shouldPromptClient("never", null, now)).toBe(false);
    expect(shouldPromptClient("each", "2026-10-05T11:00:00Z", now)).toBe(true);
    expect(shouldPromptClient("daily", "2026-10-05T08:00:00Z", now)).toBe(false);
    expect(shouldPromptClient("daily", "2026-10-04T08:00:00Z", now)).toBe(true);
    expect(shouldPromptClient("daily", null, now)).toBe(true);
  });
});
