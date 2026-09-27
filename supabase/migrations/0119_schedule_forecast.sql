-- ContractorHQ — Forecast on the schedule (weather on scheduled work days).
-- Run AFTER 0001-0118.
--
-- Display + flags only. Forecasts come from the National Weather Service
-- (api.weather.gov — free, public-domain, no key) and addresses are
-- geocoded with the US Census geocoder (free, public-domain, storable),
-- both called ONLY from the `weather-forecast` Edge Function — never from
-- the browser.
--
--   projects / appointments / business_profile
--       + lat, lng, geocoded_address, geocode_status, geocoded_at
--       Geocoded once (first forecast request); re-geocoded only when
--       `address` no longer matches `geocoded_address`. A failed lookup is
--       remembered too, so a bad address isn't retried until it's edited.
--
--   weather_cache   one row per ROUNDED location (0.05° ≈ 5 km), shared by
--                   every project in that area: the NWS grid lookup (kept
--                   for good) + the normalized forecast (expires after 2 h).
--                   No user data. Only the Edge Function (service role)
--                   touches it — RLS on, no policies.
--
--   business_profile  + per-contractor risk thresholds (Settings › Schedule
--                     & weather): rain % (60), rain amount in (0.25), and
--                     toggles for thunderstorms / snow & freezing / heat.
--
--   notification_settings + weather_risk (morning "newly risky" alerts)

alter table public.projects
  add column if not exists lat              double precision,
  add column if not exists lng              double precision,
  add column if not exists geocoded_address text,
  add column if not exists geocode_status   text check (geocode_status in ('ok', 'failed')),
  add column if not exists geocoded_at      timestamptz;

alter table public.appointments
  add column if not exists lat              double precision,
  add column if not exists lng              double precision,
  add column if not exists geocoded_address text,
  add column if not exists geocode_status   text check (geocode_status in ('ok', 'failed')),
  add column if not exists geocoded_at      timestamptz;

alter table public.business_profile
  add column if not exists lat              double precision,
  add column if not exists lng              double precision,
  add column if not exists geocoded_address text,
  add column if not exists geocode_status   text check (geocode_status in ('ok', 'failed')),
  add column if not exists geocoded_at      timestamptz,
  add column if not exists weather_rain_pct      int     not null default 60   check (weather_rain_pct between 1 and 100),
  add column if not exists weather_rain_in       numeric not null default 0.25 check (weather_rain_in > 0),
  add column if not exists weather_flag_thunder  boolean not null default true,
  add column if not exists weather_flag_freeze   boolean not null default true,
  add column if not exists weather_flag_heat     boolean not null default true,
  add column if not exists weather_heat_f        int     not null default 95   check (weather_heat_f between 70 and 130);

alter table public.notification_settings
  add column if not exists weather_risk boolean not null default true;

create table if not exists public.weather_cache (
  loc_key     text primary key,           -- "42.35,-72.65" (rounded to 0.05°)
  lat         double precision not null,
  lng         double precision not null,
  provider    text not null default 'nws',
  grid_id     text,                        -- NWS office, e.g. "BOX"
  grid_x      int,
  grid_y      int,
  time_zone   text,                        -- IANA, from NWS /points
  forecast    jsonb,                       -- normalized (see the Edge Function)
  fetched_at  timestamptz,
  expires_at  timestamptz,
  last_error  text,
  updated_at  timestamptz not null default now()
);

alter table public.weather_cache enable row level security;
revoke all on public.weather_cache from anon, authenticated;
