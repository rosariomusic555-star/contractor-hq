import type { Opportunity, Project, Quote } from "./api";
import { pickHeadlineQuote, quoteLineTotal } from "./api";

/**
 * "Wayfield · 680 sq ft paver patio" / "Miller · 42 lf retaining wall" — the
 * Ongoing Jobs card's work-type/size line. No structured field for this
 * exists anywhere in the schema, so it's read from whichever real source is
 * available, in order:
 *
 *  1. The Pipeline opportunity this project was won from (project_type +
 *     measurements — only set for jobs that came through Pipeline's
 *     "Create project" flow, see NewProjectView's linkOpportunityId path).
 *  2. The project's headline quote's single largest line item (quantity +
 *     unit + name) — reliable for Quick Quote's one-line-item quotes,
 *     noisier on an itemized quote with many granular lines, but present
 *     for any quoted job regardless of how it was created.
 *  3. null — caller falls back to showing just the project title, per spec.
 */
export function jobSizeLabel(
  project: Project,
  opportunitiesByProjectId: Map<string, Opportunity>,
  quotesByProject: Map<string, Quote[]>,
): string | null {
  const opportunity = opportunitiesByProjectId.get(project.id);
  const fromOpportunity = opportunity
    ? combine(opportunity.measurements, opportunity.project_type)
    : null;
  if (fromOpportunity) return fromOpportunity;

  const headline = pickHeadlineQuote(quotesByProject.get(project.id) ?? []);
  return headline ? largestLineItemLabel(headline) : null;
}

function combine(measurements: string | null, projectType: string | null): string | null {
  const m = measurements?.trim() || null;
  const t = projectType?.trim() || null;
  if (m && t) return `${m} ${t}`;
  return m ?? t;
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
