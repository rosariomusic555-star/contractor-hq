import { describe, it, expect } from "vitest";
import { addDaysYmd, dayHeading, groupFromDate } from "./upcoming";

describe("upcoming from a date", () => {
  const today = "2026-09-28";
  const items = [
    { id: "a", d: "2026-09-27" },
    { id: "b", d: "2026-09-28" },
    { id: "c", d: "2026-10-05" },
    { id: "d", d: null },
    { id: "e", d: "2026-09-29" },
    { id: "f", d: "2026-09-28" },
  ];

  it("shows everything from the start date forward, grouped by day, soonest first", () => {
    const g = groupFromDate(items, (x) => x.d, today, today, { includeUndated: true });
    expect(g.map((x) => [x.heading, x.items.map((i) => i.id)])).toEqual([
      ["Today", ["b", "f"]],
      ["Tomorrow", ["e"]],
      ["Mon, Oct 5", ["c"]],
      ["No date", ["d"]],
    ]);
  });

  it("a later start date drops the days before it; undated only when asked", () => {
    const g = groupFromDate(items, (x) => x.d, addDaysYmd(today, 7), today);
    expect(g.map((x) => x.key)).toEqual(["2026-10-05"]);
  });

  it("day math crosses months and years", () => {
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayHeading("2027-01-04", today)).toBe("Mon, Jan 4, 2027");
  });
});
