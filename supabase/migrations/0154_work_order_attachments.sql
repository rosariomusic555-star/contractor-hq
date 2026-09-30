-- ContractorHQ — Work order attachments (site plans, layout drawings,
-- marked-up photos, spec sheets, permit / HOA plans) for the crew.
-- Run AFTER 0001-0153.
--
--   storage.buckets 'images'   + application/pdf, limit 15 MB → 25 MB. Before
--                              this, PDF uploads (pre-construction HOA /
--                              permit files, PDF receipts) were rejected by
--                              the bucket itself.
--   work_order_attachments           one row per attachment (project-wide or
--                                    one feature block), pinned + ordered
--   work_order_attachment_versions   the previous file each time one is replaced
--
-- Files: images bucket, work-order/{project_id}/{uuid}.{ext}. An attachment can
-- also point at a file that already exists (a project photo, a
-- pre-construction HOA / permit upload) without copying it; crews may read
-- such a file only while an attachment on their job points at it.
--
-- Crews never read these tables directly — they get attachments through
-- get_crew_work_order (the crew-facing serializer, whitelisted, no money),
-- and the attachment list is part of the "Reviewed" fingerprint, so a new or
-- replaced file asks the crew lead to review again. Nothing here reaches the
-- Client Hub.

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
       file_size_limit = 26214400   -- 25 MB
 where id = 'images';

create table if not exists public.work_order_attachments (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects (id) on delete cascade,
  user_id               uuid not null default auth.uid(),
  -- null = the whole project (top of the work order); else one feature block.
  -- No FK: a removed feature just falls back to the project-wide list.
  feature_id            uuid,
  title                 text not null,
  note                  text,
  category              text not null default 'other'
                          check (category in ('site_plan', 'layout', 'photo', 'spec_sheet', 'permit_hoa', 'other')),
  pinned                boolean not null default false,
  sort_order            int not null default 0,
  source                text not null default 'upload' check (source in ('upload', 'project_photo', 'precon', 'markup', 'crew')),
  -- Where a linked file came from (no FK — ids only, see header).
  source_id             uuid,
  storage_path          text not null,
  mime_type             text not null,
  size_bytes            bigint,
  width                 int,
  height                int,
  page_count            int,
  version               int not null default 1,
  -- A marked-up copy keeps a link to the attachment it was drawn on.
  marked_up_from        uuid references public.work_order_attachments (id) on delete set null,
  added_by_crew         boolean not null default false,
  added_by_employee_id  uuid references public.employees (id) on delete set null,
  added_by_name         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists work_order_attachments_project_idx on public.work_order_attachments (project_id, sort_order);
create index if not exists work_order_attachments_path_idx on public.work_order_attachments (storage_path);

create table if not exists public.work_order_attachment_versions (
  id             uuid primary key default gen_random_uuid(),
  attachment_id  uuid not null references public.work_order_attachments (id) on delete cascade,
  version        int not null,
  storage_path   text not null,
  mime_type      text not null,
  size_bytes     bigint,
  title          text,
  replaced_at    timestamptz not null default now()
);
create index if not exists work_order_attachment_versions_idx on public.work_order_attachment_versions (attachment_id, version desc);

alter table public.work_order_attachments enable row level security;
alter table public.work_order_attachment_versions enable row level security;
revoke all on public.work_order_attachments from anon;
revoke all on public.work_order_attachment_versions from anon;

-- Owner only (never an employee login, never a client).
drop policy if exists "own work order attachments" on public.work_order_attachments;
create policy "own work order attachments" on public.work_order_attachments for all to authenticated
  using (not public.is_employee() and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (not public.is_employee() and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "own work order attachment versions" on public.work_order_attachment_versions;
create policy "own work order attachment versions" on public.work_order_attachment_versions for all to authenticated
  using (not public.is_employee() and exists (
    select 1 from public.work_order_attachments a join public.projects p on p.id = a.project_id
     where a.id = attachment_id and p.user_id = auth.uid()))
  with check (not public.is_employee() and exists (
    select 1 from public.work_order_attachments a join public.projects p on p.id = a.project_id
     where a.id = attachment_id and p.user_id = auth.uid()));

create or replace function public.touch_work_order_attachment()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists work_order_attachments_touch on public.work_order_attachments;
create trigger work_order_attachments_touch before update on public.work_order_attachments
  for each row execute function public.touch_work_order_attachment();

-- ---------------------------------------------------------------------------
-- Storage: images bucket, work-order/{project_id}/…
-- ---------------------------------------------------------------------------
drop policy if exists "own work-order files all" on storage.objects;
create policy "own work-order files all" on storage.objects for all to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'work-order' and not public.is_employee()
         and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()))
  with check (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'work-order' and not public.is_employee()
              and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()));

-- Assigned, active crew: read the job's work-order files.
drop policy if exists "crew views work-order files" on storage.objects;
create policy "crew views work-order files" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'work-order'
         and exists (select 1 from public.employee_project_assignments a join public.employees e on e.id = a.employee_id
                      where a.project_id::text = (storage.foldername(storage.objects.name))[2]
                        and e.auth_user_id = auth.uid() and e.status = 'active'));

-- Crew leads: add files to their job (shown as "Added by crew").
drop policy if exists "crew lead uploads work-order files" on storage.objects;
create policy "crew lead uploads work-order files" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'work-order'
              and exists (select 1 from public.employee_project_assignments a join public.employees e on e.id = a.employee_id
                           where a.project_id::text = (storage.foldername(storage.objects.name))[2]
                             and e.auth_user_id = auth.uid() and e.status = 'active' and e.is_lead));

-- A linked existing file (pre-construction upload, …) outside work-order/:
-- readable by the job's crew only while an attachment on that job points at
-- it. SECURITY DEFINER: crews can't read work_order_attachments themselves.
create or replace function public._crew_can_read_attached(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_order_attachments w
      join public.employee_project_assignments a on a.project_id = w.project_id
      join public.employees e on e.id = a.employee_id
     where w.storage_path = p_name and e.auth_user_id = auth.uid() and e.status = 'active');
$$;
revoke all on function public._crew_can_read_attached(text) from public, anon;
grant execute on function public._crew_can_read_attached(text) to authenticated;

drop policy if exists "crew views attached files" on storage.objects;
create policy "crew views attached files" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] in ('precon', 'projects')
         and public._crew_can_read_attached(storage.objects.name));

-- ---------------------------------------------------------------------------
-- Crew-facing list (whitelisted — no money, no internal ids beyond what the
-- viewer needs) + the work order / fingerprint that include it.
-- ---------------------------------------------------------------------------
create or replace function public.crew_work_order_attachments(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'feature_id', w.feature_id, 'title', w.title, 'note', w.note, 'category', w.category,
           'pinned', w.pinned, 'sort_order', w.sort_order, 'storage_path', w.storage_path, 'mime_type', w.mime_type,
           'size_bytes', w.size_bytes, 'width', w.width, 'height', w.height, 'page_count', w.page_count,
           'version', w.version, 'marked_up_from', w.marked_up_from, 'added_by_crew', w.added_by_crew,
           'added_by_name', w.added_by_name, 'updated_at', w.updated_at)
         order by w.pinned desc, w.sort_order, w.created_at), '[]'::jsonb)
    from public.work_order_attachments w
   where w.project_id = p_project_id;
$$;
revoke all on function public.crew_work_order_attachments(uuid) from public, anon, authenticated;

/** Scope fingerprint — what "Reviewed" and "changed since" key on. Now also
 * every attachment's id / version / title / placement / pin. */
create or replace function public._crew_version(p_json jsonb)
returns text language sql immutable as $$
  select md5(jsonb_build_object(
    'project', p_json->'project', 'site', p_json->'site', 'permits', p_json->'permits', 'client', p_json->'client',
    'crew_notes', p_json->'crew_notes', 'features', p_json->'features', 'general_scope', p_json->'general_scope',
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m->'id', 'name', m->'name', 'color', m->'color', 'planned_quantity', m->'planned_quantity', 'unit', m->'unit')), '[]'::jsonb)
                    from jsonb_array_elements(p_json->'materials') m),
    'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', a->'id', 'version', a->'version', 'title', a->'title', 'feature_id', a->'feature_id', 'pinned', a->'pinned')), '[]'::jsonb)
                      from jsonb_array_elements(coalesce(p_json->'attachments', '[]'::jsonb)) a)
  )::text);
$$;

create or replace function public.get_crew_work_order(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; e public.employees; v_ver text;
begin
  if not public._crew_can_see(p_project_id) then return null; end if;
  v := public.crew_work_order_json(p_project_id);
  if v is null then return null; end if;
  v := v || jsonb_build_object('attachments', public.crew_work_order_attachments(p_project_id));
  v_ver := public._crew_version(v);
  e := public._crew_employee(p_project_id);
  return v || jsonb_build_object(
    'version', v_ver,
    'viewer', jsonb_build_object(
      'is_owner', e.id is null, 'employee_id', e.id,
      'is_lead', coalesce(e.is_lead, false), 'can_log_usage', coalesce(e.can_log_usage, false)),
    'last_open', (select jsonb_build_object('version', o.version, 'snapshot', o.snapshot, 'opened_at', o.opened_at)
                    from public.work_order_opens o where o.project_id = p_project_id and o.employee_id = e.id),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('name', r.employee_name, 'version', r.version, 'reviewed_at', r.reviewed_at) order by r.reviewed_at desc)
                           from (select * from public.work_order_reviews where project_id = p_project_id order by reviewed_at desc limit 5) r), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Crew lead adds a file (already uploaded to work-order/{project}/…).
-- ---------------------------------------------------------------------------
create or replace function public.crew_add_work_order_attachment(
  p_project_id uuid, p_storage_path text, p_mime_type text, p_size_bytes bigint,
  p_title text, p_feature_id uuid, p_width int, p_height int, p_page_count int)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.employees; v_owner uuid; v_id uuid;
begin
  e := public._crew_employee(p_project_id);
  if e.id is null or not e.is_lead then raise exception 'Only a crew lead can add attachments.'; end if;
  if p_storage_path not like 'work-order/' || p_project_id::text || '/%' then raise exception 'Bad file path.'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then raise exception 'Unsupported file type.'; end if;
  select user_id into v_owner from public.projects where id = p_project_id;
  insert into public.work_order_attachments (project_id, user_id, feature_id, title, category, source, storage_path, mime_type,
                                             size_bytes, width, height, page_count, sort_order, added_by_crew, added_by_employee_id, added_by_name)
  values (p_project_id, v_owner, p_feature_id, left(coalesce(nullif(trim(p_title), ''), 'Crew file'), 200),
          case when p_mime_type = 'application/pdf' then 'other' else 'photo' end, 'crew', p_storage_path, p_mime_type,
          p_size_bytes, p_width, p_height, p_page_count,
          coalesce((select max(sort_order) + 1 from public.work_order_attachments where project_id = p_project_id), 0),
          true, e.id, e.name)
  returning id into v_id;
  insert into public.project_events (project_id, user_id, kind, summary, meta)
  values (p_project_id, v_owner, 'work_order_attachment_added', e.name || ' added "' || left(coalesce(nullif(trim(p_title), ''), 'a file'), 80) || '" to the work order',
          jsonb_build_object('attachment_id', v_id));
  return v_id;
end;
$$;
revoke all on function public.crew_add_work_order_attachment(uuid, text, text, bigint, text, uuid, int, int, int) from public, anon;
grant execute on function public.crew_add_work_order_attachment(uuid, text, text, bigint, text, uuid, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner replaces a file: the old one goes to history, the version goes up.
-- ---------------------------------------------------------------------------
create or replace function public.replace_work_order_attachment(
  p_id uuid, p_storage_path text, p_mime_type text, p_size_bytes bigint, p_width int, p_height int, p_page_count int)
returns int language plpgsql security invoker set search_path = public as $$
declare w public.work_order_attachments;
begin
  select * into w from public.work_order_attachments where id = p_id;   -- RLS: owner only
  if not found then raise exception 'Attachment not found.'; end if;
  insert into public.work_order_attachment_versions (attachment_id, version, storage_path, mime_type, size_bytes, title)
  values (w.id, w.version, w.storage_path, w.mime_type, w.size_bytes, w.title);
  update public.work_order_attachments
     set storage_path = p_storage_path, mime_type = p_mime_type, size_bytes = p_size_bytes,
         width = p_width, height = p_height, page_count = p_page_count, version = w.version + 1,
         source = case when w.source in ('project_photo', 'precon') then 'upload' else w.source end, source_id = null
   where id = w.id;
  return w.version + 1;
end;
$$;
revoke all on function public.replace_work_order_attachment(uuid, text, text, bigint, int, int, int) from public, anon;
grant execute on function public.replace_work_order_attachment(uuid, text, text, bigint, int, int, int) to authenticated;
