import { describe, expect, it } from "vitest";
import {
  attachmentChangeLines,
  attachmentFileError,
  defaultAttachmentTitle,
  groupAttachments,
  guessCategory,
  isJobToday,
  newAttachmentIds,
  offlineAttachments,
} from "./workOrderAttachments";
import type { CrewAttachment } from "./crewSafe";

const att = (id: string, over: Partial<CrewAttachment> = {}): CrewAttachment => ({
  id, feature_id: null, title: id, note: null, category: "other", pinned: false, sort_order: 0, storage_path: `work-order/p/${id}.jpg`,
  mime_type: "image/jpeg", size_bytes: 1, width: 10, height: 10, page_count: null, version: 1, marked_up_from: null,
  added_by_crew: false, added_by_name: null, updated_at: "x", ...over,
});

describe("file checks", () => {
  it("accepts photos, HEIC and PDFs up to 25 MB, and names the file otherwise", () => {
    expect(attachmentFileError({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(attachmentFileError({ name: "IMG_1.HEIC", type: "", size: 1000 })).toBeNull();
    expect(attachmentFileError({ name: "plan.pdf", type: "application/pdf", size: 25 * 1024 * 1024 })).toBeNull();
    expect(attachmentFileError({ name: "plan.pdf", type: "application/pdf", size: 26 * 1024 * 1024 })).toMatch(/"plan\.pdf" is 26\.0 MB — the limit is 25 MB/);
    expect(attachmentFileError({ name: "bid.xlsx", type: "application/vnd.ms-excel", size: 10 })).toMatch(/isn't a supported file/);
  });

  it("titles and categories from the filename", () => {
    expect(defaultAttachmentTitle("patio_layout-v2.pdf")).toBe("Patio layout v2");
    expect(defaultAttachmentTitle("IMG_4411.HEIC")).toBe("Photo");
    expect(guessCategory("Site Plan.pdf", "application/pdf")).toBe("site_plan");
    expect(guessCategory("HOA approval.pdf", "application/pdf")).toBe("permit_hoa");
    expect(guessCategory("Blu 60 spec sheet.pdf", "application/pdf")).toBe("spec_sheet");
    expect(guessCategory("patio layout.png", "image/png")).toBe("layout");
    expect(guessCategory("IMG_1.jpg", "image/jpeg")).toBe("photo");
  });
});

describe("where attachments show", () => {
  it("pinned first (once), feature files in their block, orphans project-wide", () => {
    const g = groupAttachments(
      [att("f-pinned", { feature_id: "f1", pinned: true, sort_order: 3 }), att("gen", { sort_order: 1 }), att("f1a", { feature_id: "f1", sort_order: 2 }), att("gone", { feature_id: "old" })],
      ["f1"],
    );
    expect(g.pinned.map((a) => a.id)).toEqual(["f-pinned"]);
    expect(g.general.map((a) => a.id)).toEqual(["gone", "gen"]);
    expect(g.byFeature.get("f1")!.map((a) => a.id)).toEqual(["f1a"]);
    expect(g.all).toHaveLength(4);
  });
});

describe("new since last opened", () => {
  it("flags added and replaced files, and lists removals", () => {
    const prev = { attachments: [att("a"), att("b"), att("c")] };
    const next = { attachments: [att("a"), att("b", { version: 2, title: "Plan" }), att("d", { title: "Sketch" })] };
    expect([...newAttachmentIds(prev, next)].sort()).toEqual(["b", "d"]);
    expect(attachmentChangeLines(prev, next)).toEqual(["Updated attachment: Plan", "New attachment: Sketch", "Removed attachment: c"]);
    expect(newAttachmentIds(null, next).size).toBe(0);
  });
});

describe("offline", () => {
  const project = { scheduled_start_date: "2026-10-05", scheduled_end_date: "2026-10-09", status: "scheduled" };
  it("keeps every file on a job day, pinned ones otherwise", () => {
    const attachments = [att("pin", { pinned: true }), att("other")];
    expect(isJobToday(project, "2026-10-07")).toBe(true);
    expect(offlineAttachments({ attachments, project: project as never }, "2026-10-07")).toHaveLength(2);
    expect(offlineAttachments({ attachments, project: project as never }, "2026-10-01").map((a) => a.id)).toEqual(["pin"]);
    expect(isJobToday({ ...project, status: "in_progress" }, "2026-11-01")).toBe(true);
  });
});
