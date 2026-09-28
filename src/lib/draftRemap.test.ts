import { describe, it, expect } from "vitest";
import { remapDraftIds } from "./draftRemap";

// Data bug (2026-09-28): a Cost plan save that failed halfway left the lines
// it had already created with temporary ids — saving again created them twice.
describe("remapDraftIds", () => {
  it("rows created before the failure keep their real ids; the rest stay new", () => {
    const draft = [
      { id: "tmp-s1", name: "Patio", items: [{ id: "tmp-a", n: 1 }, { id: "tmp-b", n: 2 }] },
      { id: "real-s2", name: "Wall", items: [{ id: "real-c", n: 3 }] },
    ];
    const out = remapDraftIds(draft, new Map([["tmp-s1", "S1"], ["tmp-a", "A"]]));
    expect(out.map((s) => [s.id, s.items.map((i) => i.id)])).toEqual([
      ["S1", ["A", "tmp-b"]],
      ["real-s2", ["real-c"]],
    ]);
    expect(remapDraftIds(draft, new Map())).toBe(draft);
  });
});
