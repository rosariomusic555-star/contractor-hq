import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

/**
 * New Dashboard preferences — per user, in this browser (no new tables:
 * the refresh was scoped to layout only). Which dashboard, and each card's
 * visibility + order. Storage can be blocked (private mode) — every read /
 * write is guarded and the defaults always work.
 */

export type CardId =
  | "today"
  | "needs"
  | "starting"
  | "activity"
  | "thisweek"
  | "weather"
  | "ongoing"
  | "pipeline"
  | "crew"
  | "money"
  | "pastclients"
  | "insights"
  | "recent-activity"
  | "recent-quotes"
  | "recent-invoices";

export const CARDS: { id: CardId; label: string; column: "left" | "right"; hiddenByDefault?: boolean }[] = [
  { id: "today", label: "Today", column: "left" },
  { id: "needs", label: "Needs you", column: "right" },
  { id: "starting", label: "Starting soon", column: "left" },
  { id: "activity", label: "Client activity", column: "right" },
  { id: "thisweek", label: "This week", column: "left" },
  { id: "weather", label: "Weather risks", column: "right" },
  { id: "ongoing", label: "Ongoing jobs", column: "left" },
  { id: "pipeline", label: "Pipeline", column: "right" },
  { id: "crew", label: "Crew & time", column: "right" },
  { id: "money", label: "Money", column: "left" },
  { id: "pastclients", label: "Past clients", column: "left" },
  { id: "insights", label: "Insights", column: "right" },
  { id: "recent-activity", label: "Recent activity", column: "left", hiddenByDefault: true },
  { id: "recent-quotes", label: "Recent quotes", column: "right", hiddenByDefault: true },
  { id: "recent-invoices", label: "Recent invoices", column: "right", hiddenByDefault: true },
];

export interface DashboardPrefs {
  order: CardId[];
  hidden: CardId[];
  hideHeadline: boolean;
  /** The slate banner header (greeting, status, actions, headline tiles)
   *  instead of the plain greeting + action row — while it's compared. */
  bannerHeader: boolean;
  /** "simple": the simplified layout (banner + Schedule / Ongoing projects /
   *  Needs your attention / Pipeline / Recent activity) — while it's
   *  compared with the classic card grid. */
  layout: "classic" | "simple";
  /** Simplified layout: optional cards the user turned on (Customize). */
  simpleExtras: SimpleExtraId[];
  /** 2 = optional cards split Money / Bookings / Revenue overview and
   *  dropped Insights (older saved prefs are migrated in read()). */
  simpleExtrasV?: number;
}

export type SimpleExtraId = "starting" | "activity" | "bookings" | "revenue" | "weather" | "crew" | "money" | "pastclients";

/** The simplified layout's optional cards (all off by default) and their
 *  home column: left (wide) after Ongoing projects, right (narrow) after
 *  Pipeline. Everything else is merged into its five main sections. */
export const SIMPLE_EXTRAS: { id: SimpleExtraId; label: string; column: "left" | "right" }[] = [
  { id: "starting", label: "Starting soon", column: "left" },
  { id: "activity", label: "Client activity", column: "left" },
  { id: "bookings", label: "Bookings", column: "left" },
  { id: "revenue", label: "Revenue overview", column: "left" },
  { id: "weather", label: "Weather risks", column: "right" },
  { id: "crew", label: "Crew & time", column: "right" },
  { id: "money", label: "Money", column: "right" },
  { id: "pastclients", label: "Past clients", column: "right" },
];

export const DEFAULT_PREFS: DashboardPrefs = {
  order: CARDS.map((c) => c.id),
  hidden: CARDS.filter((c) => c.hiddenByDefault).map((c) => c.id),
  hideHeadline: false,
  bannerHeader: false,
  layout: "classic",
  simpleExtras: [],
  simpleExtrasV: 2,
};

function read(key: string): DashboardPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<DashboardPrefs>;
    const known = new Set(CARDS.map((c) => c.id));
    const order = (p.order ?? []).filter((id) => known.has(id));
    // Cards added after the prefs were saved go at the end.
    for (const c of CARDS) if (!order.includes(c.id)) order.push(c.id);
    // Optional cards (v2): "Money" used to also show Bookings + Revenue
    // overview, so keep those on for anyone who had Money on; Insights is gone.
    const knownExtras = new Set<string>(SIMPLE_EXTRAS.map((x) => x.id));
    let simpleExtras = (p.simpleExtras ?? []) as string[];
    if ((p.simpleExtrasV ?? 1) < 2 && simpleExtras.includes("money")) simpleExtras = [...simpleExtras, "bookings", "revenue"];
    return {
      ...DEFAULT_PREFS,
      ...p,
      order,
      hidden: (p.hidden ?? DEFAULT_PREFS.hidden).filter((id) => known.has(id)),
      simpleExtras: [...new Set(simpleExtras)].filter((id): id is SimpleExtraId => knownExtras.has(id)),
      simpleExtrasV: 2,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useDashboardPrefs() {
  const { session } = useAuth();
  const key = `chq-dashboard-prefs:${session?.user?.id ?? "anon"}`;
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => read(key));
  useEffect(() => setPrefs(read(key)), [key]);
  const update = useCallback(
    (patch: Partial<DashboardPrefs>) =>
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // storage blocked — keeps working for this visit
        }
        return next;
      }),
    [key],
  );
  const reset = useCallback(
    () => update({ order: DEFAULT_PREFS.order, hidden: DEFAULT_PREFS.hidden, hideHeadline: false, simpleExtras: [] }),
    [update],
  );
  return { prefs, update, reset };
}
