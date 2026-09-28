-- ContractorHQ — Client Hub access requires the magic link. Run AFTER 0139.
--
-- Security fix. Every Client Hub check identified the client ONLY by
-- comparing the signed-in login's email to clients.email:
--     lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
-- so ANY login whose email matched a client got that client's Hub — e.g. a
-- confirmed login created with a chosen password (the create-employee
-- function, fixed alongside this migration), or a plain password signup
-- with the client's email. A client must only get in through the magic link
-- sent to their inbox.
--
-- public.portal_email(): the login's email, but ONLY when this session was
-- started from a link / code emailed to that address — the JWT's amr claim
-- has method 'otp' (magic link or code; 'magiclink' on older auth versions)
-- or 'email/signup' (a client's FIRST magic link: the portal creates the
-- account on first use, so Supabase records it as a sign-up confirmation).
-- Both prove the person controls the inbox. A password session gets NULL,
-- which matches no client. Also closes a quieter gap: the old
-- check turned "no email" into '' — which matched any client saved with a
-- blank email.
--
-- Every function and storage policy below is its LATEST definition from the
-- earlier migrations (listed next to each), re-issued unchanged except that
-- one expression. Nothing else about the Hub changes.

create or replace function public.portal_email()
returns text language sql stable set search_path = public as $$
  select case
           when exists (
             select 1
               from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) as e(v)
              where (case when jsonb_typeof(e.v) = 'object' then e.v ->> 'method' else e.v #>> '{}' end) in ('otp', 'magiclink', 'email/signup')
           )
           then nullif(lower(trim(auth.jwt() ->> 'email')), '')
         end;
$$;
revoke all on function public.portal_email() from public, anon;
grant execute on function public.portal_email() to authenticated;

-- public._portal_owns_project(uuid) — was: 1 raw-email check
create or replace function public._portal_owns_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p join public.clients c on c.id = p.client_id
                  where p.id = p_project_id and lower(c.email) = public.portal_email());
$$;

-- public.get_portal_context() — was: 1 raw-email check
create or replace function public.get_portal_context()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'client_id', c.id,
      'client_name', c.name,
      'business_name', bp.company_name,
      'projects', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status)
          order by p.created_at desc
        )
        from public.projects p
        where p.client_id = c.id and p.status <> 'lost'
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from public.clients c
  left join public.business_profile bp on bp.user_id = c.user_id
  where c.email is not null
    and c.email <> ''
    and lower(c.email) = public.portal_email();
$$;

-- public.get_portal_messages(uuid) — was: 1 raw-email check
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
    and lower(c.email) = public.portal_email();
$$;

-- public.get_portal_project(uuid) — was: 1 raw-email check
create or replace function public.get_portal_project(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json(p.id)
  from public.projects p
  where p.id = p_project_id
    and p.status <> 'lost'
    and p.client_id is not null
    and exists (
      select 1 from public.clients c
      where c.id = p.client_id
        and lower(c.email) = public.portal_email()
    );
$$;

-- public.portal_add_project_image(uuid,text,text) — was: 1 raw-email check
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
    and lower(c.email) = public.portal_email();
end;
$$;

-- public.portal_approve_change_order(uuid,text) — was: 1 raw-email check
create or replace function public.portal_approve_change_order(p_change_order_id uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.change_orders co
     set status = 'approved',
         approved_at = now(),
         approved_by = nullif(trim(p_signed_by), ''),
         approved_ip = portal_request_ip(),
         signed_at = now(),
         signed_by = nullif(trim(p_signed_by), '')
    from public.projects p, public.clients c
   where co.id = p_change_order_id
     and p.id = co.project_id
     and c.id = p.client_id
     and co.status = 'sent'
     and lower(c.email) = public.portal_email()
   returning co.project_id into v_project_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'change_order_approved',
           'Change order approved by client: ' || co.title || ' · $' || to_char(co.amount, 'FM999,999,990.00')
    from public.projects p join public.change_orders co on co.id = p_change_order_id
    where p.id = v_project_id;
  end if;
end;
$$;

-- public.portal_approve_quote(uuid,text) — was: 1 raw-email check
create or replace function public.portal_approve_quote(p_quote_id uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_quote_id   uuid;
  v_user_id    uuid;
begin
  update public.quotes q
     set status = 'approved',
         signed_at = now(),
         signed_by = nullif(trim(p_signed_by), ''),
         signed_ip = portal_request_ip()
    from public.projects p, public.clients c
   where q.id = p_quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and q.status = 'sent'
     and lower(c.email) = public.portal_email()
   returning q.project_id, q.id, q.user_id into v_project_id, v_quote_id, v_user_id;

  if v_project_id is not null then
    update public.projects set status = 'scheduled' where id = v_project_id and status = 'estimating';
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'quote_signed',
           'Quote approved' || case
             when nullif(trim(p_signed_by), '') is not null then ' by ' || trim(p_signed_by)
             else ''
           end
    from public.projects p where p.id = v_project_id;
  end if;

  if v_quote_id is not null then
    perform public.apply_quote_signed(v_quote_id);
  end if;
end;
$$;

-- public.portal_decline_change_order(uuid,text) — was: 1 raw-email check
create or replace function public.portal_decline_change_order(p_change_order_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.change_orders co
     set status = 'declined',
         declined_at = now(),
         decline_comment = nullif(trim(p_comment), '')
    from public.projects p, public.clients c
   where co.id = p_change_order_id
     and p.id = co.project_id
     and c.id = p.client_id
     and co.status = 'sent'
     and lower(c.email) = public.portal_email()
   returning co.project_id into v_project_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'change_order_rejected', 'Change order declined by client: ' || co.title
    from public.projects p where p.id = v_project_id;
  end if;
end;
$$;

-- public.portal_decline_quote(uuid,text) — was: 1 raw-email check
create or replace function public.portal_decline_quote(p_quote_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.quotes q
     set status = 'declined',
         declined_at = now(),
         decline_comment = nullif(trim(p_comment), '')
    from public.projects p, public.clients c
   where q.id = p_quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and q.status = 'sent'
     and lower(c.email) = public.portal_email()
   returning q.project_id into v_project_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'quote_declined', 'Quote declined by client'
    from public.projects p where p.id = v_project_id;
  end if;
end;
$$;

-- public.portal_request_selection_change(uuid,uuid,text) — was: 1 raw-email check
create or replace function public.portal_request_selection_change(p_group_id uuid, p_option_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select g.id, q.id as quote_id, q.user_id, p.id as project_id, g.name
    into v
    from public.quote_selection_groups g
    join public.quote_sections s on s.id = g.quote_section_id
    join public.quotes q on q.id = s.quote_id
    join public.projects p on p.id = q.project_id
    join public.clients c on c.id = p.client_id
   where g.id = p_group_id and q.status = 'approved'
     and lower(c.email) = public.portal_email();
  if v.id is null then
    raise exception 'This selection can''t be changed from here';
  end if;
  if p_option_id is not null and not exists (select 1 from public.quote_selection_options o where o.id = p_option_id and o.group_id = p_group_id) then
    raise exception 'That option isn''t available';
  end if;
  insert into public.selection_change_requests (user_id, project_id, quote_id, group_id, requested_option_id, note, requested_by)
  values (v.user_id, v.project_id, v.quote_id, p_group_id, p_option_id, nullif(trim(p_note), ''), auth.jwt() ->> 'email');
  insert into public.project_events (project_id, user_id, kind, summary)
  values (v.project_id, v.user_id, 'selection_change_requested', 'Client asked to change "' || v.name || '"');
end;
$$;

-- public.portal_send_message(uuid,text,text[]) — was: 1 raw-email check
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
    and lower(c.email) = public.portal_email();

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

-- public.portal_set_quote_item_selection(uuid,boolean) — was: 1 raw-email check
create or replace function public.portal_set_quote_item_selection(p_quote_item_id uuid, p_selected boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v record; v_summary text;
begin
  update public.quote_items i
     set client_selected = p_selected
    from public.quote_sections s, public.quotes q, public.projects p, public.clients c
   where i.id = p_quote_item_id
     and s.id = i.section_id
     and q.id = s.quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and i.is_optional
     and q.status = 'sent'
     and lower(c.email) = public.portal_email()
  returning q.id as quote_id, q.user_id as owner, i.name into v;
  if v.quote_id is null then return; end if;
  v_summary := case when p_selected then 'Added ' else 'Dropped ' end || v.name
               || ' · total $' || to_char(public.quote_committed_total(v.quote_id), 'FM999,999,990.00');
  insert into public.quote_activity_events (user_id, quote_id, version, kind, summary, detail)
  values (v.owner, v.quote_id, public._quote_version(v.quote_id), 'optional_changed', v_summary,
          jsonb_build_object('item', v.name, 'selected', p_selected, 'total', public.quote_committed_total(v.quote_id)));
  update public.quotes set selections_changed_at = now(), last_activity_at = now() where id = v.quote_id;
  perform public._quote_activity(v.quote_id, v.owner, 'quote_optional_changed', v_summary, '{}'::jsonb);
  perform public._notify(v.owner, 'quote_selections', 'quote_selections', 'Your client changed optional items on a quote', v_summary,
          v.quote_id, 'optional:' || v.quote_id || ':' || to_char(now(), 'YYYY-MM-DD HH24'));
end;
$$;

-- public.portal_set_quote_selection(uuid,uuid[]) — was: 1 raw-email check
create or replace function public.portal_set_quote_selection(p_group_id uuid, p_option_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.quote_selection_groups g
    join public.quote_sections s on s.id = g.quote_section_id
    join public.quotes q on q.id = s.quote_id
    join public.projects p on p.id = q.project_id
    join public.clients c on c.id = p.client_id
    where g.id = p_group_id and q.status = 'sent'
      and lower(c.email) = public.portal_email()
  ) then
    raise exception 'This quote can''t be changed';
  end if;
  perform public._set_selection_picks(p_group_id, p_option_ids, 'client');
end;
$$;

-- public.record_portal_sign_in() — was: 1 raw-email check
create or replace function public.record_portal_sign_in()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(public.portal_email(), '');
begin
  if v_email = '' then
    return;
  end if;
  update public.clients
     set portal_last_sign_in_at = now()
   where lower(email) = v_email;
end;
$$;

-- public.track_portal_quote_view(uuid,uuid,text,int,text[]) — was: 1 raw-email check
create or replace function public.track_portal_quote_view(p_quote_id uuid, p_session_key uuid, p_device text, p_active_seconds int, p_sections text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.quotes q
    join public.projects p on p.id = q.project_id
    join public.clients c on c.id = p.client_id
    where q.id = p_quote_id and lower(c.email) = public.portal_email()
  ) then
    perform public._record_quote_view(p_quote_id, 'hub', p_session_key, p_device, p_active_seconds, p_sections);
  end if;
end;
$$;

-- public.track_quote_event(uuid,uuid,uuid,text,jsonb) — was: 1 raw-email check
create or replace function public.track_quote_event(p_quote_id uuid, p_token uuid, p_session_key uuid, p_kind text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare q record; v_session uuid; v_summary text;
begin
  if p_kind not in ('pdf_downloaded', 'optional_changed') then return; end if;
  if p_token is not null then
    select * into q from public.quotes where share_token = p_token;
  else
    select qq.* into q from public.quotes qq
      join public.projects p on p.id = qq.project_id
      join public.clients c on c.id = p.client_id
     where qq.id = p_quote_id and lower(c.email) = public.portal_email();
  end if;
  if q.id is null or public._is_quote_team(q.user_id) then return; end if;
  select id into v_session from public.quote_view_sessions
   where quote_id = q.id and session_key = p_session_key order by last_seen_at desc limit 1;
  v_summary := case p_kind
    when 'pdf_downloaded' then 'Downloaded / printed the quote'
    else coalesce(p_detail ->> 'summary', 'Changed optional items') end;
  insert into public.quote_activity_events (user_id, quote_id, session_id, version, kind, summary, detail)
  values (q.user_id, q.id, v_session, public._quote_version(q.id), p_kind, left(v_summary, 300), coalesce(p_detail, '{}'::jsonb));
  update public.quotes set last_activity_at = now() where id = q.id;
  if p_kind = 'optional_changed' then
    perform public._notify(q.user_id, 'quote_selections', 'quote_selections',
            'Your client changed optional items on a quote', left(v_summary, 200), q.id,
            'optional:' || q.id || ':' || coalesce(p_session_key::text, '') || ':' || to_char(now(), 'YYYY-MM-DD HH24'));
    perform public._quote_activity(q.id, q.user_id, 'quote_optional_changed', left(v_summary, 200), p_detail);
  end if;
end;
$$;

-- storage policy "portal client project image upload"
drop policy if exists "portal client project image upload" on storage.objects;
create policy "portal client project image upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1 from public.projects p
      join public.clients c on c.id = p.client_id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and lower(c.email) = public.portal_email()
    )
  );

-- storage policy "portal client-visible project images select"
drop policy if exists "portal client-visible project images select" on storage.objects;
create policy "portal client-visible project images select" on storage.objects
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
        and pi.client_visible = true
        and lower(c.email) = public.portal_email()
    )
  );

-- storage policy "portal delivery images select"
drop policy if exists "portal delivery images select" on storage.objects;
create policy "portal delivery images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'material-orders'
    and exists (
      select 1
      from public.material_order_images moi
      join public.material_orders mo on mo.id = moi.material_order_id
      join public.projects p on p.id = mo.project_id
      join public.clients c on c.id = p.client_id
      where moi.storage_path = storage.objects.name
        and lower(c.email) = public.portal_email()
    )
  );

-- storage policy "portal message image upload"
drop policy if exists "portal message image upload" on storage.objects;
create policy "portal message image upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'project-messages'
    and exists (
      select 1 from public.projects p
      join public.clients c on c.id = p.client_id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and lower(c.email) = public.portal_email()
    )
  );

-- storage policy "portal message images select"
drop policy if exists "portal message images select" on storage.objects;
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
        and lower(c.email) = public.portal_email()
    )
  );

-- storage policy "portal own uploaded project images select"
drop policy if exists "portal own uploaded project images select" on storage.objects;
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
        and lower(c.email) = public.portal_email()
    )
  );

-- storage policy "shared selection images select"
drop policy if exists "shared selection images select" on storage.objects;
create policy "shared selection images select" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'selection-options'
    and exists (
      select 1
      from public.quote_selection_options o
      join public.quote_selection_groups g on g.id = o.group_id
      join public.quote_sections s on s.id = g.quote_section_id
      join public.quotes q on q.id = s.quote_id
      left join public.projects p on p.id = q.project_id
      left join public.clients c on c.id = coalesce(q.client_id, p.client_id)
      where o.image_path = storage.objects.name
        and (q.share_token is not null
             or (q.status in ('sent', 'approved', 'declined') and lower(c.email) = public.portal_email()))
    )
  );
