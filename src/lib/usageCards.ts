import type { MaterialsUsageLog } from "@/lib/api";
import { localYmd } from "@/lib/appointmentTime";

/**
 * Materials tab "tracking cards" — the − / + step per unit. One map, so a
 * unit's step is changed in one place. Units are matched case-insensitively
 * and singular ("tons" → ton); anything not listed steps by 1.
 */
export const USAGE_STEP_BY_UNIT: Record<string, number> = {
  ton: 0.5,
  "cu yd": 0.5,
  bag: 1,
  piece: 1,
  "sq ft": 10,
  ft: 10,
  roll: 1,
  pallet: 1,
};

const normalizeUnit = (unit: string | null | undefined) => {
  const u = (unit ?? "").trim().toLowerCase();
  return USAGE_STEP_BY_UNIT[u] != null ? u : u.replace(/s$/, "");
};

export function usageStep(unit: string | null | undefined): number {
  return USAGE_STEP_BY_UNIT[normalizeUnit(unit)] ?? 1;
}

/** Units that read the same for any amount ("10 sq ft", "1 ft"). */
const INVARIANT = new Set(["sq ft", "ft", "cu yd", "lf", "sf", "sy"]);

/** "ton" → "tons" for any amount but 1; "sq ft" stays; no unit → "units". */
export function unitWord(unit: string | null | undefined, n: number): string {
  const u = (unit ?? "").trim();
  if (!u) return n === 1 ? "unit" : "units";
  if (INVARIANT.has(u.toLowerCase()) || n === 1 || /s$/i.test(u)) return u;
  return `${u}s`;
}

/** Round to the step's precision and never below 0 (float-safe steps). */
export function clampQty(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** A usage entry's local calendar day. Date-only values ("2026-10-06")
 *  are already local days; timestamps are converted to local time. */
export function usageDay(loggedAt: string): string {
  return loggedAt.length <= 10 ? loggedAt : localYmd(new Date(loggedAt));
}

export interface UsageDayBar {
  day: string;
  quantity: number;
  entries: MaterialsUsageLog[];
}

/** One bar per day with usage for this line, oldest → newest, the most
 *  recent `limit` days. */
export function usageDayBars(logs: MaterialsUsageLog[], lineId: string, limit = 14): UsageDayBar[] {
  const byDay = new Map<string, MaterialsUsageLog[]>();
  for (const l of logs) {
    if (l.materials_item_id !== lineId) continue;
    const d = usageDay(l.logged_at);
    byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([day, entries]) => ({
      day,
      entries: [...entries].sort((a, b) => a.logged_at.localeCompare(b.logged_at)),
      quantity: clampQty(entries.reduce((s, e) => s + Number(e.quantity), 0)),
    }));
}
