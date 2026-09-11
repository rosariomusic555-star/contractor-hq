import type { BuildTypeDefinition } from "./types";
import { paverPatioBuildType } from "./paverPatio";

/**
 * Registry of Smart Calculator build types. Adding a new one (Retaining
 * Wall, Seating Wall, Outdoor Kitchen, Fire Pit, …) means writing one new
 * module like paverPatio.ts and adding it here — no changes needed to the
 * Materials Sheet, the save logic, or the Price Book.
 */
export const BUILD_TYPES: BuildTypeDefinition[] = [paverPatioBuildType];

export * from "./types";
export * from "./materialTypes";
