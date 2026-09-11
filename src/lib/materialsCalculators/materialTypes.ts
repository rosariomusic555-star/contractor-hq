export interface MaterialTypeOption {
  value: string;
  label: string;
}

/**
 * Canonical list of material_type values the Smart Calculator understands.
 * A Price Book item's material_type column (migration 0034) is free text,
 * not a DB-constrained enum, specifically so this list can grow every time
 * a new build-type calculator is added (see ./index.ts) without a
 * migration — this file is the single source of truth for what's
 * currently supported.
 */
export const MATERIAL_TYPES: MaterialTypeOption[] = [
  { value: "paver", label: "Paver" },
  { value: "base_aggregate", label: "Base aggregate" },
  { value: "bedding_sand", label: "Bedding sand" },
  { value: "polymeric_sand", label: "Polymeric sand" },
  { value: "edge_restraint", label: "Edge restraint" },
];

export const materialTypeLabel = (value: string | null): string =>
  MATERIAL_TYPES.find((t) => t.value === value)?.label ?? value ?? "—";
