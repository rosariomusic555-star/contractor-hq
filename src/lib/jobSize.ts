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
