-- ContractorHQ — real, persisted "Quote defaults" (Settings > Quote defaults).
-- Run AFTER 0001–0015.
--
-- One row per user. Backs the Deposit required / Quote validity / Sales tax /
-- Terms fields in Settings, and is read by createQuote() to pre-fill new
-- quotes (deposit_percentage, terms) and by the Quote Builder to compute the
-- sales-tax line and "valid until" date. Waste factor / Labor rate / Material
-- markup were removed from Settings (never fed any real calculation) and
-- have no column here.

create table if not exists public.quote_defaults (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  deposit_pct         numeric not null default 30,
  quote_validity_days integer not null default 14,
  sales_tax_pct       numeric not null default 6.25,
  terms               text,
  updated_at          timestamptz not null default now()
);

create trigger quote_defaults_set_updated_at before update on public.quote_defaults
  for each row execute function public.set_updated_at();

alter table public.quote_defaults enable row level security;

create policy "own" on public.quote_defaults for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.quote_defaults from anon;
