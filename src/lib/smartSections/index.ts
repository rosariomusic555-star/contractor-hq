import type { SmartSectionSettings, SmartSectionLineItemSetting } from "@/lib/api";
import { paverPatioTemplate } from "./paverPatio";
import { outdoorKitchenTemplate } from "./outdoorKitchen";
import { seatingWallTemplate } from "./seatingWall";
import { firePitTemplate } from "./firePit";
import { fireplaceTemplate } from "./fireplace";
import { outdoorLightingTemplate } from "./outdoorLighting";
import { irrigationTemplate, pergolaTemplate, plantsTemplate, sodTemplate, waterFeatureTemplate } from "./landscape";
import type { SmartSectionTemplate } from "./types";
import { DEFAULT_SLOT_CATEGORIES } from "./defaultCategories";
import { categoryIdOfBuildType, getTypeConfig, getTypeConfigLabel, isConfigBuildType, smartTemplateFromConfig } from "../typeConfig";

/**
 * Registry of Smart Section build types. Adding a 6th means writing one
 * new module like paverPatio.ts and adding it here — no changes needed to
 * the Materials Sheet, the picker, or the calculator dialog.
 */
export const SMART_SECTION_TEMPLATES: SmartSectionTemplate[] = [
  paverPatioTemplate,
  outdoorKitchenTemplate,
  seatingWallTemplate,
  firePitTemplate,
  fireplaceTemplate,
  outdoorLightingTemplate,
  pergolaTemplate,
  waterFeatureTemplate,
  sodTemplate,
  irrigationTemplate,
  plantsTemplate,
].map((t) => ({
  ...t,
  // Every built-in line's default material category (0162).
  lineItemSlots: t.lineItemSlots.map((slot) => ({ ...slot, defaultCategory: DEFAULT_SLOT_CATEGORIES[t.id]?.[slot.key] })),
}));

/** A built-in template, or a custom project type's setup (0159, id
 * "cfg:<category id>") built into the same shape. */
export const findSmartSectionTemplate = (id: string | null): SmartSectionTemplate | null => {
  if (isConfigBuildType(id)) {
    const categoryId = categoryIdOfBuildType(id);
    const config = getTypeConfig(categoryId);
    return config ? smartTemplateFromConfig(config, getTypeConfigLabel(categoryId)) : null;
  }
  return SMART_SECTION_TEMPLATES.find((t) => t.id === id) ?? null;
};

export const findSmartSectionSettings = (
  settings: SmartSectionSettings[],
  buildType: string,
): SmartSectionSettings | null => settings.find((s) => s.build_type === buildType) ?? null;

/** Step 1 — a build type's effective line items for this contractor: their
 * stored customization if present, else the template's shipped defaults. */
export const resolveEffectiveLineItems = (
  template: SmartSectionTemplate,
  settings: SmartSectionSettings | null,
): SmartSectionLineItemSetting[] =>
  settings?.line_items ??
  template.lineItemSlots.map((s) => {
    const cost_type = template.slotCostTypes?.[s.key];
    return cost_type ? { slot_key: s.key, name: s.defaultName, cost_type } : { slot_key: s.key, name: s.defaultName };
  });

/** The lines a NEW section starts with: the effective line items minus the
 * add-on slots (backsplash, backrest caps, strip lighting) — those are added
 * by the calculator only when measured, so a kitchen without a backsplash
 * never gets an empty Backsplash line. */
export const startingLineItems = (
  template: SmartSectionTemplate,
  settings: SmartSectionSettings | null,
): SmartSectionLineItemSetting[] => {
  const addOns = new Set(template.lineItemSlots.filter((s) => s.addOn).map((s) => s.key));
  return resolveEffectiveLineItems(template, settings).filter((li) => !li.slot_key || !addOns.has(li.slot_key));
};

/** Step 2 — one tunable's effective value for this contractor: their
 * stored override if present, else the template's shipped default. */
export const resolveTunableValue = (
  template: SmartSectionTemplate,
  settings: SmartSectionSettings | null,
  key: string,
): number => {
  const override = settings?.tunables?.[key];
  if (override !== undefined) return override;
  return template.tunables.find((t) => t.key === key)?.defaultValue ?? 0;
};

/** A template line's material category for this contractor (0162): their
 * choice in the template editor (null = Uncategorized on purpose), else the
 * template's default — a custom type's chosen id, or a built-in's category
 * name matched to theirs. A category that no longer exists → null, and the
 * line asks to "Choose category". Non-material lines have none. */
export function resolveLineCategoryId(
  template: SmartSectionTemplate,
  line: Pick<SmartSectionLineItemSetting, "slot_key" | "cost_type" | "material_category_id">,
  categories: { id: string; name: string }[],
): string | null {
  if (line.cost_type && line.cost_type !== "material") return null;
  const exists = (id: string | null | undefined) => (id && categories.some((c) => c.id === id) ? id : null);
  if (line.material_category_id !== undefined) return exists(line.material_category_id);
  const slot = template.lineItemSlots.find((s) => s.key === line.slot_key);
  if (!slot) return null;
  if (slot.defaultCategoryId !== undefined) return exists(slot.defaultCategoryId);
  const name = slot.defaultCategory?.trim().toLowerCase();
  return name ? (categories.find((c) => c.name.trim().toLowerCase() === name)?.id ?? null) : null;
}

/** A template line's chosen category was deleted (it asks to "Choose category"). */
export function lineCategoryMissing(
  template: SmartSectionTemplate,
  line: Pick<SmartSectionLineItemSetting, "slot_key" | "cost_type" | "material_category_id">,
  categories: { id: string; name: string }[],
): boolean {
  if (line.cost_type && line.cost_type !== "material") return false;
  const chosen = line.material_category_id !== undefined
    ? line.material_category_id
    : template.lineItemSlots.find((s) => s.key === line.slot_key)?.defaultCategoryId;
  return !!chosen && !categories.some((c) => c.id === chosen);
}

/** A template line's default description (0162): the contractor's, else
 * the template's (custom types), else none. */
export function resolveLineDescription(
  template: SmartSectionTemplate,
  line: Pick<SmartSectionLineItemSetting, "slot_key" | "description">,
): string | null {
  if (line.description !== undefined) return line.description?.trim() || null;
  return template.lineItemSlots.find((s) => s.key === line.slot_key)?.defaultDescription?.trim() || null;
}

/** The lines a new section starts with, ready to insert: name, cost type,
 * category and description from the template (0162). */
export function templateStartingLines(
  template: SmartSectionTemplate,
  settings: SmartSectionSettings | null,
  categories: { id: string; name: string }[],
) {
  return startingLineItems(template, settings).map((li) => ({
    name: li.name,
    cost_type: li.cost_type ?? ("material" as const),
    material_category_id: resolveLineCategoryId(template, li, categories),
    internal_description: resolveLineDescription(template, li),
  }));
}

export * from "./types";
