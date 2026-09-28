/** Measurement entry: numbers typed on a phone, and feet + inches ↔ decimal feet. */

export const parseMeasure = (text: string): number | null => {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return isFinite(v) && v >= 0 ? v : null;
};

/** Decimal feet → whole feet + inches (inches to 2 decimals, never 12). */
export function splitFeet(v: number | null): { ft: string; inch: string } {
  if (v == null) return { ft: "", inch: "" };
  let ft = Math.floor(v + 1e-9);
  let inch = Math.round((v - ft) * 12 * 100) / 100;
  if (inch >= 12) {
    ft += 1;
    inch = 0;
  }
  return { ft: String(ft), inch: inch ? String(inch) : "" };
}

/** ft + in text → decimal feet (null when both are empty). Decimal feet typed
 * into the ft box still work (12.5 ft + 0 in = 12.5). */
export function joinFeet(ft: string, inch: string): number | null {
  const f = parseMeasure(ft);
  const i = parseMeasure(inch);
  if (f == null && i == null) return null;
  return Math.round(((f ?? 0) + (i ?? 0) / 12) * 10000) / 10000;
}

/** A typed dimension for a summary, the way it was entered: 12.5 → "12 ft 6 in",
 * 5 → "5 ft", 0.5 → "6 in" (decimal feet read oddly after a ft + in entry). */
export function fmtFeet(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "";
  const { ft, inch } = splitFeet(v);
  if (!inch) return `${ft} ft`;
  if (ft === "0") return `${inch} in`;
  return `${ft} ft ${inch} in`;
}
