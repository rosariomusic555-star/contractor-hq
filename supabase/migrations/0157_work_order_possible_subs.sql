-- 0157 — Crew work order: possible subcontracted work (info only).
--
-- Adds `possible_subs` — the linked opportunity's possible subcontracted
-- items (0155): label, note and project type name only, never a price.
-- Added after the version hash is computed, so editing the list doesn't
-- flag the work order as changed for the crew. Otherwise identical to
-- 0154's get_crew_work_order.

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
                           from (select * from public.work_order_reviews where project_id = p_project_id order by reviewed_at desc limit 5) r), '[]'::jsonb),
    'possible_subs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', left(s->>'label', 120),
               'note', left(nullif(s->>'note', ''), 500),
               'type', c.name))
        from public.opportunities o,
             jsonb_array_elements(coalesce(o.possible_subs, '[]'::jsonb)) s
        left join public.categories c on c.id = nullif(s->>'category_id', '')::uuid
       where o.project_id = p_project_id), '[]'::jsonb)
  );
end;
$$;
