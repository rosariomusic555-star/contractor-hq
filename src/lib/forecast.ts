/* =============================================================================
 * Forecast on the schedule (0119) — the client side of the
 * `weather-forecast` Edge Function (NWS forecast + Census geocoding, cached
 * server-side per ~5 km area for 2 h). No provider is ever called from the
 * browser. The math on top of this lives in src/lib/weatherRisk.ts.
 * ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  getNotificationSettings,
  listAppointments,
  listProjects,
  SITE_VISIT_APPOINTMENT_TYPES,
  type Project,
} from "@/lib/api";
import {
  DEFAULT_WEATHER_SETTINGS,
  addDaysISO,
  forecastWorkDays,
  isoDate,
  riskRank,
  riskyWorkDays,
  scheduledWorkDays,
  shortDayLabel,
  type Forecast,
  type RiskLevel,
  type WeatherCondition,
  type WeatherSettings,
} from "@/lib/weatherRisk";
import { projectHref } from "@/lib/projectTabs";

export type ForecastStatus = "ok" | "no_address" | "geocode_failed" | "unsupported" | "unavailable";

export interface ForecastTarget {
  status: ForecastStatus;
  forecast: Forecast | null;
}

export interface ForecastBatch {
  settings: WeatherSettings;
  projects: Record<string, ForecastTarget>;
  appointments: Record<string, ForecastTarget>;
  business: ForecastTarget | null;
}

interface RawTarget {
  status: ForecastStatus;
  loc?: string;
}

/** How far ahead to ask for — the NWS range is ~7 days; anything past what
 * it returns is simply absent. */
export const FORECAST_LOOKAHEAD_DAYS = 9;
const STALE_MS = 30 * 60 * 1000;

/** Projects whose schedule counts as upcoming work (Bookings' committed
 * statuses, minus finished jobs). */
export const FORECAST_PROJECT_STATUSES = new Set(["scheduled", "in_progress"]);

export async function fetchForecasts(req: { projects?: string[]; appointments?: string[]; business?: boolean }): Promise<ForecastBatch | null> {
  const { data, error } = await supabase.functions.invoke("weather-forecast", { body: req });
  if (error || !data?.ok) return null;
  const forecasts: Record<string, Forecast> = data.forecasts ?? {};
  const map = (targets: Record<string, RawTarget> | null | undefined) =>
    Object.fromEntries(
      Object.entries(targets ?? {}).map(([id, t]) => [id, { status: t.status, forecast: t.loc ? (forecasts[t.loc] ?? null) : null }]),
    ) as Record<string, ForecastTarget>;
  return {
    settings: { ...DEFAULT_WEATHER_SETTINGS, ...(data.settings ?? {}) },
    projects: map(data.projects),
    appointments: map(data.appointments),
    business: data.business ? { status: data.business.status, forecast: data.business.loc ? (forecasts[data.business.loc] ?? null) : null } : null,
  };
}

export const todayISO = () => isoDate(new Date());

/** True when the job has at least one work day between today and the
 * forecast horizon. */
export function hasUpcomingWorkDays(p: { scheduled_start_date: string | null; scheduled_end_date: string | null }, days = FORECAST_LOOKAHEAD_DAYS): boolean {
  const today = todayISO();
  return scheduledWorkDays(p.scheduled_start_date, p.scheduled_end_date, today, addDaysISO(today, days)).length > 0;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** One job's forecast (project page, Bookings job card, crew view). Works for
 * employees too — the function only returns projects the caller can see. */
export function useProjectForecast(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["forecast", "project", projectId],
    queryFn: () => fetchForecasts({ projects: [projectId as string] }),
    enabled: !!projectId && enabled,
    staleTime: STALE_MS,
    retry: false,
  });
}

/** Every upcoming scheduled job in one call (Bookings calendar, Dashboard).
 * Reads the shared ["projects"] list; the key is the sorted id set, so every
 * screen asking for the same jobs shares the result. */
export function useScheduleForecasts() {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const upcoming = projects.filter((p) => FORECAST_PROJECT_STATUSES.has(p.status) && hasUpcomingWorkDays(p));
  const ids = upcoming.map((p) => p.id).sort();
  const query = useQuery({
    queryKey: ["forecast", "schedule", ids.join(",")],
    queryFn: () => fetchForecasts({ projects: ids }),
    enabled: ids.length > 0,
    staleTime: STALE_MS,
    retry: false,
  });
  return { projects: upcoming, batch: query.data ?? null, isLoading: query.isLoading && ids.length > 0 };
}

/** Upcoming appointments' forecasts, one call for the whole list — each row
 * picks its own entry. */
export function useAppointmentForecasts() {
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const today = todayISO();
  const horizon = addDaysISO(today, FORECAST_LOOKAHEAD_DAYS);
  const ids = appointments
    .filter((a) => a.status === "scheduled" && SITE_VISIT_APPOINTMENT_TYPES.includes(a.type) && a.address?.trim())
    .filter((a) => {
      const d = isoDate(new Date(a.date_time));
      return d >= today && d <= horizon;
    })
    .map((a) => a.id)
    .sort();
  const query = useQuery({
    queryKey: ["forecast", "appointments", ids.join(",")],
    queryFn: () => fetchForecasts({ appointments: ids }),
    enabled: ids.length > 0,
    staleTime: STALE_MS,
    retry: false,
  });
  return query.data ?? null;
}

// ---------------------------------------------------------------------------
// Dashboard + morning alerts
// ---------------------------------------------------------------------------

export interface JobWeatherRisk {
  project: Pick<Project, "id" | "name" | "scheduled_start_date" | "scheduled_end_date">;
  date: string;
  level: RiskLevel;
  summary: string;
}

/** Risky work days across jobs, within `days` from today, soonest first. */
export function jobRisks(
  projects: Pick<Project, "id" | "name" | "scheduled_start_date" | "scheduled_end_date">[],
  batch: ForecastBatch | null,
  days: number,
): JobWeatherRisk[] {
  if (!batch) return [];
  const today = todayISO();
  const last = addDaysISO(today, days - 1);
  const out: JobWeatherRisk[] = [];
  for (const p of projects) {
    const t = batch.projects[p.id];
    if (!t?.forecast) continue;
    for (const d of riskyWorkDays({ start: p.scheduled_start_date, end: p.scheduled_end_date }, t.forecast, batch.settings, today)) {
      if (d.date > last) continue;
      out.push({ project: p, date: d.date, level: d.risk.level, summary: d.risk.summary });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || riskRank(b.level) - riskRank(a.level));
}

const ALERT_DAYS = 3;

/**
 * Morning alerts: work days in the next 3 days that newly became risky.
 * Runs once per day on the first app open (AppLayout). Deduped by
 * (project, day, level): the same day alerts again only if it gets worse
 * (amber → red); a day that eases off never re-alerts.
 */
export async function runWeatherRiskAlerts(): Promise<number> {
  const settings = await getNotificationSettings();
  if (!settings.weather_risk) return 0;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return 0;

  const projects = (await listProjects()).filter((p) => FORECAST_PROJECT_STATUSES.has(p.status) && hasUpcomingWorkDays(p, ALERT_DAYS - 1));
  if (projects.length === 0) return 0;
  const batch = await fetchForecasts({ projects: projects.map((p) => p.id) });
  const risks = jobRisks(projects, batch, ALERT_DAYS);
  if (risks.length === 0) return 0;

  const { data: existing } = await supabase
    .from("notifications")
    .select("dedupe_key")
    .like("dedupe_key", "weather:%")
    .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
  const seen = new Set((existing ?? []).map((n) => n.dedupe_key as string));

  const rows = risks
    .filter((r) => !(r.level === "amber" && seen.has(`weather:${r.project.id}:${r.date}:red`)))
    .map((r) => ({
      user_id: userId,
      kind: "weather_risk",
      title: `Weather risk ${shortDayLabel(r.date)}: ${r.project.name}`,
      body: r.summary,
      link: projectHref(r.project.id, "schedule"),
      dedupe_key: `weather:${r.project.id}:${r.date}:${r.level}`,
    }))
    .filter((r) => !seen.has(r.dedupe_key));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("notifications").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  return error ? 0 : rows.length;
}

export interface CalendarDayWeather {
  condition: WeatherCondition;
  level: RiskLevel;
  /** One line per job worked that day — "Greg Patio: 80% chance of rain, ~0.6 in". */
  lines: string[];
}

/** Bookings calendar: per date, the worst risk across the jobs worked that
 * day (and the worst job's condition for the icon). Only dates the forecast
 * covers appear. */
export function scheduleWeatherByDate(
  projects: Pick<Project, "id" | "name" | "scheduled_start_date" | "scheduled_end_date">[],
  batch: ForecastBatch | null,
): Map<string, CalendarDayWeather> {
  const out = new Map<string, CalendarDayWeather>();
  if (!batch) return out;
  const today = todayISO();
  for (const p of projects) {
    const f = batch.projects[p.id]?.forecast;
    for (const d of forecastWorkDays({ start: p.scheduled_start_date, end: p.scheduled_end_date }, f, batch.settings, today)) {
      const line = `${p.name}: ${d.risk.level === "none" ? `${d.weather.label}, ${d.weather.pop}% rain` : d.risk.summary}`;
      const cur = out.get(d.date);
      if (!cur) out.set(d.date, { condition: d.weather.condition, level: d.risk.level, lines: [line] });
      else {
        cur.lines.push(line);
        if (riskRank(d.risk.level) > riskRank(cur.level)) {
          cur.level = d.risk.level;
          cur.condition = d.weather.condition;
        }
      }
    }
  }
  return out;
}
