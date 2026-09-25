import type { MaterialOrderUnit } from "./api";

const UNIT_MAP: Record<string, MaterialOrderUnit> = {
  pallet: "pallet",
  pallets: "pallet",
  plt: "pallet",
  pal: "pallet",
  ton: "ton",
  tons: "ton",
  tn: "ton",
  t: "ton",
  yd: "cubic_yard",
  yds: "cubic_yard",
  yard: "cubic_yard",
  yards: "cubic_yard",
  cy: "cubic_yard",
  yd3: "cubic_yard",
  "cu yd": "cubic_yard",
  "cubic yard": "cubic_yard",
  "cubic yards": "cubic_yard",
  bag: "bag",
  bags: "bag",
  bg: "bag",
  lf: "linear_foot",
  "lin ft": "linear_foot",
  "linear ft": "linear_foot",
  "linear foot": "linear_foot",
  "linear feet": "linear_foot",
  ea: "each",
  each: "each",
  pc: "each",
  pcs: "each",
  piece: "each",
  pieces: "each",
};

/**
 * A receipt's printed unit → the delivery form's fixed unit list. Anything
 * it can't place (sq ft, gal, box…) becomes "each" and the printed unit is
 * returned as `note` so the caller keeps it in the line's description —
 * nothing read off the receipt is dropped.
 */
export function mapReceiptUnit(unit: string | null | undefined): { unit: MaterialOrderUnit; note: string | null } {
  const raw = (unit ?? "").trim();
  if (!raw) return { unit: "each", note: null };
  const mapped = UNIT_MAP[raw.toLowerCase().replace(/\.$/, "")];
  return mapped ? { unit: mapped, note: null } : { unit: "each", note: raw };
}
