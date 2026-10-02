import { describe, expect, it } from "vitest";
import { changedItemIds, draftChanges } from "./draftChanges";

const sections = [
  { id: "a", name: "Patio", items: [{ id: "1", qty: 1 }] },
  { id: "b", name: "Wall", items: [] },
];

describe("draftChanges", () => {
  it("nothing changed → 0", () => {
    expect(draftChanges(sections, structuredClone(sections)).count).toBe(0);
  });

  it("counts edited, added and removed rows; returns edited/new ids", () => {
    const draft = [{ ...sections[0], items: [{ id: "1", qty: 2 }] }, { id: "c", name: "New", items: [] }];
    const r = draftChanges(draft, sections);
    expect(r.count).toBe(3); // a edited, c added, b removed
    expect([...r.changedIds].sort()).toEqual(["a", "c"]);
  });

  it("a reorder alone is one change", () => {
    expect(draftChanges([sections[1], sections[0]], sections).count).toBe(1);
  });

  it("top-level fields count one each, row lists inside an object are diffed", () => {
    const base = { notes: "", deposit: 30, sections };
    const draft = { notes: "Hi", deposit: 30, sections: [sections[0], { ...sections[1], name: "Seat wall" }] };
    const r = draftChanges(draft, base);
    expect(r.count).toBe(2);
    expect([...r.changedIds]).toEqual(["b"]);
  });
});

describe("changedItemIds", () => {
  const saved = [
    { id: "a", items: [{ id: "1", qty: 1 }, { id: "2", qty: 2 }] },
    { id: "b", items: [{ id: "3", qty: 3 }] },
  ];
  it("new and edited lines, wherever they sit", () => {
    const draft = [
      { id: "a", items: [{ id: "1", qty: 5 }] },
      { id: "b", items: [{ id: "3", qty: 3 }, { id: "2", qty: 2 }, { id: "tmp-x", qty: 0 }] },
    ];
    expect([...changedItemIds(draft, saved)].sort()).toEqual(["1", "tmp-x"]);
  });
  it("nothing when only the order changed", () => {
    const draft = [{ id: "a", items: [{ id: "2", qty: 2 }, { id: "1", qty: 1 }] }, saved[1]];
    expect(changedItemIds(draft, saved).size).toBe(0);
  });
});
