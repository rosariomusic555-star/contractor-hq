-- ContractorHQ — Default pre-construction checklist changes apply to future
-- projects only. Run AFTER 0136.
--
-- precon_ensure_project (0124) copied every active template item a job was
-- missing, every time its checklist loaded — so adding an item to the
-- default list (Settings › Pre-construction) also added it to jobs already
-- in progress. Now a job's checklist is copied from the template ONCE, the
-- first time it's used; after that it's that job's own list (edited on the
-- project page: rename, reorder, remove, add), and template edits only reach
-- jobs that haven't started a checklist yet.

create or replace function public.precon_ensure_project(p_project_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.is_employee() then return 0; end if;
  if not exists (select 1 from public.projects where id = p_project_id and user_id = v_uid) then return 0; end if;
  -- Already has its own checklist (incl. items removed on this job): leave it.
  if exists (select 1 from public.project_precon_items where project_id = p_project_id) then return 0; end if;
  perform public.precon_seed_template();
  insert into public.project_precon_items (user_id, project_id, template_item_id, key, label, kind, required, sort_order)
  select v_uid, p_project_id, t.id, t.key, t.label, t.kind, t.required, t.sort_order
    from public.precon_template_items t
   where t.user_id = v_uid and t.active
  on conflict (project_id, key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
