import type { SmartSectionSettings, SmartSectionLineItemSetting } from "@/lib/api";
import { paverPatioTemplate } from "./paverPatio";
import { outdoorKitchenTemplate } from "./outdoorKitchen";
import { seatingWallTemplate } from "./seatingWall";
import { firePitTemplate } from "./firePit";
import { outdoorLightingTemplate } from "./outdoorLighting";
import type { SmartSectionTemplate } from "./types";

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
  outdoorLightingTemplate,
];

export const findSmartSectionTemplate = (id: string | null): SmartSectionTemplate | null =>
  SMART_SECTION_TEMPLATES.find((t) => t.id === id) ?? null;

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
  settings?.line_items ?? template.lineItemSlots.map((s) => ({ slot_key: s.key, name: s.defaultName }));

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

export * from "./types";
