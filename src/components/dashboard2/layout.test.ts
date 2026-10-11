import { describe, expect, it } from "vitest";
import { defaultGrid, defaultOrder, defaultState, parseLayoutState, pxToRows, resolveGrid, resolvePhone, rowsToPx, sizeLimits, withExtras } from "./layout";

describe("dashboard grid layout", () => {
  it("default desktop: Schedule | Needs + Pipeline, then full-width Ongoing, Revenue, Recent activity", () => {
    const g = defaultGrid("lg", ["revenue"]);
    const by = Object.fromEntries(g.map((it) => [it.i, it]));
    expect([by.schedule.x, by.schedule.w]).toEqual([0, 8]);
    expect([by.needs.x, by.needs.w, by.pipeline.x, by.pipeline.w]).toEqual([8, 4, 8, 4]);
    expect(by.needs.y).toBeLessThan(by.pipeline.y);
    expect([by.ongoing.w, by.revenue.w, by.recent.w]).toEqual([12, 12, 12]);
    expect(by.ongoing.y).toBeLessThan(by.revenue.y);
    expect(by.revenue.y).toBeLessThan(by.recent.y);
    expect(g.every((it) => it.auto)).toBe(true);
  });

  it("tablet default is one full-width column in the phone order", () => {
    const g = defaultGrid("md", []);
    expect(g.map((it) => it.i)).toEqual(defaultOrder([]));
    expect(g.every((it) => it.w === 12 && it.x === 0)).toBe(true);
  });

  it("a breakpoint with nothing saved is derived from the default", () => {
    const s = defaultState(["weather"]);
    expect(resolveGrid(s, "lg")).toEqual(defaultGrid("lg", ["weather"]));
    expect(resolvePhone(s)).toEqual(defaultOrder(["weather"]));
  });

  it("keeps saved sizes inside each card's limits", () => {
    const s = { ...defaultState([]), lg: [{ i: "ongoing" as const, x: 10, y: 0, w: 2, h: 1 }] };
    const ongoing = resolveGrid(s, "lg").find((it) => it.i === "ongoing")!;
    expect(ongoing.w).toBe(6);
    expect(ongoing.x).toBe(6);
    expect(ongoing.h).toBe(5);
    expect(sizeLimits("needs", "md").minW).toBe(6);
  });

  it("adds missing cards at the bottom and drops hidden ones", () => {
    const s = { ...defaultState([]), lg: [{ i: "schedule" as const, x: 0, y: 0, w: 12, h: 5 }, { i: "money" as const, x: 0, y: 5, w: 4, h: 3 }] };
    const g = resolveGrid(s, "lg");
    expect(g.map((it) => it.i)).not.toContain("money");
    expect(g.find((it) => it.i === "needs")!.y).toBeGreaterThanOrEqual(5);
  });

  it("turning an optional card on drops it in at the bottom of saved layouts", () => {
    const s = { ...defaultState([]), lg: [{ i: "schedule" as const, x: 0, y: 0, w: 12, h: 5 }], phone: ["recent" as const, "needs" as const] };
    const next = withExtras(s, ["bookings"]);
    expect(next.extras).toEqual(["bookings"]);
    const b = next.lg!.find((it) => it.i === "bookings")!;
    expect([b.y, b.w, b.auto]).toEqual([5, 8, true]);
    expect(next.phone!.at(-1)).toBe("bookings");
    expect(withExtras(next, []).lg!.some((it) => it.i === "bookings")).toBe(false);
  });

  it("a card added while a breakpoint is still on the default goes to the bottom", () => {
    const next = withExtras(defaultState([]), ["weather"]);
    const g = resolveGrid(next, "lg");
    const weather = g.find((it) => it.i === "weather")!;
    expect(weather.y).toBeGreaterThanOrEqual(Math.max(...g.filter((it) => it.i !== "weather").map((it) => it.y + it.h)));
    expect(resolvePhone(next).at(-1)).toBe("weather");
    expect(withExtras(defaultState(["weather"]), []).lg).toBeUndefined();
  });

  it("parses saved JSON and rejects junk", () => {
    expect(parseLayoutState(null)).toBeNull();
    expect(parseLayoutState({ v: 2, extras: [] })).toBeNull();
    const p = parseLayoutState({ v: 1, extras: ["revenue", "nope", "revenue"], lg: [{ i: "needs", x: 8, y: 0, w: 4, h: 6, auto: true }, { i: "bogus" }], phone: ["needs", "x"] });
    expect(p).toEqual({ v: 1, extras: ["revenue"], lg: [{ i: "needs", x: 8, y: 0, w: 4, h: 6, auto: true }], phone: ["needs"] });
  });

  it("converts between px and rows (40px rows, 16px gaps)", () => {
    expect(rowsToPx(3)).toBe(152);
    expect(pxToRows(152)).toBe(3);
    expect(pxToRows(153)).toBe(4);
  });
});
