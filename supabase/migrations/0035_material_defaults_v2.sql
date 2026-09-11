-- ContractorHQ — revise material_defaults for the real Paver Patio
-- formulas. Run AFTER 0001-0034.
--
-- base_depth_default_in is dropped: the compacted-aggregate base depth
-- varies job to job with no sane universal default, so it's now a plain
-- required dimension-form input (paverPatio.ts), never pre-filled.
--
-- Three new editable defaults, all pre-fill a per-job dimension-form field
-- (editable per job, same pattern as waste_factor_pct) rather than being
-- silently applied — real-world coverage rates vary by supplier/product.

alter table public.material_defaults drop column if exists base_depth_default_in;

alter table public.material_defaults
  add column if not exists bedding_sand_depth_in numeric not null default 1;

alter table public.material_defaults
  add column if not exists bedding_sand_coverage_sqft_per_ton numeric not null default 200;

alter table public.material_defaults
  add column if not exists polymeric_sand_coverage_sqft_per_bag numeric not null default 80;
