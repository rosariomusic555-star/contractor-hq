-- ContractorHQ — crew work hours (Settings > Business profile).
--
-- Backs the Dashboard Weather Strip's work-hours rain breakout: rain at
-- 2am doesn't stop a crew, rain at 10am does, so the headline % on each
-- day tile needs to be scoped to "when the crew is actually outside,"
-- which is configurable per contractor (a crew starting at 6am should see
-- their own hours reflected). Stored as plain "HH:MM" text — same format
-- the existing Appointments "Time" <input type="time"> already uses in
-- this codebase — rather than a Postgres `time` type, so there's no
-- server-side round-trip formatting (Postgres time columns come back with
-- seconds, e.g. "07:00:00") to strip on every read.

alter table public.business_profile
  add column if not exists crew_start_time text not null default '07:00',
  add column if not exists crew_end_time text not null default '17:00';
