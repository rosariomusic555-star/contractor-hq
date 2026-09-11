-- ContractorHQ — Materials Sheet Smart Calculator scaffolding. Run AFTER
-- 0001-0033.
--
-- Two additions, both deliberately minimal:
--
-- 1. price_book gains product specs, so a specific SKU can drive a real
--    order-quantity calculation instead of a generic estimate:
--      - material_type: which role this product plays (e.g. "paver",
--        "base_aggregate", "bedding_sand", "polymeric_sand",
--        "edge_restraint") — free text, not a CHECK-constrained enum,
--        since the known set grows every time a new build-type calculator
--        is added and a DB constraint would mean a migration each time.
--        The canonical list of currently-known values lives in
--        src/lib/materialsCalculators/materialTypes.ts, not here.
--      - specs: flexible per-type product data (coverage per pallet,
--        units per pallet, dimensions, joint width, etc.) as JSONB rather
--        than fixed columns — different material_types need entirely
--        different spec shapes, and JSONB absorbs a new key without a
--        migration. Exact keys are defined in application code.
--
-- 2. A new material_defaults table (one row per user, same shape/pattern
--    as quote_defaults, 0016) for construction/calculation assumptions —
--    waste factor, base depth. Deliberately NOT folded into quote_defaults:
--    that table is about quote terms/money, this is about material
--    calculation assumptions — a different category of setting, even
--    though both are "defaults." Its own Settings page
--    (SettingsMaterialDefaultsView.tsx), not a new top-level concept.

alter table public.price_book add column if not exists material_type text;
alter table public.price_book add column if not exists specs jsonb not null default '{}'::jsonb;

create table public.material_defaults (
  user_id                uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  waste_factor_pct       numeric not null default 10,
  base_depth_default_in  numeric,
  updated_at             timestamptz not null default now()
);

alter table public.material_defaults enable row level security;

create policy "own" on public.material_defaults for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.material_defaults from anon;
