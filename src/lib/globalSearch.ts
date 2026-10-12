import { navItems } from "@/components/layout/navItems";
import { SETTINGS_GROUPS } from "@/components/views/settingsLinks";
import { projectHref } from "@/lib/projectTabs";

/**
 * Global search (sidebar box / ⌘K) — the pure parts: phone / page matching,
 * links for a result, highlight segments and the "Recent" list. The records
 * themselves come from the global_search() SQL function (0171).
 */

export type SearchType = "client" | "project" | "opportunity" | "quote" | "invoice" | "change_order";

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  href_params: { id: string; project_id?: string | null };
  updated_at: string | null;
  /** All matches of this type (the rows are capped per type). */
  total: number;
}

/** Group order in the dialog. */
export const SEARCH_GROUPS: { type: SearchType; label: string; listPath: string | null }[] = [
  { type: "client", label: "Clients", listPath: "/clients" },
  { type: "project", label: "Projects", listPath: "/projects" },
  { type: "opportunity", label: "Opportunities", listPath: "/opportunities" },
  { type: "quote", label: "Quotes", listPath: "/quotes" },
  { type: "invoice", label: "Invoices", listPath: "/invoices" },
  // No app-wide change-order list to send "See all" to.
  { type: "change_order", label: "Change orders", listPath: null },
];

export const MIN_QUERY = 2;

/** Digits only — "(555) 123-4567" → "5551234567". Same rule as the SQL. */
export function phoneDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Whether a phone number matches what was typed, ignoring formatting.
 *  Needs at least 3 digits typed (fewer would match almost anything). */
export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  const q = phoneDigits(query);
  return q.length >= 3 && phoneDigits(phone).includes(q);
}

export interface PageMatch {
  label: string;
  to: string;
  /** "Settings" for a settings page; undefined for a main page. */
  section?: string;
}

/** Sidebar pages + Settings pages whose label contains the query (case-
 *  insensitive), labels that start with it first. */
export function matchPages(query: string, limit = 5): PageMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  const pages: PageMatch[] = [
    ...navItems.map((n) => ({ label: n.label, to: n.to })),
    ...SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => ({ label: i.label, to: i.to, section: "Settings" }))),
  ];
  const seen = new Set<string>();
  return pages
    .filter((p) => p.label.toLowerCase().includes(q) && !seen.has(p.to) && seen.add(p.to))
    .map((p, n) => ({ p, n, starts: p.label.toLowerCase().startsWith(q) || p.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) }))
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.n - b.n)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Where a result opens. */
export function resultHref(r: Pick<SearchResult, "type" | "href_params">): string {
  const { id, project_id } = r.href_params;
  switch (r.type) {
    case "client":
      return `/clients/${id}`;
    case "project":
      return projectHref(id);
    case "opportunity":
      return `/pipeline/${id}`;
    case "quote":
      return `/quotes/${id}`;
    case "invoice":
      return `/invoices/${id}`;
    case "change_order":
      return project_id ? projectHref(project_id, "change-orders") : "/projects";
  }
}

/** Splits text into plain / matched parts for highlighting (first match,
 *  case-insensitive). */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, i), match: false },
    { text: text.slice(i, i + q.length), match: true },
    { text: text.slice(i + q.length), match: false },
  ].filter((p) => p.text);
}

// ---------------------------------------------------------------------------
// Recent — the last records opened from search, in this browser.
// ---------------------------------------------------------------------------

export interface RecentItem {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const RECENT_MAX = 5;
const recentKey = (uid: string) => `chq-search-recent:${uid}`;

export function readRecent(uid: string): RecentItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(recentKey(uid)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.href === "string" && typeof r.title === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(uid: string, item: RecentItem): RecentItem[] {
  const next = [item, ...readRecent(uid).filter((r) => !(r.type === item.type && r.id === item.id))].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(recentKey(uid), JSON.stringify(next));
  } catch {
    // storage blocked — Recent just won't persist
  }
  return next;
}
