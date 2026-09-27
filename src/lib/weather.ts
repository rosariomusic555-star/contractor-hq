/* =============================================================================
 * Weather Strip (Dashboard) — 7-day forecast for the business address
 * (Settings > Business profile). Since 0119 this comes from the
 * `weather-forecast` Edge Function (National Weather Service, geocoded by
 * the US Census geocoder, cached server-side) — the browser no longer calls
 * a weather or geocoding API itself. Flags install-critical days for
 * hardscape work, and caches the result in localStorage so a normal session
 * of page loads doesn't re-ask.
 *
 * The headline rain % per day is scoped to the crew's work window (Settings
 * > Business profile, default 7am-5pm) rather than the full 24h day — rain
 * at 2am doesn't stop a crew, rain at 10am does. The raw daily+hourly data
 * is what gets cached, address-keyed only; the work-window-dependent day
 * tiles (headline %, qualifier text, flag) are derived from that cached raw
 * data on every call, so changing crew hours in Settings re-derives
 * instantly without a new request.
 *
 * Fails quietly everywhere: any network/parse error, or no address set,
 * resolves to null rather than throwing — the Dashboard hides the strip
 * instead of showing an error.
 * ========================================================================== */

import { fetchForecasts } from "@/lib/forecast";
import { CONDITION_LABEL, type WeatherCondition } from "@/lib/weatherRisk";

export type WeatherIconKey = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog";

export type WeatherFlagReason = "rain" | "cold" | null;

export interface WorkWindow {
  /** "07:00" */
  start: string;
  /** "17:00" */
  end: string;
}

export const DEFAULT_WORK_WINDOW: WorkWindow = { start: "07:00", end: "17:00" };

export interface DayForecast {
  /** "2026-09-19" */
  date: string;
  /** "Fri" */
  dayLabel: string;
  icon: WeatherIconKey;
  conditionLabel: string;
  tempMaxF: number;
  tempMinF: number;
  /** 0-100, the WORK-WINDOW figure (the headline %) — not the 24h day. */
  precipProbability: number;
  /** Short note on when rain actually lands, e.g. "Rain 8am–11am",
   * "Rain most of the day" — null when there's no meaningful rain risk
   * anywhere in the day. */
  rainQualifier: string | null;
  /** Rain risk exists somewhere in the day, but none of it overlaps the
   * work window — precipProbability is already low/reassuring, and
   * rainQualifier reads "Overnight only" rather than a specific time. */
  overnightOnly: boolean;
  /** Work-window rain probability over ~50%, or the day's high never
   * clears 40F (base can't compact in mud, polymeric sand/adhesive won't
   * cure in the cold). Overnight-only rain never sets this. */
  flagged: boolean;
  flagReason: WeatherFlagReason;
}

const CONDITION_ICON: Record<WeatherCondition, WeatherIconKey> = {
  clear: "sun",
  partly_cloudy: "cloud",
  cloudy: "cloud",
  fog: "fog",
  drizzle: "rain",
  rain: "rain",
  showers: "rain",
  thunderstorms: "storm",
  snow: "snow",
  freezing_rain: "snow",
};

/** The raw shape cached in localStorage — the business address's forecast
 * days, address-keyed only (no work-window dependency), so re-deriving day
 * tiles after a Settings change never needs a new fetch. */
interface RawForecast {
  dates: string[];
  conditions: WeatherCondition[];
  highs: number[];
  lows: number[];
  /** Per-day hour arrays, 24 entries each, aligned to `dates[i]`. */
  hourlyByDay: number[][];
}

async function fetchBusinessForecast(): Promise<RawForecast | null> {
  const batch = await fetchForecasts({ business: true });
  const days = batch?.business?.forecast?.days ?? [];
  if (days.length === 0) return null;
  return {
    dates: days.map((d) => d.date),
    conditions: days.map((d) => d.condition),
    highs: days.map((d) => d.highF ?? 0),
    lows: days.map((d) => d.lowF ?? 0),
    hourlyByDay: days.map((d) => d.hourlyPop.map((p) => p ?? 0)),
  };
}

/** "HH:MM" -> minutes since midnight; falls back to the default window on
 * anything malformed rather than producing a zero-width/NaN range. */
function parseHHMM(value: string, fallbackMinutes: number): number {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallbackMinutes;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallbackMinutes;
  return h * 60 + min;
}

const RAIN_THRESHOLD = 50;

const hourLabel = (hour: number): string => {
  const h = hour % 24;
  const period = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
};

/** Contiguous (gap-tolerant) blocks of hours at/above the rain threshold,
 * across the full 24h day — used both to decide "most of the day" and to
 * pick the block that explains the work-window figure. */
function rainySegments(hourlyProbs: number[]): Array<{ start: number; end: number }> {
  const rainyHours = hourlyProbs
    .map((p, h) => (p >= RAIN_THRESHOLD ? h : -1))
    .filter((h) => h >= 0);
  if (rainyHours.length === 0) return [];

  const segments: Array<{ start: number; end: number }> = [];
  let start = rainyHours[0];
  let prev = rainyHours[0];
  for (const h of rainyHours.slice(1)) {
    if (h - prev > 1) {
      segments.push({ start, end: prev });
      start = h;
    }
    prev = h;
  }
  segments.push({ start, end: prev });
  return segments;
}

function describeRain(hourlyProbs: number[], windowStartHour: number, windowEndHour: number): {
  qualifier: string | null;
  overnightOnly: boolean;
} {
  const segments = rainySegments(hourlyProbs);
  if (segments.length === 0) return { qualifier: null, overnightOnly: false };

  const overlapsWindow = segments.some((s) => s.start < windowEndHour && s.end >= windowStartHour);
  if (!overlapsWindow) {
    // All of today's rain falls outside the crew's hours — the work-window
    // % is already low/reassuring; name it plainly rather than with a
    // specific evening/overnight time range so a scary-looking day still
    // reads as workable at a glance.
    return { qualifier: "Overnight only", overnightOnly: true };
  }

  const totalRainyHours = segments.reduce((sum, s) => sum + (s.end - s.start + 1), 0);
  if (segments.length >= 3 || totalRainyHours >= 12) {
    return { qualifier: "Rain most of the day", overnightOnly: false };
  }

  const primary = segments.find((s) => s.start < windowEndHour && s.end >= windowStartHour)!;
  const qualifier =
    primary.end >= 22
      ? `Rain after ${hourLabel(primary.start)}`
      : `Rain ${hourLabel(primary.start)}–${hourLabel(primary.end + 1)}`;
  return { qualifier, overnightOnly: false };
}

function buildDayForecasts(raw: RawForecast, workWindow: WorkWindow): DayForecast[] {
  const windowStartHour = Math.floor(parseHHMM(workWindow.start, 7 * 60) / 60);
  const windowEndHour = Math.ceil(parseHHMM(workWindow.end, 17 * 60) / 60);

  return raw.dates.map((date, i) => {
    const tempMaxF = raw.highs[i] ?? 0;
    const tempMinF = raw.lows[i] ?? 0;
    const hourlyProbs = raw.hourlyByDay[i] ?? new Array(24).fill(0);

    const windowHours = hourlyProbs.slice(windowStartHour, windowEndHour);
    const workHoursProb = windowHours.length > 0 ? Math.max(...windowHours) : Math.max(...hourlyProbs, 0);

    const { qualifier, overnightOnly } = describeRain(hourlyProbs, windowStartHour, windowEndHour);

    const rain = !overnightOnly && workHoursProb >= RAIN_THRESHOLD;
    // The day's HIGH never clearing 40F, not the low — that's when there's
    // no window at all for compaction/adhesive/polymeric sand to work.
    // Full-day, not work-hours-scoped: cold is a curing-time problem, not
    // an "is anyone standing in it" problem.
    const cold = tempMaxF < 40;

    return {
      date,
      dayLabel: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
      icon: CONDITION_ICON[raw.conditions[i]] ?? "cloud",
      conditionLabel: CONDITION_LABEL[raw.conditions[i]] ?? "—",
      tempMaxF,
      tempMinF,
      precipProbability: Math.round(workHoursProb),
      rainQualifier: qualifier,
      overnightOnly,
      flagged: rain || cold,
      flagReason: rain ? "rain" : cold ? "cold" : null,
    };
  });
}

const CACHE_KEY = "chq_weather_strip_v3";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface WeatherCache {
  address: string;
  fetchedAt: number;
  raw: RawForecast;
}

function readCache(address: string): RawForecast | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as WeatherCache;
    if (cache.address !== address) return null;
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
    return cache.raw;
  } catch {
    return null;
  }
}

function writeCache(address: string, raw: RawForecast): void {
  try {
    const cache: WeatherCache = { address, fetchedAt: Date.now(), raw };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort — a full/blocked localStorage just means no cache, not a failure
  }
}

/**
 * The Dashboard Weather Strip's single entry point. Returns null (never
 * throws) on a blank address, a geocoding miss, or any network failure — the
 * caller hides the strip rather than rendering an error state. `workWindow`
 * only affects client-side derivation of the returned day tiles (headline
 * %, qualifier, flag) — it never changes what gets fetched or cached, so
 * tweaking crew hours in Settings re-renders instantly with no new request.
 */
export async function getWeatherStrip(
  address: string,
  workWindow: WorkWindow = DEFAULT_WORK_WINDOW,
): Promise<DayForecast[] | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cached = readCache(trimmed);
  if (cached) return buildDayForecasts(cached, workWindow);

  try {
    const raw = await fetchBusinessForecast();
    if (!raw) return null;
    writeCache(trimmed, raw);
    return buildDayForecasts(raw, workWindow);
  } catch {
    return null;
  }
}
