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

export * from "./types";
