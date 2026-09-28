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
  useNew: boolean;
  order: CardId[];
  hidden: CardId[];
  hideHeadline: boolean;
}

export const DEFAULT_PREFS: DashboardPrefs = {
  useNew: false,
  order: CARDS.map((c) => c.id),
  hidden: CARDS.filter((c) => c.hiddenByDefault).map((c) => c.id),
  hideHeadline: false,
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
    return { ...DEFAULT_PREFS, ...p, order, hidden: (p.hidden ?? DEFAULT_PREFS.hidden).filter((id) => known.has(id)) };
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
  const reset = useCallback(() => update({ order: DEFAULT_PREFS.order, hidden: DEFAULT_PREFS.hidden, hideHeadline: false }), [update]);
  return { prefs, update, reset };
}
