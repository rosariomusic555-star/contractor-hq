/**
 * The project page's tabs (?tab=…). "overview" is the default and has no
 * param. Links that should land on a particular part of a project use
 * projectHref().
 */
export const PROJECT_TABS = ["overview", "estimate", "schedule", "materials", "money", "updates", "hub", "aftercare", "activity"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

/** `/projects/<id>?tab=<tab>` (+ any extra params, e.g. maintenance=setup). */
export function projectHref(projectId: string, tab?: ProjectTab | null, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (tab && tab !== "overview") p.set("tab", tab);
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  const qs = p.toString();
  return qs ? `/projects/${projectId}?${qs}` : `/projects/${projectId}`;
}
