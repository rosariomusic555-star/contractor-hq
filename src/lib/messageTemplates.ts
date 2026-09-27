/* =============================================================================
 * Client heads-up (0121) — message templates + placeholder filling. Pure.
 *
 * Three templates, editable in Settings › Messages (defaults below; a row in
 * message_templates only once edited):
 *   rain_delay       — a delay whose reason is Rain or Weather
 *   schedule_change  — any other delay reason, or a manual date change
 *   start_confirmed  — "Confirm start date" (or a first-time schedule)
 * ========================================================================== */

import { addWorkingDays, delayDayLabel, type DelayReason } from "@/lib/scheduleShift";

export type TemplateKey = "rain_delay" | "schedule_change" | "start_confirmed" | "review_request" | "review_reminder";

export interface MessageTemplate {
  key: TemplateKey;
  subject: string;
  body: string;
}

export const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  rain_delay: "Rain delay",
  schedule_change: "Schedule change (other reason)",
  start_confirmed: "Start date confirmed",
  review_request: "Review request",
  review_reminder: "Review reminder",
};

export const DEFAULT_TEMPLATES: Record<TemplateKey, MessageTemplate> = {
  rain_delay: {
    key: "rain_delay",
    subject: "Schedule update: {project_name}",
    body: "Hi {client_first_name}, it's {company_name}. Rain is expected {delay_day}, so we're moving your {project_name} work to {new_start_date}. We'll keep you posted. Any questions, just reply here.",
  },
  schedule_change: {
    key: "schedule_change",
    subject: "Schedule update: {project_name}",
    body: "Hi {client_first_name}, it's {company_name}. A quick update on your {project_name}: because of {reason}, we're now planning to start {new_start_date} and finish around {new_end_date}. Any questions, just reply here.",
  },
  start_confirmed: {
    key: "start_confirmed",
    subject: "Start date confirmed: {project_name}",
    body: "Hi {client_first_name}, it's {company_name}. Good news: your {project_name} is confirmed to start {new_start_date}. You can see the details anytime here: {client_hub_link}",
  },
  review_request: {
    key: "review_request",
    subject: "Thank you from {company_name}",
    body: "Hi {client_first_name}, thanks again for choosing {company_name} for your {project_name}! If you're happy with how it turned out, a quick Google review would mean a lot to us: {review_link}",
  },
  review_reminder: {
    key: "review_reminder",
    subject: "A quick favor from {company_name}",
    body: "Hi {client_first_name}, just a friendly nudge — if you have a minute, a quick review of your {project_name} would really help us out: {review_link} Thank you!",
  },
};

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "client_first_name", label: "Client's first name" },
  { key: "company_name", label: "Your company name" },
  { key: "project_name", label: "Job name" },
  { key: "delay_day", label: "Day of the delay" },
  { key: "days_delayed", label: "Working days delayed" },
  { key: "new_start_date", label: "New start (or when work resumes)" },
  { key: "new_end_date", label: "New end date" },
  { key: "reason", label: "Reason, in words" },
  { key: "client_hub_link", label: "Link to the Client Hub" },
  { key: "review_link", label: "Your tracked review link" },
];

export type TemplateVars = Record<string, string>;

/** Replaces {placeholders}; unknown ones are left as typed so a typo is
 * visible in the preview rather than silently blank. */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Placeholders a template uses that don't exist — shown as a warning. */
export function unknownPlaceholders(text: string): string[] {
  const known = new Set([...PLACEHOLDERS.map((p) => p.key), "new_start_or_date"]);
  return [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))].filter((k) => !known.has(k));
}

const REASON_WORDS: Record<DelayReason, string> = {
  rain: "rain",
  weather_other: "the weather",
  material: "a material delay",
  client: "your request",
  other: "a scheduling change",
};

export interface ScheduleUpdateLike {
  source: "delay" | "manual" | "confirm";
  reason: string | null;
  from_start: string | null;
  from_end: string | null;
  to_start: string | null;
  to_end: string | null;
}

/** Rain / Weather delays → rain_delay; other delays and manual changes →
 * schedule_change; confirmations and first-time scheduling → start_confirmed. */
export function templateKeyFor(u: Pick<ScheduleUpdateLike, "source" | "reason" | "from_start">): TemplateKey {
  if (u.source === "confirm" || (u.source === "manual" && !u.from_start)) return "start_confirmed";
  if (u.source === "delay" && (u.reason === "rain" || u.reason === "weather_other")) return "rain_delay";
  return "schedule_change";
}

export function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

/**
 * The placeholder values for one job's update. `delayDay` / `daysDelayed`
 * come from the delay record when there is one. {new_start_date} is the new
 * start — or, when the start didn't move (an in-progress job extended),
 * the day work picks back up.
 */
export function templateVars(opts: {
  update: ScheduleUpdateLike;
  clientName: string | null | undefined;
  companyName: string | null | undefined;
  projectName: string;
  hubLink: string;
  delayDay?: string | null;
  daysDelayed?: number | null;
}): TemplateVars {
  const u = opts.update;
  const startMoved = u.from_start !== u.to_start;
  const resume =
    !startMoved && opts.delayDay && opts.daysDelayed ? addWorkingDays(opts.delayDay, opts.daysDelayed) : u.to_start;
  const newStart = delayDayLabel(startMoved || !resume ? u.to_start : resume);
  const reason = u.source === "delay" && u.reason ? REASON_WORDS[u.reason as DelayReason] ?? "a scheduling change" : "a scheduling change";
  return {
    client_first_name: firstName(opts.clientName),
    company_name: opts.companyName?.trim() || "your contractor",
    project_name: opts.projectName,
    delay_day: opts.delayDay ? delayDayLabel(opts.delayDay) : delayDayLabel(u.from_start),
    days_delayed: opts.daysDelayed ? String(opts.daysDelayed) : "",
    new_start_date: newStart,
    new_start_or_date: newStart,
    new_end_date: delayDayLabel(u.to_end ?? u.to_start),
    reason,
    client_hub_link: opts.hubLink,
  };
}

/** Placeholder values for a review request / reminder. */
export function reviewVars(opts: { clientName: string | null | undefined; companyName: string | null | undefined; projectName: string; reviewLink: string; hubLink: string }): TemplateVars {
  return {
    client_first_name: firstName(opts.clientName),
    company_name: opts.companyName?.trim() || "your contractor",
    project_name: opts.projectName,
    review_link: opts.reviewLink,
    client_hub_link: opts.hubLink,
  };
}

/** The tracked review link — logs the click, then redirects to the review page. */
export function reviewLink(token: string, origin: string = typeof window !== "undefined" ? window.location.origin : ""): string {
  return `${origin}/r/${token}`;
}

/** The Client Hub page for a project — clients sign in with a magic link. */
export function clientHubLink(projectId: string, origin: string = typeof window !== "undefined" ? window.location.origin : ""): string {
  return `${origin}/portal/projects/${projectId}`;
}
