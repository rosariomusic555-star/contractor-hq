-- Materials Sheets: promotes "the Materials Sheet" from an implicit flat
-- per-project list of sections into an explicit, possibly-multiple document
-- per project. Scenario: a project's scope grows mid-way (a genuinely
-- separate added feature of the project, not a change order tacked onto
-- existing scope) and needs its own material sheet — and usually its own
-- quote — for that added piece.
--
-- Existing sections are backfilled under one default sheet per project, so
-- every project that already has a materials sheet keeps behaving exactly
-- as it did before this migration (single implicit sheet, no linking UI).

create table public.materials_sheets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null default 'Materials sheet',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index on public.materials_sheets (project_id);

alter table public.materials_sheets enable row level security;
create policy "own" on public.materials_sheets for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
revoke all on public.materials_sheets from anon;

-- materials_sections now belongs to a sheet. project_id stays too — a
-- denormalized whole-project aggregate key (unchanged meaning, still used
-- by listMaterials(projectId) for project-level totals); sheet_id is the
-- new per-sheet grouping key the sheet builder filters on.
alter table public.materials_sections
  add column sheet_id uuid references public.materials_sheets (id) on delete cascade;

-- Backfill: one default sheet per project that already has any sections.
insert into public.materials_sheets (project_id, name, sort_order)
select distinct project_id, 'Materials sheet', 0
from public.materials_sections;

update public.materials_sections ms
set sheet_id = sh.id
from public.materials_sheets sh
where sh.project_id = ms.project_id;

alter table public.materials_sections alter column sheet_id set not null;
create index on public.materials_sections (sheet_id);

-- Quote <-> Materials Sheet link (0042). One-to-one: a sheet feeds at most
-- one quote's Estimated Cost. Deleting a sheet clears the link (ON DELETE
-- SET NULL) rather than erroring — the quote's Estimated Cost reverts to
-- "Not available". The partial unique index (rather than a plain unique
-- constraint) still allows any number of quotes with no link (null).
alter table public.quotes
  add column material_sheet_id uuid references public.materials_sheets (id) on delete set null;
create unique index quotes_material_sheet_id_key
  on public.quotes (material_sheet_id) where material_sheet_id is not null;
create index on public.quotes (material_sheet_id);
