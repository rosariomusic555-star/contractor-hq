-- ContractorHQ — Progress updates in the Client Hub.
-- Run AFTER 0001-0125.
--
--   progress_updates           A post on the job: note, optional feature +
--                              milestone, author (owner or crew member),
--                              status pending (crew, awaiting approval) /
--                              shared (in the Client Hub) / internal.
--   project_images             + progress_update_id (the update's photos are
--                              ordinary project photos), original_path (the
--                              full-size original, contractor-only; the
--                              compressed storage_path is what the Hub gets),
--                              ba_role / ba_feature_id (Before / After).
--   progress_update_comments   Client comments / questions + contractor replies.
--   progress_update_reactions  A client's 👍.
--   progress_settings          Crew updates need approval (on), "let the
--                              client know" prompt (each / daily / never),
--                              milestone presets per build type.
--   portfolio_items            Before/after pairs saved for marketing
--                              (internal); clients.marketing_ok records
--                              consent (from the Hub or by hand).
--
-- Sharing is done by set_progress_update_shared(), which also flips the
-- update's photos' client_visible — the only thing the Hub's Storage policy
-- (0064) lets a client read. Unsharing or deleting takes them back out.

alter table public.project_images
  add column if not exists original_path text,
  add column if not exists ba_role text check (ba_role in ('before', 'after')),
  add column if not exists ba_feature_id uuid references public.project_features (id) on delete set null;

create table if not exists public.progress_settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  crew_needs_approval  boolean not null default true,
  notify_mode          text not null default 'each' check (notify_mode in ('each', 'daily', 'never')),
  milestones           jsonb not null default '{}'::jsonb,   -- { <build_type>: [labels] } — overrides the app defaults
  updated_at           timestamptz not null default now()
);

create table if not exists public.progress_updates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,   -- the project's owner
  project_id          uuid not null references public.projects (id) on delete cascade,
  feature_id          uuid references public.project_features (id) on delete set null,
  milestone           text,
  note                text,
  author_employee_id  uuid references public.employees (id) on delete set null,
  author_name         text,
  status              text not null default 'internal' check (status in ('pending', 'shared', 'internal')),
  shared_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists progress_updates_project_idx on public.progress_updates (project_id, created_at desc);
create index if not exists progress_updates_pending_idx on public.progress_updates (user_id, status);

alter table public.project_images
  add column if not exists progress_update_id uuid references public.progress_updates (id) on delete set null;

create table if not exists public.progress_update_comments (
  id           uuid primary key default gen_random_uuid(),
  update_id    uuid not null references public.progress_updates (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  author       text not null check (author in ('client', 'contractor')),
  author_name  text,
  body         text not null check (length(trim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index if not exists progress_update_comments_update_idx on public.progress_update_comments (update_id, created_at);

create table if not exists public.progress_update_reactions (
  update_id   uuid primary key references public.progress_updates (id) on delete cascade,
  thumbs_up_at timestamptz not null default now()
);

create table if not exists public.portfolio_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id       uuid references public.projects (id) on delete set null,
  feature_id       uuid references public.project_features (id) on delete set null,
  before_image_id  uuid references public.project_images (id) on delete set null,
  after_image_id   uuid references public.project_images (id) on delete set null,
  title            text,
  created_at       timestamptz not null default now()
);

alter table public.clients
  add column if not exists marketing_ok boolean,
  add column if not exists marketing_ok_at timestamptz,
  add column if not exists marketing_ok_source text check (marketing_ok_source in ('hub', 'manual'));
alter table public.projects add column if not exists progress_prompted_at timestamptz;

drop trigger if exists progress_updates_set_updated_at on public.progress_updates;
create trigger progress_updates_set_updated_at before update on public.progress_updates for each row execute function public.set_updated_at();
drop trigger if exists progress_settings_set_updated_at on public.progress_settings;
create trigger progress_settings_set_updated_at before update on public.progress_settings for each row execute function public.set_updated_at();

-- Owner access (+ employees excluded); crews go through the RPCs below.
do $$
declare t text;
begin
  foreach t in array array['progress_settings', 'progress_updates', 'portfolio_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.progress_update_comments enable row level security;
drop policy if exists "own" on public.progress_update_comments;
create policy "own" on public.progress_update_comments for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()) and not public.is_employee())
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()) and not public.is_employee());
revoke all on public.progress_update_comments from anon;

alter table public.progress_update_reactions enable row level security;
drop policy if exists "own read" on public.progress_update_reactions;
create policy "own read" on public.progress_update_reactions for select to authenticated
  using (exists (select 1 from public.progress_updates u where u.id = update_id and u.user_id = auth.uid()) and not public.is_employee());
revoke all on public.progress_update_reactions from anon;

-- ---------------------------------------------------------------------------
-- Sharing (owner): status + the photos' client_visible, together.
-- ---------------------------------------------------------------------------
create or replace function public.set_progress_update_shared(p_update_id uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare u public.progress_updates;
begin
  select * into u from public.progress_updates where id = p_update_id and user_id = auth.uid() for update;
  if not found or public.is_employee() then raise exception 'Update not found.'; end if;
  update public.progress_updates
     set status = case when p_shared then 'shared' else 'internal' end,
         shared_at = case when p_shared then coalesce(shared_at, now()) else null end
   where id = p_update_id;
  -- Photos stay visible if they're also shared on their own / as before-after.
  update public.project_images
     set client_visible = p_shared or ba_role is not null
   where progress_update_id = p_update_id;
end;
$$;

/** Delete an update (owner). Its photos stay in the project gallery, hidden
 * from the client unless shared some other way. */
create or replace function public.delete_progress_update(p_update_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.progress_updates where id = p_update_id and user_id = auth.uid()) or public.is_employee() then
    raise exception 'Update not found.';
  end if;
  update public.project_images set client_visible = ba_role is not null, progress_update_id = null where progress_update_id = p_update_id;
  delete from public.progress_updates where id = p_update_id;
end;
$$;

-- Before / After (owner): marking a photo shares it (the Hub compares them).
create or replace function public.set_photo_before_after(p_image_id uuid, p_role text, p_feature_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role is not null and p_role not in ('before', 'after') then raise exception 'Bad role'; end if;
  update public.project_images pi
     set ba_role = p_role, ba_feature_id = case when p_role is null then null else p_feature_id end,
         client_visible = case when p_role is not null then true
                               else exists (select 1 from public.progress_updates u where u.id = pi.progress_update_id and u.status = 'shared') end
   where pi.id = p_image_id
     and exists (select 1 from public.projects p where p.id = pi.project_id and p.user_id = auth.uid())
     and not public.is_employee();
end;
$$;

-- ---------------------------------------------------------------------------
-- Crew posting (assigned, active crew only)
-- ---------------------------------------------------------------------------
create or replace function public.crew_post_update(p_project_id uuid, p_note text, p_feature_id uuid, p_milestone text, p_share boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.employees; v_owner uuid; v_approval boolean; v_id uuid; v_status text;
begin
  e := public._crew_employee(p_project_id);
  if e.id is null then raise exception 'This job isn''t assigned to you.'; end if;
  select user_id into v_owner from public.projects where id = p_project_id;
  select crew_needs_approval into v_approval from public.progress_settings where user_id = v_owner;
  v_status := case when not p_share then 'internal' when coalesce(v_approval, true) then 'pending' else 'shared' end;
  insert into public.progress_updates (user_id, project_id, feature_id, milestone, note, author_employee_id, author_name, status, shared_at)
  values (v_owner, p_project_id,
          (select id from public.project_features where id = p_feature_id and project_id = p_project_id),
          nullif(trim(coalesce(p_milestone, '')), ''), nullif(trim(coalesce(p_note, '')), ''), e.id, e.name, v_status,
          case when v_status = 'shared' then now() end)
  returning id into v_id;
  if v_status = 'pending' then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    select v_owner, 'progress_review', e.name || ' posted a progress update', p.name || ' — review before it goes to the client',
           '/projects/' || p_project_id, 'progress_review:' || v_id
      from public.projects p where p.id = p_project_id
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return v_id;
end;
$$;

/** Crew: once its photos are uploaded, a no-approval shared post makes them visible. */
create or replace function public.crew_finish_update(p_update_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u public.progress_updates;
begin
  select * into u from public.progress_updates where id = p_update_id;
  if not found or (public._crew_employee(u.project_id)).id is null then raise exception 'Update not found.'; end if;
  if u.status = 'shared' then
    update public.project_images set client_visible = true where progress_update_id = p_update_id;
  end if;
end;
$$;

/** Crew: their own and shared updates on the job (read-only feed). */
create or replace function public.crew_progress_updates(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'created_at', u.created_at, 'note', u.note, 'milestone', u.milestone, 'feature_id', u.feature_id,
           'author_name', u.author_name, 'status', u.status,
           'photos', coalesce((select jsonb_agg(pi.storage_path order by pi.created_at) from public.project_images pi where pi.progress_update_id = u.id), '[]'::jsonb)
         ) order by u.created_at desc), '[]'::jsonb)
    from public.progress_updates u
   where u.project_id = p_project_id and (public._crew_employee(p_project_id)).id is not null;
$$;

-- ---------------------------------------------------------------------------
-- Client Hub: reactions, comments, marketing consent
-- ---------------------------------------------------------------------------
create or replace function public._portal_owns_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p join public.clients c on c.id = p.client_id
                  where p.id = p_project_id and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.portal_react_progress(p_update_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare u public.progress_updates;
begin
  select * into u from public.progress_updates where id = p_update_id and status = 'shared';
  if not found or not public._portal_owns_project(u.project_id) then raise exception 'Update not found.'; end if;
  if p_on then insert into public.progress_update_reactions (update_id) values (p_update_id) on conflict do nothing;
  else delete from public.progress_update_reactions where update_id = p_update_id; end if;
end;
$$;

create or replace function public.portal_comment_progress(p_update_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare u public.progress_updates; c record;
begin
  select * into u from public.progress_updates where id = p_update_id and status = 'shared';
  if not found or not public._portal_owns_project(u.project_id) then raise exception 'Update not found.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a comment.'; end if;
  select cl.id, cl.name, p.name as project_name into c
    from public.projects p join public.clients cl on cl.id = p.client_id where p.id = u.project_id;
  insert into public.progress_update_comments (update_id, project_id, author, author_name, body)
  values (p_update_id, u.project_id, 'client', c.name, left(trim(p_body), 2000));
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (u.user_id, 'progress_comment', coalesce(c.name, 'Your client') || ' commented on a progress update',
          left(trim(p_body), 200), '/projects/' || u.project_id, 'progress_comment:' || gen_random_uuid());
  insert into public.activities (client_id, project_id, created_by, kind, summary, meta)
  values (c.id, u.project_id, u.user_id, 'note', 'Client Hub comment on a progress update: ' || left(trim(p_body), 500),
          jsonb_build_object('progress_update_id', p_update_id, 'from_client', true));
end;
$$;

create or replace function public.portal_set_marketing_ok(p_project_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._portal_owns_project(p_project_id) then raise exception 'Project not found.'; end if;
  update public.clients c set marketing_ok = p_ok, marketing_ok_at = now(), marketing_ok_source = 'hub'
    from public.projects p where p.id = p_project_id and c.id = p.client_id;
end;
$$;

-- The Hub's progress block — whitelisted, shared updates only.
create or replace function public.client_progress_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id, 'date', coalesce(u.shared_at, u.created_at), 'text', u.note, 'milestone', u.milestone,
               'feature', u.feature_id,
               'photos', coalesce((select jsonb_agg(pi.storage_path order by pi.created_at) from public.project_images pi
                                    where pi.progress_update_id = u.id and pi.client_visible), '[]'::jsonb),
               'liked', exists (select 1 from public.progress_update_reactions r where r.update_id = u.id),
               'comments', coalesce((select jsonb_agg(jsonb_build_object('author', c.author, 'name', c.author_name, 'body', c.body, 'created_at', c.created_at) order by c.created_at)
                                       from public.progress_update_comments c where c.update_id = u.id), '[]'::jsonb)
             ) order by coalesce(u.shared_at, u.created_at) desc)
        from public.progress_updates u where u.project_id = p_project_id and u.status = 'shared'), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'label', coalesce(nullif(f.label, ''), cat.name, 'Feature'), 'category', cat.name) order by f.sort_order)
        from public.project_features f left join public.categories cat on cat.id = f.category_id
       where f.project_id = p_project_id and f.status = 'active'), '[]'::jsonb),
    'milestone_presets', coalesce((select ps.milestones from public.progress_settings ps join public.projects p on p.user_id = ps.user_id where p.id = p_project_id), '{}'::jsonb),
    'before_after', coalesce((
      select jsonb_agg(jsonb_build_object('feature', x.feature_id, 'before', x.before_path, 'after', x.after_path))
        from (
          select pi.ba_feature_id as feature_id,
                 (select b.storage_path from public.project_images b where b.project_id = p_project_id and b.ba_feature_id is not distinct from pi.ba_feature_id and b.ba_role = 'before' order by b.created_at desc limit 1) as before_path,
                 (select a.storage_path from public.project_images a where a.project_id = p_project_id and a.ba_feature_id is not distinct from pi.ba_feature_id and a.ba_role = 'after' order by a.created_at desc limit 1) as after_path
            from public.project_images pi where pi.project_id = p_project_id and pi.ba_role is not null
           group by pi.ba_feature_id
        ) x where x.before_path is not null and x.after_path is not null), '[]'::jsonb),
    'marketing_ok', (select c.marketing_ok from public.projects p join public.clients c on c.id = p.client_id where p.id = p_project_id)
  );
$$;

create or replace function public._portal_project_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json_base(p_project_id)
         || jsonb_build_object(
              'schedule_updates', public.client_schedule_updates_json(p_project_id),
              'review', public.client_review_json(p_project_id),
              'progress', public.client_progress_json(p_project_id));
$$;

revoke all on function public._portal_project_json(uuid) from public, anon, authenticated;
revoke all on function public.client_progress_json(uuid) from public, anon, authenticated;
revoke all on function public._portal_owns_project(uuid) from public, anon, authenticated;
revoke all on function public.set_progress_update_shared(uuid, boolean) from public, anon;
revoke all on function public.delete_progress_update(uuid) from public, anon;
revoke all on function public.set_photo_before_after(uuid, text, uuid) from public, anon;
revoke all on function public.crew_post_update(uuid, text, uuid, text, boolean) from public, anon;
revoke all on function public.crew_finish_update(uuid) from public, anon;
revoke all on function public.crew_progress_updates(uuid) from public, anon;
revoke all on function public.portal_react_progress(uuid, boolean) from public, anon;
revoke all on function public.portal_comment_progress(uuid, text) from public, anon;
revoke all on function public.portal_set_marketing_ok(uuid, boolean) from public, anon;
grant execute on function public.set_progress_update_shared(uuid, boolean) to authenticated;
grant execute on function public.delete_progress_update(uuid) to authenticated;
grant execute on function public.set_photo_before_after(uuid, text, uuid) to authenticated;
grant execute on function public.crew_post_update(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function public.crew_finish_update(uuid) to authenticated;
grant execute on function public.crew_progress_updates(uuid) to authenticated;
grant execute on function public.portal_react_progress(uuid, boolean) to authenticated;
grant execute on function public.portal_comment_progress(uuid, text) to authenticated;
grant execute on function public.portal_set_marketing_ok(uuid, boolean) to authenticated;
