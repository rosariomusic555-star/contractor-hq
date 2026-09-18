/* =============================================================================
 * Weather Strip (Dashboard) — 7-day forecast via Open-Meteo (free, no API
 * key). Geocodes the business address (Settings > Business profile), flags
 * install-critical days for hardscape work, and caches results in
 * localStorage so a normal session of page loads doesn't re-hit the API.
 *
 * Fails quietly everywhere: any network/parse error, or no address set,
 * resolves to null rather than throwing — the Dashboard hides the strip
 * instead of showing an error.
 * ========================================================================== */

export type WeatherIconKey = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog";

export type WeatherFlagReason = "rain" | "cold" | null;

export interface DayForecast {
  /** "2026-09-19" */
  date: string;
  /** "Fri" */
  dayLabel: string;
  icon: WeatherIconKey;
  conditionLabel: string;
  tempMaxF: number;
  tempMinF: number;
  /** 0-100 */
  precipProbability: number;
  /** Precip probability over ~50%, or the day's high never clears 40F (base
   * can't compact in mud, polymeric sand/adhesive won't cure in the cold). */
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

async function fetchForecast(coords: GeocodeResult): Promise<DayForecast[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo forecast request failed (${res.status})`);
  const json = await res.json();
  const dates: string[] = json?.daily?.time ?? [];
  const codes: number[] = json?.daily?.weathercode ?? [];
  const highs: number[] = json?.daily?.temperature_2m_max ?? [];
  const lows: number[] = json?.daily?.temperature_2m_min ?? [];
  const precip: number[] = json?.daily?.precipitation_probability_max ?? [];

  return dates.map((date, i) => {
    const tempMaxF = Math.round(highs[i] ?? 0);
    const tempMinF = Math.round(lows[i] ?? 0);
    const precipProbability = Math.round(precip[i] ?? 0);
    const rain = precipProbability > 50;
    // The day's HIGH never clearing 40F, not the low — that's when there's
    // no window at all for compaction/adhesive/polymeric sand to work.
    const cold = tempMaxF < 40;
    return {
      date,
      dayLabel: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
      icon: WMO_ICON[codes[i]] ?? "cloud",
      conditionLabel: WMO_LABEL[codes[i]] ?? "—",
      tempMaxF,
      tempMinF,
      precipProbability,
      flagged: rain || cold,
      flagReason: rain ? "rain" : cold ? "cold" : null,
    };
  });
}

const CACHE_KEY = "chq_weather_strip_v1";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface WeatherCache {
  address: string;
  fetchedAt: number;
  days: DayForecast[];
}

function readCache(address: string): DayForecast[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as WeatherCache;
    if (cache.address !== address) return null;
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
    return cache.days;
  } catch {
    return null;
  }
}

function writeCache(address: string, days: DayForecast[]): void {
  try {
    const cache: WeatherCache = { address, fetchedAt: Date.now(), days };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort — a full/blocked localStorage just means no cache, not a failure
  }
}

/**
 * The Dashboard Weather Strip's single entry point. Returns null (never
 * throws) on a blank address, a geocoding miss, or any network failure — the
 * caller hides the strip rather than rendering an error state.
 */
export async function getWeatherStrip(address: string): Promise<DayForecast[] | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const cached = readCache(trimmed);
  if (cached) return cached;

  try {
    const coords = await geocode(trimmed);
    if (!coords) return null;
    const days = await fetchForecast(coords);
    if (days.length === 0) return null;
    writeCache(trimmed, days);
    return days;
  } catch {
    return null;
  }
}
