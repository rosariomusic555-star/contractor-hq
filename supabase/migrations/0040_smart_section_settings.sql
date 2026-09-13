-- ContractorHQ — per-contractor Smart Section template customization. Run
-- AFTER 0001-0039.
--
-- Every build type ships with the app's standard line items and standard
-- calculator numbers (hardcoded in src/lib/smartSections/*.ts) so it works
-- out of the box. A contractor can override either (or both) for their own
-- account only — one row per (user, build type), upserted from the
-- template editor (Settings > Manage Smart Section Templates, or the gear
-- icon on the build-type picker). Missing row, or a missing key within
-- line_items/tunables, falls back to the app default — never null-crashes.
--
-- line_items: ordered jsonb array of { slot_key: string | null, name: string }.
--   slot_key ties a row back to a known calculator material slot (so the
--   calculator can still find it after a rename) — null means a pure
--   custom addition the calculator will never compute a quantity for.
--   Missing/removed slots simply aren't present in the array.
-- tunables: jsonb object of { [tunableKey]: number } — only customized
--   keys are present; everything else uses the build type's app default.
--
-- Editing a build type's template/numbers never touches materials_items
-- already created from a past Smart Section — those rows already exist
-- with whatever names/quantities they were given; only sections created
-- (or recalculated) after the edit see the new values. This is a natural
-- consequence of matching-by-name, not special-cased here.

create table public.smart_section_settings (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  build_type  text not null,
  line_items  jsonb,
  tunables    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, build_type)
);

alter table public.smart_section_settings enable row level security;

create policy "own" on public.smart_section_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.smart_section_settings from anon;
