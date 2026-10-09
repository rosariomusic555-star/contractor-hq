/**
 * A business name without its legal suffix, for greeting someone by it:
 * "CleanGarden Landscaping LLC" → "CleanGarden Landscaping". Strips one or
 * more trailing LLC / L.L.C. / Inc / Inc. / Co / Co. / Corp / Corp. / Ltd /
 * Ltd. (any case, after a space or comma) and trailing punctuation. Never
 * returns "" for a non-empty name made only of a suffix.
 */
const SUFFIX = /[\s,]+(l\.?\s?l\.?\s?c\.?|inc\.?|co\.?|corp\.?|ltd\.?)$/i;
const TRAILING_PUNCT = /[\s,.;:–—-]+$/;

export function stripLegalSuffix(name: string): string {
  let out = name.trim();
  for (;;) {
    const next = out.replace(SUFFIX, "").replace(TRAILING_PUNCT, "");
    if (next === out || !next) break;
    out = next;
  }
  return out.replace(TRAILING_PUNCT, "") || name.trim();
}
