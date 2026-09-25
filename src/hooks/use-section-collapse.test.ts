import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSectionCollapse } from "./use-section-collapse";

beforeEach(() => localStorage.clear());

describe("useSectionCollapse", () => {
  it("builder usage (no options): absent = expanded, stored as a bare array like before", () => {
    localStorage.setItem("chq_section_collapse_v1", JSON.stringify(["s1"]));
    const { result } = renderHook(() => useSectionCollapse());
    expect(result.current.isCollapsed("s1")).toBe(true);
    expect(result.current.isCollapsed("s2")).toBe(false);
    act(() => result.current.toggle("s2"));
    expect(JSON.parse(localStorage.getItem("chq_section_collapse_v1")!)).toEqual(["s1", "s2"]);
    act(() => result.current.expandAll(["s1", "s2"]));
    expect(JSON.parse(localStorage.getItem("chq_section_collapse_v1")!)).toEqual([]);
  });

  it("with a default: the default applies until the user chooses, then the choice wins and persists", () => {
    const opts = { storageKey: "k:user1", defaultCollapsed: (id: string) => id === "has-data" };
    const { result } = renderHook(() => useSectionCollapse(opts));
    expect(result.current.isCollapsed("has-data")).toBe(true);
    expect(result.current.isCollapsed("empty")).toBe(false);
    act(() => result.current.toggle("has-data"));
    expect(result.current.isCollapsed("has-data")).toBe(false);
    // A fresh mount (next visit) remembers the explicit expand over the default.
    const again = renderHook(() => useSectionCollapse(opts));
    expect(again.result.current.isCollapsed("has-data")).toBe(false);
    act(() => again.result.current.collapseAll(["has-data", "empty"]));
    expect(again.result.current.isCollapsed("empty")).toBe(true);
  });

  it("keeps each user's state separate", () => {
    const a = renderHook(() => useSectionCollapse({ storageKey: "k:a", defaultCollapsed: () => false }));
    act(() => a.result.current.toggle("card"));
    const b = renderHook(() => useSectionCollapse({ storageKey: "k:b", defaultCollapsed: () => false }));
    expect(a.result.current.isCollapsed("card")).toBe(true);
    expect(b.result.current.isCollapsed("card")).toBe(false);
  });
});

describe("useSectionCollapse across tabs", () => {
  it("a stale tab's toggle merges into what another tab stored instead of overwriting it", () => {
    const opts = { storageKey: "k:shared", defaultCollapsed: () => false };
    const stale = renderHook(() => useSectionCollapse(opts));
    // Meanwhile another tab collapsed "x".
    localStorage.setItem("k:shared", JSON.stringify({ c: ["x"], e: [] }));
    act(() => stale.result.current.toggle("y"));
    const stored = JSON.parse(localStorage.getItem("k:shared")!);
    expect(stored.c.sort()).toEqual(["x", "y"]);
  });
});
