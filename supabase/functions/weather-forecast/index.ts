// ContractorHQ — Forecast on the schedule (0119). The ONLY place the app
// talks to a weather or geocoding provider; the browser never does.
//
// Providers (both free, public-domain, no API key, fine for commercial use):
//   * Geocoding — US Census geocoder (geocoding.geo.census.gov). Street-level,
//     US only. Results are stored on the row (projects / appointments /
//     business_profile) and only re-geocoded when the address text changes.
//   * Forecast  — National Weather Service (api.weather.gov). US only, ~7
//     days, hourly precipitation chance + amount + temperature. NWS asks for
//     an identifying User-Agent (set NWS_CONTACT as a function secret to add
//     a contact email/URL to it).
//
// Caching: `weather_cache`, one row per location rounded to 0.05° (~5 km) so
// every job in the same area shares one fetch. The NWS grid lookup is kept
// for good; the forecast itself expires after 2 hours. On a provider error a
// cached forecast up to 12 h old is served (marked stale) rather than
// nothing. Days past the provider's range are simply absent — never guessed.
//
// Access: the caller's own JWT picks which rows they can see (RLS — an
// employee only gets their assigned projects). The service-role client is
// used for exactly two things: writing geocode columns back onto rows the
// caller could already read, and the shared weather_cache table.
//
// Request:  { projects?: string[], appointments?: string[], business?: boolean }
// Response: { ok, settings, forecasts: { [loc]: Forecast }, projects: { [id]: Target },
//             appointments: { [id]: Target }, business: Target | null }

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const FORECAST_TTL_MS = 2 * 60 * 60 * 1000;
const STALE_OK_MS = 12 * 60 * 60 * 1000;
const MAX_IDS = 100;
const USER_AGENT = `(ContractorHQ weather-forecast${Deno.env.get("NWS_CONTACT") ? `, ${Deno.env.get("NWS_CONTACT")}` : ""})`;

type TargetStatus = "ok" | "no_address" | "geocode_failed" | "unsupported" | "unavailable";
interface Target {
  status: TargetStatus;
  loc?: string;
}

type Condition =
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

interface ForecastDay {
  date: string;
  condition: Condition;
  highF: number | null;
  lowF: number | null;
  /** Max hourly precipitation chance across the whole day. */
  popMax: number;
  /** Expected precipitation for the whole day, inches (liquid equivalent). */
  rainIn: number;
  thunder: boolean;
  snow: boolean;
  ice: boolean;
  /** 24 entries by local hour; null where the provider has no data (past hours today). */
  hourlyPop: (number | null)[];
  hourlyRainIn: (number | null)[];
  hourlyTempF: (number | null)[];
}

interface Forecast {
  provider: "nws";
  timeZone: string;
  fetchedAt: string;
  stale?: boolean;
  days: ForecastDay[];
}

// ---------------------------------------------------------------------------
// Geocoding (US Census)
// ---------------------------------------------------------------------------

type GeocodeOutcome = { kind: "ok"; lat: number; lng: number } | { kind: "no_match" } | { kind: "error" };

async function geocodeCensus(address: string): Promise<GeocodeOutcome> {
  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" +
    encodeURIComponent(address);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { kind: "error" };
    const body = await res.json();
    const match = body?.result?.addressMatches?.[0]?.coordinates;
    if (!match || typeof match.x !== "number" || typeof match.y !== "number") return { kind: "no_match" };
    return { kind: "ok", lat: match.y, lng: match.x };
  } catch {
    return { kind: "error" };
  }
}

// ---------------------------------------------------------------------------
// NWS forecast → normalized days
// ---------------------------------------------------------------------------

const round05 = (v: number) => Math.round(v * 20) / 20;
const locKeyFor = (lat: number, lng: number) => `${round05(lat).toFixed(2)},${round05(lng).toFixed(2)}`;

async function nwsGet(path: string): Promise<{ status: number; body: any }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.weather.gov${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status >= 500 && attempt === 0) continue; // NWS has sporadic 5xx; one retry
      const body = res.ok ? await res.json() : null;
      return { status: res.status, body };
    } catch {
      if (attempt === 1) return { status: 0, body: null };
    }
  }
  return { status: 0, body: null };
}

/** "PT1H", "PT6H", "P1DT6H" → hours. */
export function durationHours(d: string): number {
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return 1;
  return Math.max(1, Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + (Number(m[3] ?? 0) > 0 ? 1 : 0));
}

interface HourCell {
  t?: number; // °C
  pop?: number;
  qpfMm?: number;
  sky?: number;
  wx?: { weather: string; coverage: string }[];
}

function expand(series: any, apply: (cell: HourCell, value: any, hours: number) => void, hoursMap: Map<number, HourCell>, fromMs: number, toMs: number) {
  for (const v of series?.values ?? []) {
    const [startIso, dur] = String(v.validTime ?? "").split("/");
    const start = Date.parse(startIso);
    if (Number.isNaN(start)) continue;
    const hours = durationHours(dur ?? "PT1H");
    for (let h = 0; h < hours; h++) {
      const ms = start + h * 3_600_000;
      if (ms < fromMs || ms > toMs) continue;
      const cell = hoursMap.get(ms) ?? {};
      apply(cell, v.value, hours);
      hoursMap.set(ms, cell);
    }
  }
}

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
const mmToIn = (mm: number) => mm / 25.4;
const round2 = (v: number) => Math.round(v * 100) / 100;

function localParts(ms: number, fmt: Intl.DateTimeFormat): { date: string; hour: number } {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

const THUNDER = new Set(["thunderstorms"]);
const SNOW = new Set(["snow", "snow_showers", "blowing_snow"]);
const ICE = new Set(["freezing_rain", "freezing_drizzle", "freezing_spray", "sleet", "ice_pellets", "ice_crystals"]);
const RAIN = new Set(["rain", "rain_showers"]);
const SHOWERS = new Set(["rain_showers"]);
const DRIZZLE = new Set(["drizzle"]);
const FOG = new Set(["fog", "freezing_fog"]);
const WEAK_COVERAGE = new Set(["slight_chance", "isolated", "patchy"]);

export function normalizeGrid(props: any, timeZone: string, now: number): ForecastDay[] {
  const hoursMap = new Map<number, HourCell>();
  const from = now - 26 * 3_600_000;
  const to = now + 9 * 24 * 3_600_000;
  expand(props.temperature, (c, v) => { if (typeof v === "number") c.t = v; }, hoursMap, from, to);
  expand(props.probabilityOfPrecipitation, (c, v) => { if (typeof v === "number") c.pop = v; }, hoursMap, from, to);
  expand(props.quantitativePrecipitation, (c, v, hours) => { if (typeof v === "number") c.qpfMm = v / hours; }, hoursMap, from, to);
  expand(props.skyCover, (c, v) => { if (typeof v === "number") c.sky = v; }, hoursMap, from, to);
  expand(
    props.weather,
    (c, v) => {
      if (!Array.isArray(v)) return;
      c.wx = v.filter((w: any) => w && w.weather).map((w: any) => ({ weather: String(w.weather), coverage: String(w.coverage ?? "") }));
    },
    hoursMap,
    from,
    to,
  );

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const today = localParts(now, fmt).date;
  const nowHourMs = Math.floor(now / 3_600_000) * 3_600_000;

  const byDate = new Map<string, { hour: number; cell: HourCell }[]>();
  for (const [ms, cell] of [...hoursMap.entries()].sort((a, b) => a[0] - b[0])) {
    const { date, hour } = localParts(ms, fmt);
    if (date < today) continue;
    // Today: only the hours still ahead — past hours aren't a forecast.
    if (date === today && ms < nowHourMs) continue;
    const list = byDate.get(date) ?? [];
    list.push({ hour, cell });
    byDate.set(date, list);
  }

  const days: ForecastDay[] = [];
  for (const [date, list] of [...byDate.entries()].sort()) {
    const withTemp = list.filter((x) => typeof x.cell.t === "number");
    // The last day in range is usually partial — keep it only when it has
    // most of a day's data; today keeps whatever hours are left.
    if (date !== today && withTemp.length < 18) continue;
    if (withTemp.length === 0) continue;

    const hourlyPop: (number | null)[] = new Array(24).fill(null);
    const hourlyRainIn: (number | null)[] = new Array(24).fill(null);
    const hourlyTempF: (number | null)[] = new Array(24).fill(null);
    for (const { hour, cell } of list) {
      if (typeof cell.pop === "number") hourlyPop[hour] = cell.pop;
      if (typeof cell.qpfMm === "number") hourlyRainIn[hour] = round2(mmToIn(cell.qpfMm));
      if (typeof cell.t === "number") hourlyTempF[hour] = cToF(cell.t);
    }
    const temps = withTemp.map((x) => x.cell.t as number);
    const popMax = Math.max(0, ...list.map((x) => x.cell.pop ?? 0));
    const rainIn = round2(mmToIn(list.reduce((s, x) => s + (x.cell.qpfMm ?? 0), 0)));

    const daytime = list.filter((x) => x.hour >= 6 && x.hour <= 20);
    const scope = daytime.length > 0 ? daytime : list;
    const types = new Set<string>();
    const strongTypes = new Set<string>();
    for (const { cell } of list) {
      for (const w of cell.wx ?? []) {
        types.add(w.weather);
        if (!WEAK_COVERAGE.has(w.coverage)) strongTypes.add(w.weather);
      }
    }
    const has = (set: Set<string>, pool: Set<string>) => [...pool].some((t) => set.has(t));
    const meaningful = popMax >= 25;
    const thunder = meaningful && has(THUNDER, strongTypes);
    const snow = meaningful && has(SNOW, types);
    const ice = meaningful && has(ICE, types);

    let condition: Condition;
    if (thunder) condition = "thunderstorms";
    else if (ice) condition = "freezing_rain";
    else if (snow) condition = "snow";
    else if (meaningful && has(RAIN, types)) condition = has(SHOWERS, types) && !types.has("rain") ? "showers" : "rain";
    else if (meaningful && has(DRIZZLE, types)) condition = "drizzle";
    else if (popMax >= 50) condition = "rain";
    else if (has(FOG, strongTypes)) condition = "fog";
    else {
      const skies = scope.map((x) => x.cell.sky).filter((v): v is number => typeof v === "number");
      const sky = skies.length ? skies.reduce((a, b) => a + b, 0) / skies.length : 50;
      condition = sky < 30 ? "clear" : sky < 70 ? "partly_cloudy" : "cloudy";
    }

    days.push({
      date,
      condition,
      highF: cToF(Math.max(...temps)),
      lowF: cToF(Math.min(...temps)),
      popMax: Math.round(popMax),
      rainIn,
      thunder,
      snow,
      ice,
      hourlyPop,
      hourlyRainIn,
      hourlyTempF,
    });
  }
  return days;
}

type ForecastOutcome = { kind: "ok"; forecast: Forecast } | { kind: "unsupported" } | { kind: "unavailable" };

async function forecastFor(admin: SupabaseClient, lat: number, lng: number): Promise<ForecastOutcome> {
  const key = locKeyFor(lat, lng);
  const { data: row } = await admin.from("weather_cache").select("*").eq("loc_key", key).maybeSingle();
  const now = Date.now();

  if (row?.last_error === "unsupported" && !row.grid_id) return { kind: "unsupported" };
  if (row?.forecast && row.expires_at && Date.parse(row.expires_at) > now) {
    return { kind: "ok", forecast: row.forecast as Forecast };
  }

  const fallback = (): ForecastOutcome =>
    row?.forecast && row.fetched_at && now - Date.parse(row.fetched_at) < STALE_OK_MS
      ? { kind: "ok", forecast: { ...(row.forecast as Forecast), stale: true } }
      : { kind: "unavailable" };

  let gridId: string | null = row?.grid_id ?? null;
  let gridX: number | null = row?.grid_x ?? null;
  let gridY: number | null = row?.grid_y ?? null;
  let timeZone: string | null = row?.time_zone ?? null;
  const rlat = round05(lat);
  const rlng = round05(lng);

  if (!gridId) {
    const pts = await nwsGet(`/points/${rlat.toFixed(4)},${rlng.toFixed(4)}`);
    if (pts.status === 404) {
      await admin.from("weather_cache").upsert({ loc_key: key, lat: rlat, lng: rlng, last_error: "unsupported", updated_at: new Date().toISOString() });
      return { kind: "unsupported" };
    }
    const p = pts.body?.properties;
    if (!p?.gridId) return fallback();
    gridId = p.gridId;
    gridX = p.gridX;
    gridY = p.gridY;
    timeZone = p.timeZone ?? "America/New_York";
  }

  const grid = await nwsGet(`/gridpoints/${gridId}/${gridX},${gridY}`);
  if (!grid.body?.properties) {
    await admin.from("weather_cache").upsert({
      loc_key: key, lat: rlat, lng: rlng, grid_id: gridId, grid_x: gridX, grid_y: gridY, time_zone: timeZone,
      forecast: row?.forecast ?? null, fetched_at: row?.fetched_at ?? null, expires_at: row?.expires_at ?? null,
      last_error: `grid ${grid.status}`, updated_at: new Date().toISOString(),
    });
    return fallback();
  }

  const days = normalizeGrid(grid.body.properties, timeZone as string, now);
  const forecast: Forecast = { provider: "nws", timeZone: timeZone as string, fetchedAt: new Date(now).toISOString(), days };
  await admin.from("weather_cache").upsert({
    loc_key: key, lat: rlat, lng: rlng, provider: "nws", grid_id: gridId, grid_x: gridX, grid_y: gridY, time_zone: timeZone,
    forecast, fetched_at: forecast.fetchedAt, expires_at: new Date(now + FORECAST_TTL_MS).toISOString(),
    last_error: null, updated_at: new Date().toISOString(),
  });
  return { kind: "ok", forecast };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface GeoRow {
  id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_address: string | null;
  geocode_status: "ok" | "failed" | null;
}

const GEO_COLS = "address, lat, lng, geocoded_address, geocode_status";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);
  if (!supabaseUrl || !apiKey || !serviceRoleKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  const caller = createClient(supabaseUrl, apiKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: { projects?: string[]; appointments?: string[]; business?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const uuid = /^[0-9a-f-]{36}$/i;
  const projectIds = [...new Set((body.projects ?? []).filter((x) => uuid.test(x)))].slice(0, MAX_IDS);
  const appointmentIds = [...new Set((body.appointments ?? []).filter((x) => uuid.test(x)))].slice(0, MAX_IDS);

  // Whose thresholds/work hours apply: the caller's, or — for an employee —
  // their owner's (weather settings only; nothing else is returned).
  const { data: emp } = await admin.from("employees").select("owner_user_id").eq("auth_user_id", user.id).maybeSingle();
  const settingsOwner = emp?.owner_user_id ?? user.id;
  const { data: bp } = await admin
    .from("business_profile")
    .select("crew_start_time, crew_end_time, weather_rain_pct, weather_rain_in, weather_flag_thunder, weather_flag_freeze, weather_flag_heat, weather_heat_f")
    .eq("user_id", settingsOwner)
    .maybeSingle();
  const settings = {
    rainPct: bp?.weather_rain_pct ?? 60,
    rainIn: Number(bp?.weather_rain_in ?? 0.25),
    thunder: bp?.weather_flag_thunder ?? true,
    freeze: bp?.weather_flag_freeze ?? true,
    heat: bp?.weather_flag_heat ?? true,
    heatF: bp?.weather_heat_f ?? 95,
    workStart: bp?.crew_start_time ?? "07:00",
    workEnd: bp?.crew_end_time ?? "17:00",
  };

  // Rows the caller can see (RLS decides).
  // Crew members (0125) can't read `projects` rows directly any more — check
  // their assignments, then read just the location columns with the service role.
  let projects: GeoRow[] = [];
  if (projectIds.length && emp) {
    const { data: assigned } = await admin
      .from("employee_project_assignments")
      .select("project_id, employees!inner(auth_user_id, status)")
      .eq("employees.auth_user_id", user.id)
      .eq("employees.status", "active")
      .in("project_id", projectIds);
    const ok = (assigned ?? []).map((a: { project_id: string }) => a.project_id);
    projects = ok.length ? ((await admin.from("projects").select(`id, ${GEO_COLS}`).in("id", ok)).data ?? []) : [];
  } else if (projectIds.length) {
    projects = (await caller.from("projects").select(`id, ${GEO_COLS}`).in("id", projectIds)).data ?? [];
  }
  const appointments: GeoRow[] = appointmentIds.length
    ? ((await caller.from("appointments").select(`id, ${GEO_COLS}`).in("id", appointmentIds)).data ?? [])
    : [];
  let businessRow: GeoRow | null = null;
  if (body.business && !emp) {
    const { data } = await caller.from("business_profile").select(`user_id, ${GEO_COLS}`).maybeSingle();
    if (data) businessRow = { ...(data as any), id: (data as any).user_id };
  }

  // Geocode what's new/changed — one Census call per distinct address.
  const geocodeCache = new Map<string, Promise<GeocodeOutcome>>();
  async function resolve(table: "projects" | "appointments" | "business_profile", row: GeoRow): Promise<Target & { lat?: number; lng?: number }> {
    const address = row.address?.trim() ?? "";
    if (!address) return { status: "no_address" };
    if (row.geocoded_address === address && row.geocode_status === "ok" && row.lat != null && row.lng != null) {
      return { status: "ok", lat: row.lat, lng: row.lng };
    }
    if (row.geocoded_address === address && row.geocode_status === "failed") return { status: "geocode_failed" };
    if (!geocodeCache.has(address)) geocodeCache.set(address, geocodeCensus(address));
    const g = await geocodeCache.get(address)!;
    if (g.kind === "error") return { status: "unavailable" }; // network — don't remember as failed
    const idCol = table === "business_profile" ? "user_id" : "id";
    const patch =
      g.kind === "ok"
        ? { lat: g.lat, lng: g.lng, geocoded_address: address, geocode_status: "ok", geocoded_at: new Date().toISOString() }
        : { lat: null, lng: null, geocoded_address: address, geocode_status: "failed", geocoded_at: new Date().toISOString() };
    await admin.from(table).update(patch).eq(idCol, row.id);
    return g.kind === "ok" ? { status: "ok", lat: g.lat, lng: g.lng } : { status: "geocode_failed" };
  }

  const forecasts: Record<string, Forecast> = {};
  const forecastCache = new Map<string, Promise<ForecastOutcome>>();
  async function finish(r: Target & { lat?: number; lng?: number }): Promise<Target> {
    if (r.status !== "ok" || r.lat == null || r.lng == null) return { status: r.status };
    const key = locKeyFor(r.lat, r.lng);
    if (!forecastCache.has(key)) forecastCache.set(key, forecastFor(admin, r.lat, r.lng));
    const f = await forecastCache.get(key)!;
    if (f.kind === "unsupported") return { status: "unsupported" };
    if (f.kind === "unavailable") return { status: "unavailable" };
    forecasts[key] = f.forecast;
    return { status: "ok", loc: key };
  }

  const out = {
    ok: true,
    settings,
    forecasts,
    projects: {} as Record<string, Target>,
    appointments: {} as Record<string, Target>,
    business: null as Target | null,
  };
  await Promise.all([
    ...projects.map(async (p) => { out.projects[p.id] = await finish(await resolve("projects", p)); }),
    ...appointments.map(async (a) => { out.appointments[a.id] = await finish(await resolve("appointments", a)); }),
    (async () => { if (businessRow) out.business = await finish(await resolve("business_profile", businessRow)); })(),
  ]);
  return json(out);
});
