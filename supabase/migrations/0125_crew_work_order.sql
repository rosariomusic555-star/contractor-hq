-- ContractorHQ — Crew work order.
-- Run AFTER 0001-0124.
--
-- One phone-first page per job for the crew — built ONLY by the crew-facing
-- serializer below (crew_work_order_json), field by field, with no money:
-- no prices, unit costs, totals, margins, overhead, labor rates, payments or
-- balances, and no internal notes. Mirrored + tested in src/lib/crewSafe.ts.
--
-- Access fix: employees could read their assigned `projects` ROW directly
-- (0043), which includes overhead_rate, target_margin_pct and internal
-- notes. That policy is dropped; crews now reach projects only through the
-- whitelisted functions here (crew_projects, get_crew_work_order).
--
--   projects      + crew_notes, crew_client_notes, crew_note_photos,
--                   crew_hide_client_phone (contractor-side fields)
--   employees     + is_lead (can mark "Reviewed" / download the PDF),
--                   can_log_usage (may log material usage)
--   work_order_opens     what each crew member last saw (fingerprint +
--                        snapshot) → "New: border color changed"
--   work_order_reviews   "Reviewed" per version; a scope change asks again

alter table public.projects
  add column if not exists crew_notes             text,
  add column if not exists crew_client_notes      text,
  add column if not exists crew_note_photos       jsonb not null default '[]'::jsonb,
  add column if not exists crew_hide_client_phone boolean not null default false;

alter table public.employees
  add column if not exists is_lead       boolean not null default false,
  add column if not exists can_log_usage boolean not null default false;

create table if not exists public.work_order_opens (
  project_id   uuid not null references public.projects (id) on delete cascade,
  employee_id  uuid not null references public.employees (id) on delete cascade,
  version      text not null,
  snapshot     jsonb not null,
  opened_at    timestamptz not null default now(),
  primary key (project_id, employee_id)
);
alter table public.work_order_opens enable row level security;
revoke all on public.work_order_opens from anon, authenticated;

create table if not exists public.work_order_reviews (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  employee_id    uuid references public.employees (id) on delete set null,
  employee_name  text not null,
  version        text not null,
  reviewed_at    timestamptz not null default now()
);
create index if not exists work_order_reviews_project_idx on public.work_order_reviews (project_id, reviewed_at desc);
alter table public.work_order_reviews enable row level security;
revoke all on public.work_order_reviews from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
drop policy if exists "employee views assigned projects" on public.projects;

create or replace function public._crew_employee(p_project_id uuid)
returns public.employees language sql stable security definer set search_path = public as $$
  select e.* from public.employees e
    join public.employee_project_assignments a on a.employee_id = e.id
   where e.auth_user_id = auth.uid() and e.status = 'active' and a.project_id = p_project_id
   limit 1;
$$;

create or replace function public._crew_can_see(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p_project_id and user_id = auth.uid() and not public.is_employee())
      or (public._crew_employee(p_project_id)).id is not null;
$$;

/** The crew's own job list (replaces reading projects rows directly). */
create or replace function public.crew_projects()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'status', p.status, 'address', p.address,
           'scheduled_start_date', p.scheduled_start_date, 'scheduled_end_date', p.scheduled_end_date,
           'actual_start_date', p.actual_start_date, 'created_at', p.created_at
         ) order by p.scheduled_start_date nulls last, p.created_at desc), '[]'::jsonb)
    from public.projects p
    join public.employee_project_assignments a on a.project_id = p.id
    join public.employees e on e.id = a.employee_id
   where e.auth_user_id = auth.uid() and e.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- The crew-facing serializer — whitelisted, field by field. No money.
-- ---------------------------------------------------------------------------
create or replace function public.crew_work_order_json(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  st record;
  v_scope jsonb;
  v_general jsonb;
begin
  select pr.id, pr.user_id, pr.name, pr.status, pr.address, pr.scheduled_start_date, pr.scheduled_end_date,
         pr.actual_start_date, pr.job_slope, pr.job_access, pr.job_soil, pr.job_demo, pr.crew_notes,
         pr.crew_client_notes, pr.crew_note_photos, pr.crew_hide_client_phone, pr.updated_at,
         c.name as client_name, c.phone as client_phone, cr.name as crew_name,
         (select o.site_conditions from public.opportunities o where o.project_id = pr.id order by o.created_at limit 1) as site_conditions
    into p
    from public.projects pr
    left join public.clients c on c.id = pr.client_id
    left join public.crews cr on cr.id = pr.crew_id
   where pr.id = p_project_id;
  if not found then return null; end if;
  select locate_wait_days, locate_valid_days into st from public.precon_settings where user_id = p.user_id;

  -- Scope by feature (what the crew builds).
  v_scope := coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'label', coalesce(nullif(f.label, ''), cat.name, 'Feature'),
      'category', cat.name,
      'measurements', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'build_type', m.build_type, 'label', m.label, 'data', m.data, 'totals', m.totals) order by m.sort_order)
          from public.project_feature_measurements m where m.feature_id = f.id), '[]'::jsonb),
      'selections', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'group', g.name,
                 'choices', coalesce((select jsonb_agg(o.name order by o.sort_order)
                                        from public.quote_selection_picks pk join public.quote_selection_options o on o.id = pk.option_id
                                       where pk.group_id = g.id), '[]'::jsonb)) order by qs.sort_order, g.sort_order)
          from public.quote_selection_groups g
          join public.quote_sections qs on qs.id = g.quote_section_id
          join public.quotes q on q.id = qs.quote_id
         where qs.feature_id = f.id and q.project_id = p.id and q.status = 'approved' and public.quote_section_included(qs.id)), '[]'::jsonb),
      'scope', coalesce((
        select jsonb_agg(jsonb_build_object('name', qi.name, 'description', qi.description, 'quantity', qi.quantity, 'unit', qi.unit) order by qs.sort_order, qi.sort_order)
          from public.quote_sections qs
          join public.quotes q on q.id = qs.quote_id
          join public.quote_items qi on qi.section_id = qs.id
         where qs.feature_id = f.id and q.project_id = p.id and q.status = 'approved'
           and public.quote_section_included(qs.id)
           and (not coalesce(qi.is_optional, false) or qi.client_selected)), '[]'::jsonb),
      'labor', (
        select jsonb_build_object('crew_days', sum(ms.labor_days), 'crew_size', max(ms.labor_crew_size), 'man_hours', sum(ms.labor_man_hours))
          from public.materials_sections ms where ms.feature_id = f.id and ms.project_id = p.id),
      'changes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'number', public.change_order_number(co.id), 'title', co.title, 'approved_at', co.approved_at, 'scope_note', cs.scope_note,
                 'items', coalesce((select jsonb_agg(jsonb_build_object('name', ci.name, 'description', ci.description, 'quantity', ci.quantity, 'unit', ci.unit) order by ci.sort_order)
                                      from public.change_order_items ci where ci.section_id = cs.id), '[]'::jsonb)) order by co.created_at)
          from public.change_order_sections cs
          join public.change_orders co on co.id = cs.change_order_id
         where cs.feature_id = f.id and co.status = 'approved'), '[]'::jsonb)
    ) order by f.sort_order, f.created_at)
      from public.project_features f
      left join public.categories cat on cat.id = f.category_id
     where f.project_id = p.id and f.status = 'active'), '[]'::jsonb);

  -- Approved quote scope not tied to a feature (older quotes).
  v_general := coalesce((
    select jsonb_agg(jsonb_build_object('name', qi.name, 'description', qi.description, 'quantity', qi.quantity, 'unit', qi.unit) order by qs.sort_order, qi.sort_order)
      from public.quote_sections qs
      join public.quotes q on q.id = qs.quote_id
      join public.quote_items qi on qi.section_id = qs.id
     where qs.feature_id is null and q.project_id = p.id and q.status = 'approved'
       and public.quote_section_included(qs.id)
       and (not coalesce(qi.is_optional, false) or qi.client_selected)), '[]'::jsonb);

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status, 'address', p.address,
      'scheduled_start_date', p.scheduled_start_date, 'scheduled_end_date', p.scheduled_end_date,
      'actual_start_date', p.actual_start_date, 'crew_name', p.crew_name),
    'site', jsonb_build_object(
      'conditions', p.site_conditions, 'slope', p.job_slope, 'access', p.job_access, 'soil', p.job_soil, 'demo', p.job_demo),
    'permits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', pi.kind, 'label', pi.label, 'status', pi.status,
               'ticket', pi.details->>'ticket', 'submitted', pi.details->>'submitted',
               'permit_status', pi.details->>'status', 'number', pi.details->>'number', 'date', pi.details->>'date') order by pi.sort_order)
        from public.project_precon_items pi
       where pi.project_id = p.id and not pi.removed and pi.kind in ('locate', 'permit', 'hoa') and pi.status <> 'na'), '[]'::jsonb),
    'locate_rules', jsonb_build_object('wait_days', coalesce(st.locate_wait_days, 3), 'valid_days', coalesce(st.locate_valid_days, 15)),
    'client', jsonb_build_object(
      'name', p.client_name,
      'phone', case when p.crew_hide_client_phone then null else p.client_phone end,
      'notes_for_crew', p.crew_client_notes),
    'crew_notes', jsonb_build_object('text', p.crew_notes, 'photos', coalesce(p.crew_note_photos, '[]'::jsonb)),
    'features', v_scope,
    'general_scope', v_general,
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', mi.id, 'feature_id', ms.feature_id, 'section', ms.name, 'name', mi.name, 'color', mi.color,
               'product', pc.name, 'quantity', mi.quantity, 'unit', mi.unit, 'waste_percent', mi.waste_percent,
               'planned_quantity', coalesce((select b.quantity from public.materials_item_baselines b
                                              where b.materials_item_id = mi.id and b.reason is not null
                                              order by b.created_at desc limit 1), mi.quantity),
               'conversion_factor', mi.conversion_factor, 'conversion_unit', mi.conversion_unit, 'tracked', mi.tracked,
               'orders', coalesce((
                 select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit', oi.unit,
                                                     'status', coalesce(oi.status, mo.status), 'expected_date', mo.expected_delivery_date))
                   from public.material_order_items oi join public.material_orders mo on mo.id = oi.material_order_id
                  where oi.materials_item_id = mi.id), '[]'::jsonb)
             ) order by ms.sort_order, mi.sort_order)
        from public.materials_items mi
        join public.materials_sections ms on ms.id = mi.section_id
        left join public.project_features f on f.id = ms.feature_id
        left join public.product_catalog pc on pc.id = mi.catalog_product_id
       where ms.project_id = p.id and coalesce(mi.cost_type, 'material') = 'material'
         and (ms.feature_id is null or f.status = 'active')), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('id', mo.id, 'supplier', mo.supplier, 'expected_date', mo.expected_delivery_date, 'status', mo.status)
                       order by mo.expected_delivery_date nulls last)
        from public.material_orders mo where mo.project_id = p.id and mo.status <> 'delivered'), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', pi.id, 'storage_path', pi.storage_path, 'caption', pi.caption) order by pi.sort_order, pi.created_at)
        from public.project_images pi where pi.project_id = p.id), '[]'::jsonb),
    'delays', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.delay_date, 'days', d.days, 'reason', d.reason) order by d.created_at desc)
        from public.schedule_delays d
       where d.undone_at is null and (d.project_id = p.id or d.changes @> jsonb_build_array(jsonb_build_object('project_id', p.id)))), '[]'::jsonb),
    'updated_at', greatest(
      p.updated_at,
      (select max(updated_at) from public.project_feature_measurements where project_id = p.id),
      (select max(co.approved_at) from public.change_orders co where co.project_id = p.id),
      (select max(updated_at) from public.material_orders where project_id = p.id),
      (select max(updated_at) from public.project_precon_items where project_id = p.id))
  );
end;
$$;

/** Scope fingerprint — what "Reviewed" and "changed since" key on. */
create or replace function public._crew_version(p_json jsonb)
returns text language sql immutable as $$
  select md5(jsonb_build_object(
    'project', p_json->'project', 'site', p_json->'site', 'permits', p_json->'permits', 'client', p_json->'client',
    'crew_notes', p_json->'crew_notes', 'features', p_json->'features', 'general_scope', p_json->'general_scope',
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m->'id', 'name', m->'name', 'color', m->'color', 'planned_quantity', m->'planned_quantity', 'unit', m->'unit')), '[]'::jsonb)
                    from jsonb_array_elements(p_json->'materials') m)
  )::text);
$$;

/** The work order: owner (preview) or an assigned, active crew member. */
create or replace function public.get_crew_work_order(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; e public.employees; v_ver text;
begin
  if not public._crew_can_see(p_project_id) then return null; end if;
  v := public.crew_work_order_json(p_project_id);
  if v is null then return null; end if;
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

create or replace function public.crew_work_order_opened(p_project_id uuid, p_version text, p_snapshot jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e public.employees;
begin
  e := public._crew_employee(p_project_id);
  if e.id is null then return; end if;   -- the owner's preview isn't an "open"
  insert into public.work_order_opens (project_id, employee_id, version, snapshot, opened_at)
  values (p_project_id, e.id, p_version, p_snapshot, now())
  on conflict (project_id, employee_id) do update set version = excluded.version, snapshot = excluded.snapshot, opened_at = now();
end;
$$;

create or replace function public.crew_review_work_order(p_project_id uuid, p_version text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.employees;
begin
  e := public._crew_employee(p_project_id);
  if e.id is null or not e.is_lead then raise exception 'Only a crew lead can mark a work order reviewed.'; end if;
  insert into public.work_order_reviews (project_id, employee_id, employee_name, version) values (p_project_id, e.id, e.name, p_version);
  insert into public.project_events (project_id, user_id, kind, summary, meta)
  select p_project_id, p.user_id, 'work_order_reviewed', e.name || ' reviewed the work order', jsonb_build_object('version', p_version)
    from public.projects p where p.id = p_project_id;
end;
$$;

/** Crew usage logging — only with "Can log material usage", only on their jobs. */
create or replace function public.crew_log_usage(p_item_id uuid, p_quantity numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; e public.employees;
begin
  select ms.project_id into v_project from public.materials_items mi join public.materials_sections ms on ms.id = mi.section_id where mi.id = p_item_id;
  if v_project is null then raise exception 'Material line not found.'; end if;
  e := public._crew_employee(v_project);
  if e.id is null or not e.can_log_usage then raise exception 'You don''t have permission to log material usage.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Enter a quantity.'; end if;
  insert into public.materials_usage_logs (materials_item_id, quantity, note, logged_by)
  values (p_item_id, p_quantity, nullif(trim(coalesce(p_note, '')), ''), e.name);
end;
$$;

revoke all on function public._crew_employee(uuid) from public, anon, authenticated;
revoke all on function public._crew_can_see(uuid) from public, anon, authenticated;
revoke all on function public.crew_work_order_json(uuid) from public, anon, authenticated;
revoke all on function public._crew_version(jsonb) from public, anon, authenticated;
revoke all on function public.crew_projects() from public, anon;
revoke all on function public.get_crew_work_order(uuid) from public, anon;
revoke all on function public.crew_work_order_opened(uuid, text, jsonb) from public, anon;
revoke all on function public.crew_review_work_order(uuid, text) from public, anon;
revoke all on function public.crew_log_usage(uuid, numeric, text) from public, anon;
grant execute on function public.crew_projects() to authenticated;
grant execute on function public.get_crew_work_order(uuid) to authenticated;
grant execute on function public.crew_work_order_opened(uuid, text, jsonb) to authenticated;
grant execute on function public.crew_review_work_order(uuid, text) to authenticated;
grant execute on function public.crew_log_usage(uuid, numeric, text) to authenticated;

-- Crew-note photos: images bucket, crew-notes/{project_id}/… — the owner
-- manages them; assigned crew can view. (Table RLS doesn't cover Storage.)
drop policy if exists "own crew-note photos all" on storage.objects;
create policy "own crew-note photos all" on storage.objects for all to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'crew-notes'
         and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()))
  with check (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'crew-notes'
              and exists (select 1 from public.projects p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.user_id = auth.uid()));
drop policy if exists "crew views crew-note photos" on storage.objects;
create policy "crew views crew-note photos" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'crew-notes'
         and exists (select 1 from public.employee_project_assignments a join public.employees e on e.id = a.employee_id
                      where a.project_id::text = (storage.foldername(storage.objects.name))[2]
                        and e.auth_user_id = auth.uid() and e.status = 'active'));
