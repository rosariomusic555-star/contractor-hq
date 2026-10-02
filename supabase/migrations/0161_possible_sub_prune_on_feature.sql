-- 0161 — Possible subs: prune when a project FEATURE is removed, not when
-- project_categories loses a row.
--
-- 0160 dropped a type from the job's possible subs on every
-- project_categories delete. But project_categories is a copy the 0105 sync
-- rebuilds, and it deletes rows for a moment along the way: creating a
-- project inserts its types in one statement, the first type's
-- ensure-feature trigger runs the sync before the other types have their
-- features, and those rows are deleted and re-inserted. Each of those
-- passing deletes pruned real links (seen live: a new project lost its
-- items' second feature).
--
-- Now the project side prunes on what a removal really is: a feature going
-- from active/proposed to removed, being deleted, or changing type — and
-- only when no other active/proposed feature of that type is left on the
-- project. The opportunity side (opportunity_categories, before there's a
-- project) is unchanged: nothing rebuilds that table.

drop trigger if exists project_categories_prune_subs on public.project_categories;
drop function if exists public.prune_possible_sub_categories_project();

create or replace function public.prune_possible_sub_categories_feature()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.category_id is null or old.status not in ('active', 'proposed') then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.category_id is not distinct from old.category_id
     and new.status in ('active', 'proposed') then
    return null;
  end if;
  if exists (
    select 1 from public.project_features f
     where f.project_id = old.project_id
       and f.category_id = old.category_id
       and f.status in ('active', 'proposed')
  ) then
    return null;
  end if;
  delete from public.possible_sub_categories psc
   using public.possible_subs s, public.opportunities o
   where psc.possible_sub_id = s.id
     and s.opportunity_id = o.id
     and o.project_id = old.project_id
     and psc.category_id = old.category_id;
  return null;
end;
$$;

drop trigger if exists project_features_prune_subs on public.project_features;
create trigger project_features_prune_subs
  after update of status, category_id or delete on public.project_features
  for each row execute function public.prune_possible_sub_categories_feature();

-- Check: the old trigger is gone, the new one exists.
select
  exists (select 1 from pg_trigger where tgname = 'project_categories_prune_subs') as old_trigger_still_there,
  exists (select 1 from pg_trigger where tgname = 'project_features_prune_subs') as new_trigger;
