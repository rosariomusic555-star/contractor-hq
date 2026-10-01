-- 0156 — Project types (categories): usage counts and reassign-before-delete.
--
-- Settings › Project types warns before deleting a type that's in use and
-- offers to move everything to another type first. Deleting on its own
-- never breaks records: the tag rows (opportunity_categories /
-- project_categories) cascade away and every other reference is set null
-- (0017–0105), so lines/sections/features just become untyped.
--
-- Security invoker: RLS decides what the caller can see and change.

create or replace function public.category_usage(p_category_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'opportunities', (select count(*) from public.opportunity_categories where category_id = p_category_id),
    'projects', (select count(*) from public.project_categories where category_id = p_category_id),
    'features', (select count(*) from public.project_features where category_id = p_category_id and status <> 'removed'),
    'quote_lines', (select count(*) from public.quote_items where category_id = p_category_id),
    'quote_sections', (select count(*) from public.quote_sections where job_category_id = p_category_id),
    'cost_plan_sections', (select count(*) from public.materials_sections where job_category_id = p_category_id),
    'change_order_lines', (select count(*) from public.change_order_items where category_id = p_category_id),
    'labor_entries', (select count(*) from public.labor_entries where category_id = p_category_id),
    'measurements', (select count(*) from public.project_measurements where category_id = p_category_id)
  );
$$;

-- Moves every reference from one type to another. Features move first, so
-- the project_categories insert below finds an active feature and its
-- ensure-feature trigger (0105) doesn't create a duplicate.
create or replace function public.reassign_category(p_from uuid, p_to uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_from = p_to then
    return;
  end if;
  if not exists (select 1 from public.categories where id = p_to) then
    raise exception 'The project type to move to doesn''t exist';
  end if;

  update public.project_features      set category_id = p_to     where category_id = p_from;
  update public.quote_items           set category_id = p_to     where category_id = p_from;
  update public.quote_sections        set job_category_id = p_to where job_category_id = p_from;
  update public.materials_sections    set job_category_id = p_to where job_category_id = p_from;
  update public.change_order_items    set category_id = p_to     where category_id = p_from;
  update public.labor_entries         set category_id = p_to     where category_id = p_from;
  update public.labor_plan_entries    set category_id = p_to     where category_id = p_from;
  update public.project_measurements  set category_id = p_to     where category_id = p_from;

  insert into public.opportunity_categories (opportunity_id, category_id)
    select opportunity_id, p_to from public.opportunity_categories where category_id = p_from
  on conflict do nothing;
  delete from public.opportunity_categories where category_id = p_from;

  insert into public.project_categories (project_id, category_id)
    select project_id, p_to from public.project_categories where category_id = p_from
  on conflict do nothing;
  delete from public.project_categories where category_id = p_from;
end;
$$;

grant execute on function public.category_usage(uuid) to authenticated;
grant execute on function public.reassign_category(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The approved-quote lock: 0105 already lets internal tags on an approved
-- quote's SECTIONS change (job_category_id, feature_id…). Its ITEMS lock
-- (0033) still refused every update — including the FK's own "set null"
-- when a project type is deleted, so deleting a type used on an approved
-- quote's lines failed. A change that only touches an item's internal
-- category tag (reporting only, never shown to the client) is now allowed;
-- everything the client signed stays locked.
-- ---------------------------------------------------------------------------

create or replace function public.reject_edit_on_approved_quote_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_section_id uuid := coalesce(new.section_id, old.section_id);
  v_status text;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'category_id' - 'updated_at') = (to_jsonb(old) - 'category_id' - 'updated_at') then
    return new;
  end if;
  select q.status into v_status
    from public.quotes q
    join public.quote_sections qs on qs.quote_id = q.id
   where qs.id = v_section_id;
  if v_status = 'approved' then
    raise exception 'Cannot edit an approved quote''s items — save from the quote builder, which reverts it to draft first.';
  end if;
  return coalesce(new, old);
end;
$$;
