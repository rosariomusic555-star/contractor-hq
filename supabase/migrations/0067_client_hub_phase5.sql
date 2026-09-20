-- ContractorHQ — Client Hub, Phase 5 (messaging + client photo uploads).
-- Run AFTER 0066.
--
-- Two new things, same authorization shape as every earlier Client Hub
-- migration: portal writes go through SECURITY DEFINER functions scoped to
-- the caller's own verified JWT email, never a client-supplied id alone.
--
-- 1. Client photo uploads land in the SAME project_images table the
--    contractor's own gallery already uses (not a parallel table) —
--    uploaded_by_client + accepted (default true, so every existing/
--    contractor-uploaded row is unaffected) distinguish "from client,
--    pending review" from everything else. They never auto-publish: the
--    contractor accepts them explicitly (src/lib/api.ts
--    acceptProjectImage()), same as client_visible (0064) defaults hidden.
--
-- 2. project_messages is a new, dedicated table for the per-project thread
--    — deliberately NOT reusing the `activities` log (that's a flat,
--    contractor-only manual log of calls/notes/etc, not a two-way thread).
--    Every message sent (either direction) also writes a matching
--    `activities` row so it surfaces in the EXISTING Communications page
--    and the client's own Activity card without a second inbox to check.

alter table public.project_images
  add column if not exists uploaded_by_client boolean not null default false,
  add column if not exists accepted boolean not null default true;

create table public.project_messages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender     text not null check (sender in ('contractor', 'client')),
  body       text,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index on public.project_messages (project_id, created_at);

alter table public.project_messages enable row level security;

create policy "own" on public.project_messages for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.project_messages from anon;

-- ---------------------------------------------------------------------------
-- Storage RLS — a portal client can now WRITE into the same projects/...
-- prefix the contractor's own gallery uses (their photo submission), and
-- READ BACK their own pending submissions (client_visible/accepted don't
-- apply yet, so 0064's read policy alone wouldn't cover this).
-- ---------------------------------------------------------------------------

create policy "portal client project image upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.projects p
      join public.clients c on c.id = p.client_id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "portal own uploaded project images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1
      from public.project_images pi
      join public.projects p on p.id = pi.project_id
      join public.clients c on c.id = p.client_id
      where pi.storage_path = storage.objects.name
        and pi.uploaded_by_client = true
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Message image attachments — a client needs to read images THEY attached,
-- and the ones the contractor attached back, for the same thread.
create policy "portal message images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'project-messages'
    and exists (
      select 1
      from public.project_messages m
      join public.projects p on p.id = m.project_id
      join public.clients c on c.id = p.client_id
      where storage.objects.name = any (m.image_paths)
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "portal message image upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'project-messages'
    and exists (
      select 1 from public.projects p
      join public.clients c on c.id = p.client_id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Contractor's own side of the same thread — read what either party
-- attached, and attach their own replies.
create policy "own message images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'project-messages'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

create policy "own message image insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'project-messages'
    and exists (
      select 1 from public.projects p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.portal_add_project_image(
  p_project_id uuid,
  p_storage_path text,
  p_caption text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_images (project_id, storage_path, caption, uploaded_by_client, accepted, client_visible)
  select p_project_id, p_storage_path, nullif(trim(p_caption), ''), true, false, false
  from public.projects p
  join public.clients c on c.id = p.client_id
  where p.id = p_project_id
    and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$$;

grant execute on function public.portal_add_project_image(uuid, text, text) to authenticated;

create or replace function public.get_portal_messages(p_project_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id, 'sender', m.sender, 'body', m.body,
      'image_paths', m.image_paths, 'created_at', m.created_at
    ) order by m.created_at
  ), '[]'::jsonb)
  from public.project_messages m
  join public.projects p on p.id = m.project_id
  join public.clients c on c.id = p.client_id
  where m.project_id = p_project_id
    and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function public.get_portal_messages(uuid) to authenticated;

create or replace function public.portal_send_message(
  p_project_id uuid,
  p_body text,
  p_image_paths text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_client_id uuid;
begin
  select p.user_id, p.client_id into v_owner_id, v_client_id
  from public.projects p
  join public.clients c on c.id = p.client_id
  where p.id = p_project_id
    and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));

  if v_owner_id is null then
    return;
  end if;

  insert into public.project_messages (project_id, user_id, sender, body, image_paths)
  values (p_project_id, v_owner_id, 'client', nullif(trim(p_body), ''), coalesce(p_image_paths, '{}'));

  if v_client_id is not null then
    insert into public.activities (client_id, project_id, created_by, kind, summary)
    values (
      v_client_id, p_project_id, v_owner_id, 'text',
      'Message from client: ' || left(coalesce(nullif(trim(p_body), ''), '(photo)'), 140)
    );
  end if;
end;
$$;

grant execute on function public.portal_send_message(uuid, text, text[]) to authenticated;
