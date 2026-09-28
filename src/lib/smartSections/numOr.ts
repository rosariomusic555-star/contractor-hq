/** A calculator input or setting: the default only when it's blank /
 * not a number — a typed 0 stays 0 (0" bedding sand, no soil amendment).
 * (`Number(x) || default` turned every 0 back into the default.) Divisors
 * like coverage or spacing still use `|| default`: 0 there would divide by zero. */
export function numOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
