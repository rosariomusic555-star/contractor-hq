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

/** Business profile numbers: a negative labor rate would cost labor below $0,
 * the over-order margin is a %, the alert is whole days. */
export function businessProfileProblem(d: {
  default_labor_rate?: number | null;
  material_over_order_margin_pct?: number | null;
  material_not_ordered_alert_days?: number | null;
}): string | null {
  const rate = d.default_labor_rate;
  if (rate != null && (!Number.isFinite(rate) || rate < 0)) return "Default labor rate can't be negative.";
  const margin = d.material_over_order_margin_pct;
  if (margin != null && (!Number.isFinite(margin) || margin < 0 || margin > 100)) return "Over-order margin must be between 0% and 100%.";
  const days = d.material_not_ordered_alert_days;
  if (days != null && (!Number.isInteger(days) || days < 0 || days > 365)) return "Alert days must be a whole number, 0 to 365.";
  return null;
}
