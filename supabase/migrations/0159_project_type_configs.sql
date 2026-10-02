-- 0159 — Custom project type setups (Settings › Project types › Set up).
--
-- A contractor-made project type (one whose name doesn't match a built-in
-- type) can get what built-in types have, without code:
--   fields       — its measurement card, from building blocks
--                  [{ key, kind, label, unit?, options? }]
--   summary_keys — which totals the collapsed card shows
--   line_items   — the Cost plan section it starts with
--                  [{ id, name, cost_type, formula? }]; a formula is
--                  qty = total × factor or total ÷ factor (rounded up or not)
--   tunables     — named numbers the formulas use [{ key, label, unit, value }]
--   quick_quote  — { total_key, rate, unit_label } (a rate per sq ft / LF / each)
--   based_on     — the built-in type it was copied from, if any (info only)
-- Keyed by the type's id, so renaming the type never loses its setup. One
-- row per type; the type's owner only (employees never read it).
--
-- Measurement rows of these types use build_type 'cfg:<category id>'; Cost
-- plan sections smart_section_build_type and quote lines
-- quick_quote_build_type use the same id. No other table changes.

create table if not exists public.project_type_configs (
  category_id  uuid primary key references public.categories (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  based_on     text,
  fields       jsonb not null default '[]'::jsonb,
  summary_keys jsonb not null default '[]'::jsonb,
  line_items   jsonb not null default '[]'::jsonb,
  tunables     jsonb not null default '[]'::jsonb,
  quick_quote  jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists project_type_configs_set_updated_at on public.project_type_configs;
create trigger project_type_configs_set_updated_at before update on public.project_type_configs
  for each row execute function public.set_updated_at();

alter table public.project_type_configs enable row level security;

drop policy if exists "own" on public.project_type_configs;
create policy "own" on public.project_type_configs for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
  );

revoke all on public.project_type_configs from anon;
