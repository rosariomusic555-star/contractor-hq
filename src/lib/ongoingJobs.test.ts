import { describe, expect, it } from "vitest";
import { ongoingGridColumns } from "./ongoingJobs";

describe("ongoingGridColumns", () => {
  it("one column per job, capped at 3", () => {
    expect(ongoingGridColumns(1, 900)).toBe(1);
    expect(ongoingGridColumns(2, 900)).toBe(2);
    expect(ongoingGridColumns(3, 900)).toBe(3);
    expect(ongoingGridColumns(5, 900)).toBe(3);
  });

  it("drops columns when the card is too narrow for them", () => {
    expect(ongoingGridColumns(3, 502)).toBe(3); // desktop left column, inside the card padding
    expect(ongoingGridColumns(3, 420)).toBe(2);
    expect(ongoingGridColumns(3, 300)).toBe(1);
  });

  it("before the width is measured, goes by job count", () => {
    expect(ongoingGridColumns(2, 0)).toBe(2);
    expect(ongoingGridColumns(0, 0)).toBe(1);
  });
});
