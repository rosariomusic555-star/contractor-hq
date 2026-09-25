-- ContractorHQ — purpose-built measurement cards per project feature.
-- Run AFTER 0097.
--
-- Replaces the generic label + quantity + unit fields that every build type
-- used on the Measurements card (opportunity + project pages) with typed
-- feature instances: one row per patio / wall / kitchen…, holding
--   * data   — the card's typed input (method, shape, dimensions…); its
--              shape per build type is defined in src/lib/measurements.ts
--   * totals — what the app computed from `data` on save (area_sqft,
--              perimeter_ft, linear_ft, wall_sqft, footprint_sqft,
--              height_in, fixture_count, step_count, tread_lf). Written by
--              the app so SQL / reporting can read sizes without
--              re-implementing the geometry.
--
-- project_measurements (0091) is KEPT, for custom measurements only
-- (label + quantity + unit, informational — "Border pavers 82 LF"). This
-- migration moves its structured rows (build-type config fields) into the
-- new table where they map cleanly, and turns every other structured row
-- into a custom row in place. Nothing is deleted without being copied.
--
-- projects.size_sqft is still written by the app on save (paver patio +
-- walkway + driveway area) for the Labor page's productivity metrics.

create table public.project_feature_measurements (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  build_type  text not null,
  label       text,
  data        jsonb not null default '{}'::jsonb,
  totals      jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.project_feature_measurements (project_id);

create trigger project_feature_measurements_set_updated_at before update on public.project_feature_measurements
  for each row execute function public.set_updated_at();

alter table public.project_feature_measurements enable row level security;

create policy "own" on public.project_feature_measurements for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.project_feature_measurements from anon;

create policy "employees excluded" on public.project_feature_measurements
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- ---------------------------------------------------------------------------
-- Backfill. The (build_type, field_key) pairs below are exactly what
-- src/lib/measurements.ts's old BUILD_TYPE_MEASUREMENTS config wrote.
-- ---------------------------------------------------------------------------

create temporary table _mapped (build_type text, field_key text);
insert into _mapped values
  ('paver_patio', 'area_sqft'),
  ('walkway', 'area_sqft'),
  ('driveway', 'area_sqft'),
  ('retaining_wall', 'length_lf'),
  ('retaining_wall', 'height_ft'),
  ('seating_wall', 'length_lf'),
  ('seating_wall', 'height_in'),
  ('outdoor_kitchen', 'counter_length_lf'),
  ('fire_pit', 'shape'),
  ('fire_pit', 'diameter_ft'),
  ('fire_pit', 'width_ft'),
  ('fire_pit', 'length_ft'),
  ('steps', 'step_count'),
  ('steps', 'width_ft'),
  ('outdoor_lighting', 'fixture_count');

-- 1. One instance per (project, build type) that had any mapped value.
with g as (
  select
    m.project_id,
    m.build_type,
    max(m.value) filter (where m.field_key = 'area_sqft')         as area_sqft,
    max(m.value) filter (where m.field_key = 'length_lf')         as length_lf,
    max(m.value) filter (where m.field_key = 'height_ft')         as height_ft,
    max(m.value) filter (where m.field_key = 'height_in')         as height_in,
    max(m.value) filter (where m.field_key = 'counter_length_lf') as counter_length_lf,
    max(m.value_text) filter (where m.field_key = 'shape')        as shape,
    max(m.value) filter (where m.field_key = 'diameter_ft')       as diameter_ft,
    max(m.value) filter (where m.field_key = 'width_ft')          as width_ft,
    max(m.value) filter (where m.field_key = 'length_ft')         as length_ft,
    max(m.value) filter (where m.field_key = 'step_count')        as step_count,
    max(m.value) filter (where m.field_key = 'fixture_count')     as fixture_count
  from public.project_measurements m
  join _mapped x on x.build_type = m.build_type and x.field_key = m.field_key
  where m.value is not null or m.value_text is not null
  group by m.project_id, m.build_type
)
insert into public.project_feature_measurements (project_id, build_type, data, totals)
select
  g.project_id,
  g.build_type,
  case g.build_type
    -- A single stored area → the "Total sq ft" method.
    when 'paver_patio' then jsonb_build_object('method', 'total', 'total_sqft', g.area_sqft, 'shape', 'rectangle')
    when 'walkway'     then jsonb_build_object('method', 'total', 'total_sqft', g.area_sqft)
    when 'driveway'    then jsonb_build_object('method', 'total', 'total_sqft', g.area_sqft)
    when 'retaining_wall' then jsonb_build_object('method', 'lf_height', 'length_lf', g.length_lf, 'height_ft', g.height_ft)
    when 'seating_wall' then jsonb_build_object(
      'height_in', g.height_in,
      'per_section_height', false,
      'sections', case when g.length_lf is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'label', '', 'length_lf', g.length_lf, 'geometry', 'straight', 'height_in', null)) end)
    when 'outdoor_kitchen' then jsonb_build_object(
      'layout', 'straight',
      'runs', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'length_ft', g.counter_length_lf)))
    when 'fire_pit' then jsonb_build_object(
      'shape', case when g.shape = 'square' then 'rect' else 'round' end,
      'diameter_ft', g.diameter_ft, 'length_ft', g.length_ft, 'width_ft', g.width_ft,
      'description', '', 'approx_sqft', null, 'height_in', null)
    when 'steps' then jsonb_build_object(
      'sections', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'label', '', 'step_count', g.step_count, 'width_ft', g.width_ft)))
    when 'outdoor_lighting' then jsonb_build_object(
      -- The old field was a bare count with no fixture type.
      'fixtures', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', 'other', 'name', 'Fixtures', 'qty', g.fixture_count)))
  end,
  -- totals, same math as computeTotals() for these simple cases; the app
  -- rewrites them the next time the card is saved.
  jsonb_strip_nulls(case g.build_type
    when 'paver_patio' then jsonb_build_object('area_sqft', g.area_sqft)
    when 'walkway'     then jsonb_build_object('area_sqft', g.area_sqft)
    when 'driveway'    then jsonb_build_object('area_sqft', g.area_sqft)
    when 'retaining_wall' then jsonb_build_object(
      'linear_ft', g.length_lf, 'wall_sqft', g.length_lf * g.height_ft, 'height_in', g.height_ft * 12)
    when 'seating_wall' then jsonb_build_object('linear_ft', g.length_lf, 'height_in', g.height_in)
    when 'outdoor_kitchen' then jsonb_build_object('linear_ft', g.counter_length_lf)
    when 'fire_pit' then case
      when g.shape = 'square' then jsonb_build_object(
        'footprint_sqft', g.length_ft * g.width_ft, 'perimeter_ft', 2 * (g.length_ft + g.width_ft))
      else jsonb_build_object(
        'footprint_sqft', round(pi()::numeric * (g.diameter_ft / 2) ^ 2, 2), 'perimeter_ft', round(pi()::numeric * g.diameter_ft, 2))
      end
    when 'steps' then jsonb_build_object('step_count', g.step_count, 'tread_lf', g.step_count * g.width_ft)
    when 'outdoor_lighting' then jsonb_build_object('fixture_count', g.fixture_count)
  end)
from g;

-- 2. Mapped rows now live in project_feature_measurements.
delete from public.project_measurements m
using _mapped x
where x.build_type = m.build_type and x.field_key = m.field_key;

-- 3. Every other structured row (outdoor kitchen counter depth, lighting
--    wire run, pillars count/height, anything unexpected) becomes a custom
--    measurement on the same feature, labelled with the old field's name.
update public.project_measurements
set
  label = coalesce(label, case field_key
    when 'counter_depth_in' then 'Counter depth'
    when 'wire_run_lf'      then 'Wire run'
    when 'count'            then 'Count'
    when 'height_in'        then 'Height'
    when 'height_ft'        then 'Height'
    when 'length_lf'        then 'Length'
    else initcap(replace(field_key, '_', ' '))
  end),
  field_key = 'custom_' || replace(gen_random_uuid()::text, '-', '')
where field_key not like 'custom\_%';

drop table _mapped;
