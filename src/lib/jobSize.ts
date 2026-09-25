import type { Project, Quote } from "./api";
import { pickHeadlineQuote, quoteLineTotal } from "./api";

/**
 * "Wayfield · 680 sq ft paver patio" / "Miller · 42 lf retaining wall" — the
 * Bookings rows' work-type/size line: the project's headline quote's single
 * largest line item (quantity + unit + name) — reliable for Quick Quote's
 * one-line-item quotes, noisier on an itemized quote with many granular
 * lines, but present for any quoted job. null → the caller shows just the
 * project title.
 *
 * It used to prefer the opportunity's free-text "measurements" notes; that
 * field is now Site condition notes (0099 — gate widths, slope, soil…),
 * which isn't a job size, so it's no longer read here.
 */
export function jobSizeLabel(project: Project, quotesByProject: Map<string, Quote[]>): string | null {
  const headline = pickHeadlineQuote(quotesByProject.get(project.id) ?? []);
  return headline ? largestLineItemLabel(headline) : null;
}

function largestLineItemLabel(quote: Quote): string | null {
  let bestLabel: string | null = null;
  let bestTotal = -Infinity;
  for (const section of quote.quote_sections) {
    for (const item of section.quote_items) {
      if (!item.quantity || !item.unit?.trim() || !item.name?.trim()) continue;
      const total = quoteLineTotal(item);
      if (total > bestTotal) {
        bestTotal = total;
        bestLabel = `${item.quantity} ${item.unit} ${item.name}`;
      }
    }
  }
  return bestLabel;
}

/**
 * "600 sf Paver Patio · Seat wall" — the redesigned Ongoing Jobs card's scope
 * line. Unlike jobSizeLabel() (which prefers Pipeline opportunity data over
 * the quote), this reads only the project's headline quote, per spec: its
 * single largest line item in full ("qty unit name"), plus a second line
 * item's name only (no qty/unit — keeps the line short) when there is one,
 * so a two-scope job doesn't read as a single flat total.
 */
export function quoteScopeSummary(quote: Quote | undefined): string | null {
  if (!quote) return null;
  const items = quote.quote_sections
    .flatMap((s) => s.quote_items)
    .filter((i) => i.name?.trim())
    .sort((a, b) => quoteLineTotal(b) - quoteLineTotal(a));
  if (items.length === 0) return null;

  const top = items[0];
  const primary = top.quantity && top.unit?.trim() ? `${top.quantity} ${top.unit} ${top.name}` : top.name;
  const second = items[1]?.name?.trim();
  return second && second !== top.name ? `${primary} · ${second}` : primary;
}
