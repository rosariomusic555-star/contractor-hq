-- 0155 — Opportunities: archive, safe delete, possible subcontracted work.
--
-- 1. opportunities.archived_at — archived opportunities are hidden from the
--    pipeline and lists, restorable from the Opportunities page's "Archived"
--    filter. Null = live.
-- 2. opportunities.possible_subs — subcontracted work spotted at the site
--    visit: [{ id, kind, label, note, category_id }]. Shown as Cost plan
--    suggestions and (info only) on the crew work order.
-- 3. opportunity_delete_check(id) / delete_opportunity(id) — what's attached,
--    what blocks a delete, and the delete itself. Security invoker: RLS
--    still decides what the caller can see and delete. A delete is refused
--    (archive instead) when anything was sent / signed / paid / shown in
--    the Client Hub, invoices or payments exist, the opportunity is Won, or
--    its project is a real job (started, or existed before the opportunity
--    — a manual link). The hidden background project is deleted only when
--    none of that applies, i.e. it was never Won.

alter table public.opportunities add column if not exists archived_at timestamptz;
alter table public.opportunities add column if not exists possible_subs jsonb not null default '[]'::jsonb;

create or replace function public.opportunity_delete_check(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  o public.opportunities;
  p public.projects;
  v_blockers text[] := '{}';
  v_counts jsonb;
  n int;
begin
  select * into o from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Opportunity not found';
  end if;
  if o.project_id is not null then
    select * into p from public.projects where id = o.project_id;
  end if;

  if o.stage = 'won' then
    v_blockers := v_blockers || 'It''s Won';
  end if;

  if p.id is not null then
    if p.created_at < o.created_at then
      v_blockers := v_blockers || 'It''s linked to an existing project';
    end if;
    if p.status in ('in_progress', 'complete') or p.actual_start_date is not null then
      v_blockers := v_blockers || 'Work on its project has started';
    end if;
    select count(*) into n from public.quotes q
      where q.project_id = p.id and (q.status <> 'draft' or q.signed_at is not null);
    if n > 0 then v_blockers := v_blockers || format('%s quote(s) were sent or signed', n); end if;
    select count(*) into n from public.invoices where project_id = p.id;
    if n > 0 then v_blockers := v_blockers || format('%s invoice(s)', n); end if;
    select count(*) into n from public.payments where project_id = p.id;
    if n > 0 then v_blockers := v_blockers || format('%s payment(s)', n); end if;
    select count(*) into n from public.change_orders where project_id = p.id and status <> 'draft';
    if n > 0 then v_blockers := v_blockers || format('%s change order(s) were sent', n); end if;
    select count(*) into n from public.progress_updates where project_id = p.id and status = 'shared';
    if n > 0 then v_blockers := v_blockers || 'Progress updates were shared with the client'; end if;
    select count(*) into n from public.project_messages where project_id = p.id;
    if n > 0 then v_blockers := v_blockers || 'There are Client Hub messages'; end if;
    select count(*) into n from public.document_versions where project_id = p.id;
    if n > 0 then v_blockers := v_blockers || 'Documents were shared in the Client Hub'; end if;
  end if;

  v_counts := jsonb_build_object(
    'project', p.id is not null,
    'cost_plans', (select count(*) from public.materials_sheets where project_id = p.id),
    'quotes', (select count(*) from public.quotes where project_id = p.id),
    'measurements',
      (select count(*) from public.project_feature_measurements where project_id = p.id)
      + (select count(*) from public.project_measurements where project_id = p.id),
    'photos',
      (select count(*) from public.project_images where project_id = p.id)
      + (select count(*) from public.opportunity_photos where opportunity_id = o.id),
    'appointments', (select count(*) from public.appointments where opportunity_id = o.id),
    'tasks', (select count(*) from public.tasks where opportunity_id = o.id)
  );

  return jsonb_build_object('can_delete', cardinality(v_blockers) = 0, 'blockers', to_jsonb(v_blockers), 'counts', v_counts);
end;
$$;

create or replace function public.delete_opportunity(p_opportunity_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  o public.opportunities;
  v_check jsonb;
begin
  select * into o from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Opportunity not found';
  end if;
  v_check := public.opportunity_delete_check(p_opportunity_id);
  if not (v_check->>'can_delete')::boolean then
    raise exception 'This opportunity can''t be deleted (%). Archive it instead.',
      array_to_string(array(select jsonb_array_elements_text(v_check->'blockers')), '; ');
  end if;

  -- History stays: one activity on the client (its opportunity link is
  -- cleared by the FK once the opportunity is gone).
  insert into public.activities (client_id, kind, summary, meta)
  values (o.client_id, 'opportunity_deleted', format('Deleted opportunity "%s"', o.title),
          jsonb_build_object('opportunity_id', o.id, 'title', o.title, 'project_id', o.project_id));

  delete from public.appointments where opportunity_id = o.id;
  delete from public.tasks where opportunity_id = o.id;
  delete from public.opportunities where id = o.id;
  -- The never-Won background project (and everything hanging off it:
  -- cost plan, draft quotes, measurements, photos rows).
  if o.project_id is not null then
    delete from public.projects where id = o.project_id;
  end if;
end;
$$;

grant execute on function public.opportunity_delete_check(uuid) to authenticated;
grant execute on function public.delete_opportunity(uuid) to authenticated;

-- Check: both columns exist.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'opportunities' and column_name in ('archived_at', 'possible_subs');
