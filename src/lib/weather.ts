/* =============================================================================
 * Weather Strip (Dashboard) — 7-day forecast via Open-Meteo (free, no API
 * key). Geocodes the business address (Settings > Business profile), flags
 * install-critical days for hardscape work, and caches results in
 * localStorage so a normal session of page loads doesn't re-hit the API.
 *
 * The headline rain % per day is scoped to the crew's work window (Settings
 * > Business profile, default 7am-5pm) rather than the full 24h day — rain
 * at 2am doesn't stop a crew, rain at 10am does. This needs hourly
 * precipitation data, fetched in the SAME request as the daily summary
 * (Open-Meteo accepts both `daily` and `hourly` params on one call). The
 * raw daily+hourly response is what gets cached, address-keyed only; the
 * work-window-dependent day tiles (headline %, qualifier text, flag) are
 * derived from that cached raw data on every call, so changing crew hours
 * in Settings re-derives instantly without a new network request.
 *
 * Fails quietly everywhere: any network/parse error, or no address set,
 * resolves to null rather than throwing — the Dashboard hides the strip
 * instead of showing an error.
 * ========================================================================== */

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

// WMO weather codes (Open-Meteo's `daily.weathercode`) collapsed to a small
// icon set — see https://open-meteo.com/en/docs for the full table.
const WMO_ICON: Record<number, WeatherIconKey> = {
  0: "sun",
  1: "sun",
  2: "cloud",
  3: "cloud",
  45: "fog",
  48: "fog",
  51: "rain",
  53: "rain",
  55: "rain",
  56: "rain",
  57: "rain",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "rain",
  67: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  80: "rain",
  81: "rain",
  82: "rain",
  85: "snow",
  86: "snow",
  95: "storm",
  96: "storm",
  99: "storm",
};

const WMO_LABEL: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

interface GeocodeResult {
  lat: number;
  lon: number;
}

interface GeocodeApiResult {
  latitude: number;
  longitude: number;
  country_code?: string;
  admin1?: string;
  postcodes?: string[];
}

const US_STATE_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

/** Open-Meteo's geocoder does an exact-ish match on place name only — it
 * has no free-text "city, state" search, so "Northampton MA" (with the
 * state appended) returns zero results while a bare "Northampton" returns
 * several same-named places worldwide. This pulls the city name out on its
 * own for the query, plus the zip/state separately to disambiguate the
 * results client-side (see pickBestMatch). */
function parseAddress(address: string): { cityQuery: string; zip: string | null; state: string | null } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const tail = parts.length > 1 ? parts.slice(1).join(" ") : address;
  const zip = tail.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
  const state = tail.match(/\b([A-Z]{2})\b/)?.[1] ?? null;
  const cityQuery = tail
    .replace(/\b\d{5}(-\d{4})?\b/g, "")
    .replace(/\b[A-Z]{2}\b/g, "")
    .trim();
  return { cityQuery: cityQuery || address.trim(), zip, state };
}

/** Zip match beats everything (exact); failing that, prefer a US result in
 * the right state; failing that, the first US result; failing that,
 * whatever the geocoder ranked first (better than nothing for a non-US
 * address). */
function pickBestMatch(
  results: GeocodeApiResult[],
  zip: string | null,
  state: string | null,
): GeocodeApiResult | null {
  if (results.length === 0) return null;
  if (zip) {
    const byZip = results.find((r) => r.postcodes?.includes(zip));
    if (byZip) return byZip;
  }
  const us = results.filter((r) => r.country_code === "US");
  if (state && US_STATE_NAME[state]) {
    const byState = us.find((r) => r.admin1 === US_STATE_NAME[state]);
    if (byState) return byState;
  }
  return us[0] ?? results[0];
}

async function geocode(address: string): Promise<GeocodeResult | null> {
  const { cityQuery, zip, state } = parseAddress(address);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const best = pickBestMatch(json?.results ?? [], zip, state);
  if (!best || typeof best.latitude !== "number" || typeof best.longitude !== "number") return null;
  return { lat: best.latitude, lon: best.longitude };
}

/** The raw shape cached in localStorage — everything Open-Meteo returned,
 * address-keyed only (no work-window dependency), so re-deriving day tiles
 * after a Settings change never needs a new fetch. */
interface RawForecast {
  dates: string[];
  codes: number[];
  highs: number[];
  lows: number[];
  /** Per-day hour arrays, 24 entries each (or fewer at the edges of the
   * 7-day range), aligned to `dates[i]`. */
  hourlyByDay: number[][];
}

async function fetchForecast(coords: GeocodeResult): Promise<RawForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&hourly=precipitation_probability` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo forecast request failed (${res.status})`);
  const json = await res.json();
  const dates: string[] = json?.daily?.time ?? [];
  const codes: number[] = json?.daily?.weathercode ?? [];
  const highs: number[] = json?.daily?.temperature_2m_max ?? [];
  const lows: number[] = json?.daily?.temperature_2m_min ?? [];

  const hourlyTimes: string[] = json?.hourly?.time ?? [];
  const hourlyProbs: number[] = json?.hourly?.precipitation_probability ?? [];
  const hourlyByDate = new Map<string, number[]>();
  hourlyTimes.forEach((t, i) => {
    const date = t.slice(0, 10);
    const hour = Number(t.slice(11, 13));
    if (Number.isNaN(hour)) return;
    const arr = hourlyByDate.get(date) ?? new Array(24).fill(0);
    arr[hour] = hourlyProbs[i] ?? 0;
    hourlyByDate.set(date, arr);
  });

  return {
    dates,
    codes,
    highs: highs.map((h) => Math.round(h ?? 0)),
    lows: lows.map((l) => Math.round(l ?? 0)),
    hourlyByDay: dates.map((d) => hourlyByDate.get(d) ?? new Array(24).fill(0)),
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
      icon: WMO_ICON[raw.codes[i]] ?? "cloud",
      conditionLabel: WMO_LABEL[raw.codes[i]] ?? "—",
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

const CACHE_KEY = "chq_weather_strip_v2";
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
    const coords = await geocode(trimmed);
    if (!coords) return null;
    const raw = await fetchForecast(coords);
    if (raw.dates.length === 0) return null;
    writeCache(trimmed, raw);
    return buildDayForecasts(raw, workWindow);
  } catch {
    return null;
  }
}
