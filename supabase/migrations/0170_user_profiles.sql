-- 0170 — user_profiles: the signed-in person's own name (Settings › My
-- profile), separate from the business profile. Drives the Dashboard
-- greeting ("Good afternoon, Jose"), the sidebar user block and anywhere a
-- person (not the company) is named.
--
-- One row per owner login. Crew / employee logins don't get one — their
-- name is employees.name, set by the owner. Names typed at sign-up arrive in
-- raw_user_meta_data (first_name / last_name) and are copied in by the
-- trigger below, so they're there even when sign-up needs email confirmation
-- (no session yet to write the row from the client).
--
-- Photo: images bucket, avatars/{user_id}/{uuid}.jpg (own folder only).

create table if not exists public.user_profiles (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  first_name  text,
  last_name   text,
  phone       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
drop policy if exists "own" on public.user_profiles;
create policy "own" on public.user_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- New owner sign-ups: copy the name from the sign-up form.
create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, first_name, last_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row
  when (coalesce(new.raw_user_meta_data ->> 'account_type', '') not in ('employee', 'client'))
  execute function public.create_user_profile();

-- Existing owners: a row each (names from metadata when there are any —
-- usually none, the app never saved them before).
insert into public.user_profiles (user_id, first_name, last_name)
select u.id,
       nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
       nullif(btrim(u.raw_user_meta_data ->> 'last_name'), '')
  from auth.users u
 where coalesce(u.raw_user_meta_data ->> 'account_type', '') not in ('employee', 'client')
   and not exists (select 1 from public.employees e where e.auth_user_id = u.id)
on conflict (user_id) do nothing;

-- Profile photos: own folder only.
drop policy if exists "own avatar read" on storage.objects;
create policy "own avatar read" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "own avatar insert" on storage.objects;
create policy "own avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = 'avatars'
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);
