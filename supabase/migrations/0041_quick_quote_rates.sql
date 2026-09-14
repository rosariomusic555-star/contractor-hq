-- ContractorHQ — Quick Quote (Quotes feature): per-contractor default
-- pricing rate per build type. Run AFTER 0001-0040.
--
-- Completely separate from smart_section_settings (0040) — that's line-
-- item templates/calculator numbers for the Materials Sheet; this is a
-- single $ rate used to price one lump-sum quote line item. The two
-- features share the same build-type taxonomy (Paver Patio, Outdoor
-- Kitchen, Seating Wall, Fire Pit, Outdoor Lighting) but no data.
--
-- Pricing UNIT (sq ft / linear ft / fixture) is a structural property of
-- the build type itself (src/lib/quickQuote/), not stored here — only the
-- $ rate is a per-contractor preference. Every build type ships a
-- standard default rate; a missing row here just means "use the app
-- default" (see resolveQuickQuoteRate in src/lib/quickQuote/index.ts).

create table public.quick_quote_rates (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  build_type  text not null,
  rate        numeric not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, build_type)
);

alter table public.quick_quote_rates enable row level security;

create policy "own" on public.quick_quote_rates for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.quick_quote_rates from anon;
