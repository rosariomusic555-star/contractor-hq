-- ContractorHQ — Seasonal Backlog card (Dashboard hardscape pass, part 2).
-- Run AFTER 0053.
--
-- One row per user, same shape as quote_defaults (0016). Backs the
-- "capacity per month" figure the Seasonal Backlog card compares committed
-- dollars against, editable in Settings > Seasonal capacity. Measured in
-- dollars, not job count — job count has no reliable real-data backing
-- (crew size is presentation-only demo data, see src/lib/demoData.ts).

create table if not exists public.backlog_settings (
  user_id                    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  capacity_dollars_per_month numeric not null default 50000,
  updated_at                 timestamptz not null default now()
);

create trigger backlog_settings_set_updated_at before update on public.backlog_settings
  for each row execute function public.set_updated_at();

alter table public.backlog_settings enable row level security;

create policy "own" on public.backlog_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.backlog_settings from anon;
