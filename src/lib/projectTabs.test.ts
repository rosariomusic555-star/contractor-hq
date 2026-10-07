import { describe, expect, it } from "vitest";
import { projectHref } from "./projectTabs";

describe("projectHref", () => {
  it("leaves the default tab out of the URL", () => {
    expect(projectHref("p1")).toBe("/projects/p1");
    expect(projectHref("p1", "overview")).toBe("/projects/p1");
  });
  it("puts the tab first, then any extra params", () => {
    expect(projectHref("p1", "money")).toBe("/projects/p1?tab=money");
    expect(projectHref("p1", "aftercare", { maintenance: "setup" })).toBe("/projects/p1?tab=aftercare&maintenance=setup");
    expect(projectHref("p1", "change-orders", { "add-new-work": "1" })).toBe("/projects/p1?tab=change-orders&add-new-work=1");
  });
});
