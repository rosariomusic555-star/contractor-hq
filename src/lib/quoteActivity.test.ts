import { describe, expect, it } from "vitest";
import { activityBadge, activityByVersion, activityLine, coldState, deviceType } from "./quoteActivity";

const now = new Date("2026-09-27T12:00:00Z");
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();
const base = { status: "sent" as const, sent_at: ago(60 * 24 * 2), view_count: 0, first_viewed_at: null, last_viewed_at: null, last_view_device: null, selections_changed_at: null };

describe("quote activity", () => {
  it("activity line", () => {
    expect(activityLine(base, now)).toBe("Not opened yet · sent 2 days ago");
    expect(activityLine({ ...base, view_count: 3, first_viewed_at: ago(600), last_viewed_at: ago(20), last_view_device: "mobile" }, now)).toBe(
      "Viewed 3 times · last opened 20 min ago · on mobile",
    );
  });

  it("list badges", () => {
    expect(activityBadge(base)?.label).toBe("Not opened");
    expect(activityBadge({ ...base, view_count: 1 })?.label).toBe("Viewed");
    expect(activityBadge({ ...base, view_count: 3 })?.label).toBe("Viewed 3×");
    expect(activityBadge({ ...base, view_count: 3, selections_changed_at: ago(5) })?.label).toBe("Selections changed");
    expect(activityBadge({ ...base, status: "approved" as never })).toBeNull();
  });

  it("going cold after X days unopened / Y days viewed-not-signed", () => {
    const s = { cold_unopened_days: 3, cold_unsigned_days: 5 };
    expect(coldState(base, s, now)).toBeNull(); // 2 days
    expect(coldState({ ...base, sent_at: ago(60 * 24 * 4) }, s, now)).toEqual({ kind: "unopened", days: 4 });
    expect(coldState({ ...base, view_count: 1, first_viewed_at: ago(60 * 24 * 6) }, s, now)).toEqual({ kind: "unsigned", days: 6 });
    expect(coldState({ ...base, view_count: 1, first_viewed_at: ago(60 * 24 * 1) }, s, now)).toBeNull();
  });

  it("device type from the browser's UA only", () => {
    expect(deviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile")).toBe("mobile");
    expect(deviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(deviceType("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
  });

  it("groups by version, latest first", () => {
    const g = activityByVersion(
      [{ id: "s1", version: 1 } as never, { id: "s2", version: 2 } as never],
      [{ id: "e1", version: 2 } as never],
    );
    expect(g.map((x) => [x.version, x.sessions.length, x.events.length])).toEqual([
      [2, 1, 1],
      [1, 1, 0],
    ]);
  });
});
