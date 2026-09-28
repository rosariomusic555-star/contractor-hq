import { describe, expect, it } from "vitest";
import { joinFeet, splitFeet } from "./feetInches";

describe("feet + inches", () => {
  it("joins to decimal feet", () => {
    expect(joinFeet("12", "6")).toBe(12.5);
    expect(joinFeet("0", "9")).toBe(0.75);
    expect(joinFeet("12.5", "")).toBe(12.5);
    expect(joinFeet("", "")).toBeNull();
  });
  it("splits decimal feet back without drifting", () => {
    expect(splitFeet(12.5)).toEqual({ ft: "12", inch: "6" });
    expect(splitFeet(10)).toEqual({ ft: "10", inch: "" });
    expect(splitFeet(null)).toEqual({ ft: "", inch: "" });
    expect(joinFeet(splitFeet(7.3333).ft, splitFeet(7.3333).inch)).toBeCloseTo(7.3333, 3);
  });
});

describe("fmtFeet", () => {
  it("shows typed dimensions as feet + inches", async () => {
    const { fmtFeet } = await import("./feetInches");
    expect(fmtFeet(12.5)).toBe("12 ft 6 in");
    expect(fmtFeet(5)).toBe("5 ft");
    expect(fmtFeet(0.5)).toBe("6 in");
    expect(fmtFeet(3.5833)).toBe("3 ft 7 in");
    expect(fmtFeet(null)).toBe("");
  });
});
