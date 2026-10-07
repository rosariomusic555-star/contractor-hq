-- 0167 — Lighter material usage tracking.
--
-- "Tracked" on a cost plan line now means usage tracking only (Log usage +
-- planned vs used). Ordering / delivery status works for every material
-- line, tracked or not (app side).
--
-- 1. material_categories.track_usage_default — per category, whether new
--    lines in it are usage-tracked. ON only for base gravel / aggregate
--    (crushed stone, drainage gravel…) and bedding sand; OFF for the rest.
--    Settings › Material categories. suggest_category_tracks_usage(name) is
--    the name rule — it backfills every category, and fills new ones on
--    insert when not given (so the new-account seed gets it unchanged).
-- 2. business_profile.show_over_estimate_notes — the quiet "Used 14 of 12
--    ton" note on lines (default on). Off = over-estimate in reports only.
-- 3. materials_items.tracked no longer defaults to true: an insert that
--    doesn't say gets its category's default (a material line with no
--    category → not tracked; non-material lines → not tracked). Every insert
--    path — the app, change orders, selections — goes through this.
-- 4. Existing lines: a tracked material line whose category is now off by
--    default (or that has no category) and has no usage logged yet → not
--    tracked. Lines with usage logged are left alone. The last statement
--    reports how many changed.

-- 1 ---------------------------------------------------------------------------
alter table public.material_categories add column if not exists track_usage_default boolean;

create or replace function public.suggest_category_tracks_usage(p_name text)
returns boolean
language sql
immutable
as $$
  select n !~ '\y(polymeric|poly)\y'
     and (
       n ~ '\y(aggregates?|crushed stone|drainage gravel|bedding sand|paver base|screenings|stone dust|road base|crusher run)\y'
       or n ~ '\ybase\y'
     )
  from (select lower(trim(coalesce(p_name, ''))) as n) s
$$;

create or replace function public.material_category_fill_track_usage()
returns trigger
language plpgsql
as $$
begin
  if new.track_usage_default is null then
    new.track_usage_default := public.suggest_category_tracks_usage(new.name);
  end if;
  return new;
end $$;

drop trigger if exists material_category_fill_track_usage on public.material_categories;
create trigger material_category_fill_track_usage
  before insert on public.material_categories
  for each row execute function public.material_category_fill_track_usage();

update public.material_categories
   set track_usage_default = public.suggest_category_tracks_usage(name)
 where track_usage_default is null;

alter table public.material_categories alter column track_usage_default set not null;

-- 2 ---------------------------------------------------------------------------
alter table public.business_profile
  add column if not exists show_over_estimate_notes boolean not null default true;

-- 3 ---------------------------------------------------------------------------
-- Still NOT NULL: the trigger fills it before the constraint is checked.
alter table public.materials_items alter column tracked drop default;

create or replace function public.materials_item_fill_tracked()
returns trigger
language plpgsql
as $$
begin
  if new.tracked is null then
    new.tracked := coalesce(new.cost_type, 'material') = 'material'
      and coalesce((select c.track_usage_default from public.material_categories c where c.id = new.material_category_id), false);
  end if;
  return new;
end $$;

drop trigger if exists materials_item_fill_tracked on public.materials_items;
create trigger materials_item_fill_tracked
  before insert on public.materials_items
  for each row execute function public.materials_item_fill_tracked();

-- 4 ---------------------------------------------------------------------------
-- Report: lines switched to not tracked, by reason.
with changed as (
  update public.materials_items i
     set tracked = false
   where i.tracked
     and coalesce(i.cost_type, 'material') = 'material'
     and not coalesce((select c.track_usage_default from public.material_categories c where c.id = i.material_category_id), false)
     and not exists (select 1 from public.materials_usage_logs u where u.materials_item_id = i.id)
  returning i.material_category_id
)
select case when material_category_id is null then 'no category' else 'category now off by default' end as reason,
       count(*) as lines_untracked
  from changed
 group by 1
union all
select 'kept tracked (usage already logged)', count(*)
  from public.materials_items i
 where i.tracked
   and coalesce(i.cost_type, 'material') = 'material'
   and not coalesce((select c.track_usage_default from public.material_categories c where c.id = i.material_category_id), false)
   and exists (select 1 from public.materials_usage_logs u where u.materials_item_id = i.id);
