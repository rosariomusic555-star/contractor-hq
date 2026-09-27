/* =============================================================================
 * Forecast on the schedule (0119) — the one place the weather math lives.
 *
 * The `weather-forecast` Edge Function returns normalized NWS days (see
 * supabase/functions/weather-forecast); everything here is pure and
 * derived from that + the contractor's settings, so changing a threshold in
 * Settings re-derives every screen without a new fetch.
 *
 *  - scheduledWorkDays(): which calendar days a job is actually worked —
 *    weekdays from start to end (just start when there's no end), plus the
 *    start/end dates themselves even if they fall on a weekend.
 *  - dayWeather(): one forecast day as the app shows it; the headline rain
 *    % is scoped to the crew's work window (same rule the Dashboard strip
 *    has used since 0068 — rain at 2am doesn't stop a crew).
 *  - assessDay(): amber/red risk + the short "why" ("80% chance of rain,
 *    ~0.6 in").
 *  - riskyWorkDays(): a job's flagged upcoming work days — the hook the
 *    next feature's "Push job" rain-delay action will build on.
 * ========================================================================== */

export type WeatherCondition =
  | "clear"
  | "partly_cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "showers"
  | "thunderstorms"
  | "snow"
  | "freezing_rain";

export interface ForecastDay {
  /** "2026-10-02", in the location's own time zone. */
  date: string;
  condition: WeatherCondition;
  highF: number | null;
  lowF: number | null;
  /** Max hourly precipitation chance across the whole day. */
  popMax: number;
  /** Expected precipitation for the whole day, inches. */
  rainIn: number;
  thunder: boolean;
  snow: boolean;
  ice: boolean;
  /** 24 entries by local hour — null where there's no data (past hours today). */
  hourlyPop: (number | null)[];
  hourlyRainIn: (number | null)[];
  hourlyTempF: (number | null)[];
}

export interface Forecast {
  provider: "nws";
  timeZone: string;
  fetchedAt: string;
  stale?: boolean;
  days: ForecastDay[];
}

export interface WeatherSettings {
  /** Risky at/above this work-hours rain chance (%). */
  rainPct: number;
  /** Risky at/above this expected rain (inches). */
  rainIn: number;
  thunder: boolean;
  freeze: boolean;
  heat: boolean;
  heatF: number;
  /** Crew work window, "HH:MM". */
  workStart: string;
  workEnd: string;
}

export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  rainPct: 60,
  rainIn: 0.25,
  thunder: true,
  freeze: true,
  heat: true,
  heatF: 95,
  workStart: "07:00",
  workEnd: "17:00",
};

export type RiskLevel = "none" | "amber" | "red";

export const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: "Clear",
  partly_cloudy: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  showers: "Showers",
  thunderstorms: "Thunderstorms",
  snow: "Snow",
  freezing_rain: "Freezing rain / sleet",
};

const RISK_RANK: Record<RiskLevel, number> = { none: 0, amber: 1, red: 2 };
export const riskRank = (l: RiskLevel) => RISK_RANK[l];
export const worstRisk = (levels: RiskLevel[]): RiskLevel =>
  levels.reduce<RiskLevel>((w, l) => (RISK_RANK[l] > RISK_RANK[w] ? l : w), "none");

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** "Thu 10/2" — US format, matching the rest of the app. */
export function shortDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * The days a job is worked between `from` and `to` (inclusive, ISO):
 * weekdays from start to end, plus the start/end dates themselves even on a
 * weekend (someone put that date on the schedule on purpose). No end date
 * means a one-day job.
 */
export function scheduledWorkDays(
  start: string | null | undefined,
  end: string | null | undefined,
  from: string,
  to: string,
): string[] {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const lo = start > from ? start : from;
  const hi = last < to ? last : to;
  const out: string[] = [];
  for (let d = lo; d <= hi; d = addDaysISO(d, 1)) {
    const dow = new Date(`${d}T00:00:00`).getDay();
    if ((dow !== 0 && dow !== 6) || d === start || d === last) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weather per day
// ---------------------------------------------------------------------------

function hourOf(hhmm: string, fallback: number): number {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h >= 0 && h <= 24 ? h : fallback;
}

export function workWindowHours(settings: Pick<WeatherSettings, "workStart" | "workEnd">): { start: number; end: number } {
  const start = Math.floor(hourOf(settings.workStart, 7));
  const end = Math.ceil(hourOf(settings.workEnd, 17));
  return end > start ? { start, end } : { start: 7, end: 17 };
}

function maxIn(values: (number | null)[], start: number, end: number): number | null {
  let max: number | null = null;
  for (let h = Math.max(0, start); h < Math.min(24, end); h++) {
    const v = values[h];
    if (typeof v === "number") max = max == null ? v : Math.max(max, v);
  }
  return max;
}

export interface DayWeather {
  date: string;
  condition: WeatherCondition;
  label: string;
  highF: number | null;
  lowF: number | null;
  /** Rain chance during the given hours (the crew's window by default). */
  pop: number;
  rainIn: number;
  thunder: boolean;
  snow: boolean;
  ice: boolean;
}

/** One forecast day as displayed. `hours` narrows the rain chance to a slice
 * of the day (an appointment's own time); defaults to the work window. When
 * none of those hours have data (e.g. today's work day already over) the
 * whole-day figure is used rather than showing 0%. */
export function dayWeather(day: ForecastDay, settings: WeatherSettings, hours?: { start: number; end: number }): DayWeather {
  const win = hours ?? workWindowHours(settings);
  const pop = maxIn(day.hourlyPop, win.start, win.end) ?? day.popMax;
  return {
    date: day.date,
    condition: day.condition,
    label: CONDITION_LABEL[day.condition] ?? "—",
    highF: day.highF,
    lowF: day.lowF,
    pop: Math.round(pop),
    rainIn: day.rainIn,
    thunder: day.thunder,
    snow: day.snow,
    ice: day.ice,
  };
}

/** "0.6", "0.25", "1" — inches without trailing zeros. */
export function formatInches(v: number): string {
  if (v > 0 && v < 0.01) return "<0.01";
  return String(Math.round(v * 100) / 100);
}

export interface DayRisk {
  level: RiskLevel;
  /** Short reasons, most important first — "80% chance of rain, ~0.6 in". */
  reasons: string[];
  summary: string;
}

export function assessDay(w: DayWeather, s: WeatherSettings): DayRisk {
  const found: { level: RiskLevel; text: string }[] = [];

  const rainByChance = w.pop >= s.rainPct;
  const rainByAmount = w.rainIn >= s.rainIn;
  if (rainByChance || rainByAmount) {
    const red = (rainByChance && w.pop >= Math.max(80, s.rainPct)) || w.rainIn >= s.rainIn * 2;
    const amount = w.rainIn > 0 ? `, ~${formatInches(w.rainIn)} in` : "";
    found.push({ level: red ? "red" : "amber", text: `${w.pop}% chance of rain${amount}` });
  }
  if (s.thunder && w.thunder) found.push({ level: "red", text: "Thunderstorms possible" });
  if (s.freeze) {
    if (w.snow) found.push({ level: "red", text: "Snow in the forecast" });
    else if (w.ice) found.push({ level: "red", text: "Freezing rain / sleet in the forecast" });
    else if (w.lowF != null && w.lowF <= 32) found.push({ level: "amber", text: `Freezing temps (low ${w.lowF}°F)` });
    else if (w.highF != null && w.highF < 40) found.push({ level: "amber", text: `Stays below 40°F (high ${w.highF}°F)` });
  }
  if (s.heat && w.highF != null && w.highF >= s.heatF) {
    found.push({ level: w.highF >= s.heatF + 8 ? "red" : "amber", text: `Extreme heat (high ${w.highF}°F)` });
  }

  found.sort((a, b) => RISK_RANK[b.level] - RISK_RANK[a.level]);
  const level = worstRisk(found.map((f) => f.level));
  const reasons = found.map((f) => f.text);
  return { level, reasons, summary: reasons.join(" · ") };
}

// ---------------------------------------------------------------------------
// Jobs + appointments
// ---------------------------------------------------------------------------

export interface WorkDayForecast {
  date: string;
  weather: DayWeather;
  risk: DayRisk;
}

/** A job's upcoming work days that the forecast covers (never a guess for
 * days past its range), each with its weather + risk. */
export function forecastWorkDays(
  schedule: { start: string | null | undefined; end: string | null | undefined },
  forecast: Forecast | null | undefined,
  settings: WeatherSettings,
  today: string,
): WorkDayForecast[] {
  if (!forecast || forecast.days.length === 0) return [];
  const byDate = new Map(forecast.days.map((d) => [d.date, d]));
  const lastDay = forecast.days[forecast.days.length - 1].date;
  return scheduledWorkDays(schedule.start, schedule.end, today, lastDay)
    .filter((d) => byDate.has(d))
    .map((date) => {
      const weather = dayWeather(byDate.get(date)!, settings);
      return { date, weather, risk: assessDay(weather, settings) };
    });
}

/**
 * The job's flagged work days — amber or red — soonest first. This is the
 * hook for the next feature ("Push job" rain delay): it will read these to
 * offer moving the job past the bad days. Display-only for now.
 */
export function riskyWorkDays(
  schedule: { start: string | null | undefined; end: string | null | undefined },
  forecast: Forecast | null | undefined,
  settings: WeatherSettings,
  today: string,
): WorkDayForecast[] {
  return forecastWorkDays(schedule, forecast, settings, today).filter((d) => d.risk.level !== "none");
}

/** An appointment's forecast: its own hours when it has a time (duration,
 * at least one hour), the crew window for an all-day visit. Null when the
 * date is outside the forecast range or already past. */
export function appointmentWeather(
  appt: { date_time: string; all_day: boolean; duration_minutes?: number | null },
  forecast: Forecast | null | undefined,
  settings: WeatherSettings,
): { weather: DayWeather; risk: DayRisk } | null {
  if (!forecast) return null;
  const dt = new Date(appt.date_time);
  const day = forecast.days.find((d) => d.date === isoDate(dt));
  if (!day) return null;
  let hours: { start: number; end: number } | undefined;
  if (!appt.all_day) {
    const start = dt.getHours();
    hours = { start, end: start + Math.max(1, Math.ceil((appt.duration_minutes ?? 60) / 60)) };
  }
  const weather = dayWeather(day, settings, hours);
  return { weather, risk: assessDay(weather, settings) };
}
