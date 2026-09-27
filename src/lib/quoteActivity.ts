import type { NotificationSettings, Quote, QuoteActivityEvent, QuoteViewSession } from "./api";

/**
 * Quote activity (0117) — how a client is engaging with a quote. Pure
 * helpers for the activity line, list badges, pipeline cards and the
 * "going cold" flag. Internal only.
 */

export type DeviceType = "mobile" | "tablet" | "desktop";

/** Coarse device type from the browser's own UA — no fingerprinting. */
export function deviceType(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): DeviceType {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

export function timeAgoShort(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

type ActivityQuote = Pick<Quote, "status" | "sent_at" | "view_count" | "first_viewed_at" | "last_viewed_at" | "last_view_device" | "selections_changed_at">;

/** "Viewed 3 times · last opened 20 min ago · on mobile" / "Not opened yet · sent 2 days ago". */
export function activityLine(q: ActivityQuote, now: Date = new Date()): string | null {
  if (!q.sent_at && !q.view_count) return null;
  const n = q.view_count ?? 0;
  if (n === 0) return `Not opened yet${q.sent_at ? ` · sent ${timeAgoShort(q.sent_at, now)}` : ""}`;
  return [
    n === 1 ? "Viewed once" : `Viewed ${n} times`,
    `last opened ${timeAgoShort(q.last_viewed_at, now)}`,
    q.last_view_device ? `on ${q.last_view_device}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type ActivityBadge = { label: string; tone: "grey" | "blue" | "green" | "amber" };

/** Not opened / Viewed / Viewed 3× / Selections changed — for lists. */
export function activityBadge(q: ActivityQuote): ActivityBadge | null {
  if (q.status !== "sent") return null;
  const n = q.view_count ?? 0;
  if (q.selections_changed_at) return { label: "Selections changed", tone: "green" };
  if (n === 0) return { label: "Not opened", tone: "grey" };
  return { label: n === 1 ? "Viewed" : `Viewed ${n}×`, tone: "blue" };
}

export type ColdState = { kind: "unopened" | "unsigned"; days: number } | null;

/** Sent but not opened after X days, or opened but not signed after Y days. */
export function coldState(q: ActivityQuote, s: Pick<NotificationSettings, "cold_unopened_days" | "cold_unsigned_days">, now: Date = new Date()): ColdState {
  if (q.status !== "sent") return null;
  const days = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  if (!(q.view_count ?? 0) && q.sent_at && days(q.sent_at) >= s.cold_unopened_days) return { kind: "unopened", days: Math.floor(days(q.sent_at)) };
  if ((q.view_count ?? 0) > 0 && q.first_viewed_at && days(q.first_viewed_at) >= s.cold_unsigned_days) return { kind: "unsigned", days: Math.floor(days(q.first_viewed_at)) };
  return null;
}

export const coldLabel = (c: NonNullable<ColdState>) =>
  c.kind === "unopened" ? `Going cold · not opened in ${c.days} days` : `Going cold · viewed, not signed in ${c.days} days`;

export function durationText(seconds: number): string {
  if (seconds < 60) return `${Math.max(seconds, 0)}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Sessions + events grouped by the quote version they were on, latest version first. */
export function activityByVersion(sessions: QuoteViewSession[], events: QuoteActivityEvent[]) {
  const versions = new Map<number, { sessions: QuoteViewSession[]; events: QuoteActivityEvent[] }>();
  const key = (v: number | null) => v ?? 0;
  for (const s of sessions) {
    const g = versions.get(key(s.version)) ?? { sessions: [], events: [] };
    g.sessions.push(s);
    versions.set(key(s.version), g);
  }
  for (const e of events) {
    const g = versions.get(key(e.version)) ?? { sessions: [], events: [] };
    g.events.push(e);
    versions.set(key(e.version), g);
  }
  return [...versions.entries()].sort((a, b) => b[0] - a[0]).map(([version, g]) => ({ version, ...g }));
}
