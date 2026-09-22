/* =============================================================================
 * PRESENTATION-ONLY DEMO DATA
 *
 * Everything in this module is fake. It exists so the redesigned screens read as
 * "complete and alive" for features the schema does not yet have (crew
 * scheduling, job-stage pipeline, per-job progress, work-type splits, quote
 * markup/tax lines, org quote defaults, automations, aging history).
 *
 * RULES:
 *   - Never imported by `src/lib/api.ts`.
 *   - Never passed to `supabase.*` or any create/update/delete call.
 *   - Real entities (projects, quotes, invoices, clients) always come from live
 *     data; this only decorates them.
 *   - Helpers are pure and deterministic (seeded off real row ids) so values are
 *     stable across renders and look plausible.
 *
 * Delete a section here as the corresponding real feature lands.
 * ========================================================================== */

import type { VisualOnlyStatus } from "./statusMeta";

// ---------------------------------------------------------------------------
// Deterministic seeding
// ---------------------------------------------------------------------------

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededPick<T>(arr: readonly T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

function seededInt(seed: string, min: number, max: number): number {
  return min + (hash(seed) % (max - min + 1));
}

// ---------------------------------------------------------------------------
// Org-level fixtures
// ---------------------------------------------------------------------------

export const DEMO_CREWS = [
  { id: "crew-a", name: "Crew A", size: 3, lead: "Marco R." },
  { id: "crew-b", name: "Crew B", size: 2, lead: "Devon P." },
  { id: "crew-c", name: "Crew C", size: 3, lead: "Sam W." },
] as const;

export const DEMO_REVENUE_GOAL = 95_000;
export const DEMO_WEEKS_BOOKED = 5.5;
export const DEMO_HOURS_PER_WEEK = 38;
export const DEMO_AVG_DAYS_TO_PAY = 19;

// Quote validity days / sales tax % / deposit % / terms used to live here as
// fixed demo constants. They're now real, persisted Quote defaults (Settings
// > Quote defaults, src/lib/api.ts QuoteDefaults) — demoQuoteTerms() below
// takes them as real parameters instead.

export const DEMO_AUTOMATIONS = [
  { id: "quote-followup", label: "Quote follow-up", description: "Nudge the client 5 days after sending if no reply", enabled: true },
  { id: "overdue-reminders", label: "Overdue invoice reminders", description: "Every 7 days past due, up to 4 times", enabled: true },
  { id: "deposit-on-approval", label: "Deposit request on approval", description: "Draft the deposit invoice the moment a quote is signed", enabled: false },
] as const;

// ---------------------------------------------------------------------------
// Per-project decoration (seeded off project.id + real status)
// ---------------------------------------------------------------------------

interface ProjectLike {
  id: string;
  status: string;
}

const STAGE_BY_STATUS: Record<string, VisualOnlyStatus> = {
  estimating: "quoting",
  scheduled: "scheduled",
  in_progress: "in_progress",
  complete: "complete",
  lost: "quoting",
};

const NEXT_ACTION = [
  "Follow up",
  "Order materials",
  "Confirm crew",
  "Site visit",
  "Progress draw",
  "Punch list",
] as const;

export interface DemoJobMeta {
  stage: VisualOnlyStatus;
  crew: string;
  progressPct: number;
  dayOfTotal: { day: number; total: number } | null;
  nextAction: string;
  scheduledLabel: string;
}

export function demoJobMeta(project: ProjectLike): DemoJobMeta {
  const stage: VisualOnlyStatus = STAGE_BY_STATUS[project.status] ?? "quoting";

  const crew = seededPick(DEMO_CREWS, project.id).name;
  const total = seededInt(project.id + "t", 4, 8);
  const day = Math.min(total, seededInt(project.id + "d", 1, total));
  const active = stage === "in_progress";
  const complete = stage === "complete";

  return {
    stage,
    crew,
    progressPct: complete ? 100 : active ? Math.round((day / total) * 100) : stage === "scheduled" ? 0 : seededInt(project.id + "p", 5, 40),
    dayOfTotal: active ? { day, total } : null,
    nextAction: seededPick(NEXT_ACTION, project.id + "n"),
    scheduledLabel: seededPick(
      ["Today 7:00a", "Tomorrow", "Mon", "Sept 22", "Oct 6", "Next week"],
      project.id + "s",
    ),
  };
}

const WEEK_TASKS = [
  "Excavate + haul",
  "Base + compact",
  "Paver field",
  "Cuts + border",
  "Polymeric + seal",
] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export interface DemoWeekDay {
  day: string;
  task: string;
  state: "done" | "today" | "upcoming";
}

/** A 5-day build-week strip for the job-detail schedule card. */
export function demoJobWeek(project: ProjectLike): DemoWeekDay[] {
  const meta = demoJobMeta(project);
  const doneThrough =
    meta.stage === "complete" ? 5 : meta.stage === "in_progress" ? meta.dayOfTotal?.day ?? 2 : meta.stage === "scheduled" ? 0 : 1;
  return WEEKDAYS.map((day, i) => ({
    day,
    task: WEEK_TASKS[i],
    state: i < doneThrough - 1 ? "done" : i === doneThrough - 1 ? "today" : "upcoming",
  }));
}

// ---------------------------------------------------------------------------
// Quote "Terms" card rows. Deposit % is real (passed in); the rest is demo
// decoration for the mockup's completeness — never persisted.
// ---------------------------------------------------------------------------

export interface DemoQuoteTerms {
  validUntil: string;
  depositLabel: string;
  balance: string;
  warranty: string;
  crewWindow: string;
}

export function demoQuoteTerms(
  quote: { id: string; created_at: string },
  depositPct: number,
  validityDays: number,
): DemoQuoteTerms {
  const DAY = 86_400_000;
  const created = new Date(quote.created_at || "2026-01-01");
  const long = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const start = new Date(created.getTime() + (18 + seededInt(quote.id + "crew", 0, 10)) * DAY);
  return {
    validUntil: long(new Date(created.getTime() + validityDays * DAY)),
    depositLabel: `${depositPct}% at signing`,
    balance: "Net 14 from completion",
    warranty: "5-year workmanship",
    crewWindow: `${short(start)} – ${short(new Date(start.getTime() + 4 * DAY))}`,
  };
}

