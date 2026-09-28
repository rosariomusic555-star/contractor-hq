/** What's wrong with a Quote defaults draft, or null. The deposit feeds every
 * new quote (and quotes have a 0–100 check since 0143), validity sets the
 * "valid until" date. */
export function quoteDefaultsProblem(d: { deposit_pct: number | null; quote_validity_days: number | null }): string | null {
  const dep = d.deposit_pct;
  if (dep == null || !Number.isFinite(dep) || dep < 0 || dep > 100) return "Deposit must be between 0% and 100%.";
  const days = d.quote_validity_days;
  if (days == null || !Number.isInteger(days) || days < 1 || days > 365) return "Quote validity must be a whole number of days, 1 to 365.";
  return null;
}
