/** A typed money / number field → a number, or null when blank or not a
 * number. Accepts thousands separators and a leading $ ("1,200" → 1200 —
 * `Number("1,200")` is NaN, which saved as $0). */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
