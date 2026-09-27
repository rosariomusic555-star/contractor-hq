/* =============================================================================
 * Progress updates (0126) — pure helpers: milestone presets per build type
 * (defaults + the contractor's overrides), the per-feature milestone
 * tracker, the Hub feed (progress + schedule updates, newest first), and
 * when to prompt "Let the client know".
 * ========================================================================== */

import { buildTypeForCategoryName } from "@/lib/measurements";

export const DEFAULT_MILESTONES: Record<string, string[]> = {
  paver_patio: ["Excavation done", "Base installed & compacted", "Pavers laid", "Sand & seal done", "Cleanup complete"],
  walkway: ["Excavation done", "Base installed & compacted", "Pavers laid", "Sand & seal done", "Cleanup complete"],
  driveway: ["Excavation done", "Base installed & compacted", "Pavers laid", "Sand & seal done", "Cleanup complete"],
  seating_wall: ["Excavation done", "Base installed", "Walls built", "Caps installed", "Cleanup complete"],
  retaining_wall: ["Excavation done", "Base & drainage installed", "Walls built", "Caps installed", "Cleanup complete"],
  outdoor_kitchen: ["Base installed", "Structure built", "Counters installed", "Appliances in", "Cleanup complete"],
  fire_pit: ["Base installed", "Fire pit built", "Cleanup complete"],
  outdoor_lighting: ["Wiring run", "Fixtures installed", "Tested & timer set"],
  steps: ["Excavation done", "Base installed", "Steps built", "Cleanup complete"],
};
export const GENERIC_MILESTONES = ["Work started", "Main work done", "Cleanup complete"];

export const MILESTONE_BUILD_TYPES: { key: string; label: string }[] = [
  { key: "paver_patio", label: "Paver Patio" },
  { key: "walkway", label: "Walkway" },
  { key: "driveway", label: "Driveway" },
  { key: "seating_wall", label: "Seating Wall" },
  { key: "retaining_wall", label: "Retaining Wall" },
  { key: "outdoor_kitchen", label: "Outdoor Kitchen" },
  { key: "fire_pit", label: "Fire Pit" },
  { key: "outdoor_lighting", label: "Outdoor Lighting" },
  { key: "steps", label: "Steps" },
];

/** The milestone list for a feature — the contractor's override, else the default. */
export function milestonesFor(categoryName: string | null | undefined, overrides: Record<string, string[]> = {}): string[] {
  const bt = categoryName ? (buildTypeForCategoryName(categoryName)?.id ?? null) : null;
  if (bt && overrides[bt]?.length) return overrides[bt];
  return (bt && DEFAULT_MILESTONES[bt]) || GENERIC_MILESTONES;
}

export interface TrackerFeature {
  id: string;
  label: string;
  category: string | null;
}

export interface MilestoneTracker {
  featureId: string;
  label: string;
  steps: { label: string; done: boolean }[];
  latest: string | null;
  next: string | null;
}

/** Per feature: which preset milestones have been posted (shared), the
 * latest one, and what's next. Features with nothing posted yet are left out. */
export function milestoneTrackers(
  features: TrackerFeature[],
  updates: { feature_id: string | null; milestone: string | null; date: string }[],
  overrides: Record<string, string[]> = {},
): MilestoneTracker[] {
  const out: MilestoneTracker[] = [];
  for (const f of features) {
    const posted = updates.filter((u) => u.feature_id === f.id && u.milestone).sort((a, b) => a.date.localeCompare(b.date));
    if (posted.length === 0) continue;
    const presets = milestonesFor(f.category, overrides);
    const done = new Set(posted.map((u) => u.milestone as string));
    const extra = [...done].filter((m) => !presets.includes(m));
    const steps = [...presets, ...extra].map((label) => ({ label, done: done.has(label) }));
    const latest = posted[posted.length - 1].milestone;
    const latestIdx = steps.findIndex((s) => s.label === latest);
    const next = steps.slice(latestIdx + 1).find((s) => !s.done)?.label ?? steps.find((s) => !s.done)?.label ?? null;
    out.push({ featureId: f.id, label: f.label, steps, latest, next });
  }
  return out;
}

export type FeedItem<P, S> = { kind: "progress"; date: string; item: P } | { kind: "schedule"; date: string; item: S };

/** Progress + schedule updates in one feed, newest first. */
export function mergeFeed<P extends { date: string }, S extends { posted_at: string }>(progress: P[], schedule: S[]): FeedItem<P, S>[] {
  return [
    ...progress.map((p) => ({ kind: "progress" as const, date: p.date, item: p })),
    ...schedule.map((s) => ({ kind: "schedule" as const, date: s.posted_at, item: s })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

export type NotifyMode = "each" | "daily" | "never";

/** Offer "Let Greg know" now? Each share, at most once a day, or never. */
export function shouldPromptClient(mode: NotifyMode, lastPromptedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (mode === "never") return false;
  if (mode === "each" || !lastPromptedAt) return true;
  return now.getTime() - new Date(lastPromptedAt).getTime() >= 20 * 3600_000;
}

export const PROGRESS_MESSAGE = "Hi {client_first_name}, it's {company_name}. New progress photos on your {project_name} project: {client_hub_link}";
