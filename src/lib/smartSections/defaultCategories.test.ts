import { describe, expect, it } from "vitest";
import { SMART_SECTION_TEMPLATES } from "./index";

// The default material category list (0094 + 0162's seven).
const DEFAULT_NAMES = [
  "Pavers", "Wall Block", "Caps", "Base Gravel", "Bedding Sand", "Polymeric Sand", "Edging", "Adhesive", "Fabric",
  "Concrete & Masonry", "Lighting", "Lumber & Hardware", "Irrigation", "Plants & Soil", "Water Feature", "Stone & Gravel", "Other",
];

describe("built-in template line categories (0162)", () => {
  it("every line of every built-in template has a default category from the default list", () => {
    for (const t of SMART_SECTION_TEMPLATES) {
      for (const slot of t.lineItemSlots) {
        expect(DEFAULT_NAMES, `${t.id}.${slot.key}`).toContain(slot.defaultCategory);
      }
    }
  });
});
