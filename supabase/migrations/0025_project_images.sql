-- ContractorHQ — photo gallery on a project (progress photos, before/after,
-- site conditions). Multiple per project, each with an optional caption.
-- Run AFTER 0023.
--
-- `storage_path` points into the `images` bucket (0023), always under
-- `projects/{project_id}/...` — see 0024's header comment re: the same
-- storage-cleanup-on-delete caveat (deleteProjectImage/deleteProject in
-- src/lib/api.ts must explicitly remove the storage object; cascade here
-- only removes the DB row).

create table public.project_images (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index on public.project_images (project_id);

alter table public.project_images enable row level security;

-- Same "own" pattern as materials_sections (0003) — ownership through the
-- parent project. No anon policy — never public.
create policy "own" on public.project_images for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.project_images from anon;
