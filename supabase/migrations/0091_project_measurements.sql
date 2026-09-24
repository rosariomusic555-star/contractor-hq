-- ContractorHQ — structured project measurements, grouped per build type.
-- Run AFTER 0090.
--
-- Replaces the single projects.size_sqft input on the Measurements card
-- (opportunity + project pages) with one group of fields per selected
-- Project type. The field config (which build type asks for what) lives in
-- the app, src/lib/measurements.ts — this table just stores values.
--
-- A row belongs to exactly one group:
--   * build_type set   -> a build type from src/lib/buildTypes.ts
--                         (e.g. 'paver_patio'); field_key is a config key
--                         ('area_sqft') or a free row ('custom_<uuid>')
--   * category_id set  -> a Job Category that maps to no build type
--                         (e.g. 'Drainage'); free rows only
--   * neither          -> the "General" group (free rows only)
-- Deselecting a Project type only hides its group in the UI; rows stay, so
-- re-adding the type brings the values back.
--
-- projects.size_sqft is KEPT — the app writes the total sq ft across the
-- visible groups back into it on every save, so the Labor page's
-- productivity metrics (0085) keep reading one number unchanged.

create table public.project_measurements (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  build_type  text,
  category_id uuid references public.categories (id) on delete set null,
  field_key   text not null,
  label       text,
  value       numeric,
  value_text  text,
  unit        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (build_type is null or category_id is null)
);

create index on public.project_measurements (project_id);

create trigger project_measurements_set_updated_at before update on public.project_measurements
  for each row execute function public.set_updated_at();

alter table public.project_measurements enable row level security;

create policy "own" on public.project_measurements for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.project_measurements from anon;

create policy "employees excluded" on public.project_measurements
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

-- Backfill: every existing size_sqft goes into the Paver Patio group's Area
-- field when the project has a Paver Patio-type category selected (same
-- name matching as buildTypeForCategoryName() + BUILD_TYPE_ALIASES), else
-- into a free "Area" (sq ft) row in the General group — nothing is lost.
insert into public.project_measurements (project_id, build_type, field_key, value, unit)
select p.id, 'paver_patio', 'area_sqft', p.size_sqft, 'sq_ft'
from public.projects p
where p.size_sqft is not null
  and exists (
    select 1
    from public.project_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.project_id = p.id
      and regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g') in ('paverpatio', 'patio', 'pavers', 'paver')
  );

insert into public.project_measurements (project_id, field_key, label, value, unit)
select p.id, 'custom_' || replace(gen_random_uuid()::text, '-', ''), 'Area', p.size_sqft, 'sq_ft'
from public.projects p
where p.size_sqft is not null
  and not exists (select 1 from public.project_measurements m where m.project_id = p.id);
