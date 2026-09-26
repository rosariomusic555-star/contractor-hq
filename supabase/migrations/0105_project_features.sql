-- =============================================================================
-- 0105 — Project features as first-class records (Phase A)
--
-- A project feature is one thing being built on a job: "Paver Patio · Back
-- patio", a second patio, the fire pit. Its type is a Job Category (the same
-- Project types the pickers already use). Measurements, Cost plan sections
-- and quote sections point at a feature_id; change order lines, expenses and
-- labor entries get the column now and are wired up in later phases.
--
-- project_categories stays, as a trigger-maintained copy of the distinct
-- types of a project's active + proposed features, so every screen that reads
-- "project types" keeps working unchanged. Writers go through features:
--   * set_project_feature_types() — the type multi-selects
--   * a project_categories insert (older SQL writers such as
--     get_or_create_opportunity_project) creates the missing feature
--
-- status:  active   — part of the job's scope (original, or an approved add-on)
--          proposed — on an add-on quote that isn't approved yet (Phase D)
--          removed  — deselected / declined; kept for history, never deleted
-- source_quote_id: null = original scope; the add-on quote otherwise.
-- =============================================================================

-- The approved-quote lock (0033) still blocks every client-visible change to
-- a signed quote's sections, but not internal bookkeeping tags: which project
-- type / feature a section prices, and how its cost is matched. Features have
-- to attach to signed quotes (this backfill, change orders, add-ons).
create or replace function public.reject_edit_on_approved_quote_sections()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_status text;
  v_internal constant text[] := array['job_category_id', 'feature_id', 'materials_link_mode'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_internal) = (to_jsonb(old) - v_internal) then
    return new;
  end if;
  select status into v_status from public.quotes where id = v_quote_id;
  if v_status = 'approved' then
    raise exception 'Cannot edit an approved quote''s sections — save from the quote builder, which reverts it to draft first.';
  end if;
  return coalesce(new, old);
end;
$$;

create table if not exists public.project_features (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  category_id     uuid references public.categories (id) on delete set null,
  label           text,
  status          text not null default 'active' check (status in ('proposed', 'active', 'removed')),
  source_quote_id uuid references public.quotes (id) on delete set null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists project_features_project_id_idx on public.project_features (project_id);

drop trigger if exists project_features_set_updated_at on public.project_features;
create trigger project_features_set_updated_at before update on public.project_features
  for each row execute function public.set_updated_at();

alter table public.project_features enable row level security;

drop policy if exists "own" on public.project_features;
create policy "own" on public.project_features for all to authenticated
  using      (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "employees excluded" on public.project_features;
create policy "employees excluded" on public.project_features
  as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee());

revoke all on public.project_features from anon;

-- feature_id everywhere a cost / scope row can belong to a feature. Null =
-- General (project-wide) or, for standalone quotes, no project at all.
alter table public.project_feature_measurements add column if not exists feature_id uuid references public.project_features (id) on delete set null;
alter table public.materials_sections           add column if not exists feature_id uuid references public.project_features (id) on delete set null;
alter table public.quote_sections               add column if not exists feature_id uuid references public.project_features (id) on delete set null;
alter table public.change_order_items           add column if not exists feature_id uuid references public.project_features (id) on delete set null;
alter table public.expenses                     add column if not exists feature_id uuid references public.project_features (id) on delete set null;
alter table public.expense_lines                add column if not exists feature_id uuid references public.project_features (id) on delete set null;
alter table public.labor_entries                add column if not exists feature_id uuid references public.project_features (id) on delete set null;

create index if not exists project_feature_measurements_feature_id_idx on public.project_feature_measurements (feature_id);
create index if not exists materials_sections_feature_id_idx           on public.materials_sections (feature_id);
create index if not exists quote_sections_feature_id_idx               on public.quote_sections (feature_id);
create index if not exists change_order_items_feature_id_idx           on public.change_order_items (feature_id);
create index if not exists expenses_feature_id_idx                     on public.expenses (feature_id);
create index if not exists expense_lines_feature_id_idx                on public.expense_lines (feature_id);
create index if not exists labor_entries_feature_id_idx                on public.labor_entries (feature_id);

-- ---------------------------------------------------------------------------
-- Build type <-> Job Category name matching (mirrors buildTypeForCategoryName
-- in src/lib/measurements.ts: the build type's label + BUILD_TYPE_ALIASES,
-- compared case/punctuation-insensitively).
-- ---------------------------------------------------------------------------

create or replace function public.normalize_type_name(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

create or replace function public.build_type_for_category_name(p_name text)
returns text language sql immutable as $$
  select bt from (values
    ('paver_patio', 'Paver Patio'), ('paver_patio', 'Patio'), ('paver_patio', 'Pavers'), ('paver_patio', 'Paver'),
    ('outdoor_kitchen', 'Outdoor Kitchen'), ('outdoor_kitchen', 'Kitchen'), ('outdoor_kitchen', 'BBQ Island'), ('outdoor_kitchen', 'Grill Island'),
    ('seating_wall', 'Seating Wall'), ('seating_wall', 'Seat Wall'), ('seating_wall', 'Seat Walls'), ('seating_wall', 'Seating Walls'),
    ('fire_pit', 'Fire Pit'), ('fire_pit', 'Fire Pit / Fireplace'), ('fire_pit', 'Firepit'), ('fire_pit', 'Fireplace'), ('fire_pit', 'Fire Feature'),
    ('outdoor_lighting', 'Outdoor Lighting'), ('outdoor_lighting', 'Lighting'), ('outdoor_lighting', 'Landscape Lighting'),
    ('walkway', 'Walkway'), ('walkway', 'Walkways'), ('walkway', 'Path'), ('walkway', 'Pathway'), ('walkway', 'Sidewalk'),
    ('driveway', 'Driveway'), ('driveway', 'Driveways'),
    ('retaining_wall', 'Retaining Wall'), ('retaining_wall', 'Retaining Walls'),
    ('steps', 'Steps'), ('steps', 'Stairs'), ('steps', 'Step'),
    ('pillars', 'Pillars / Columns'), ('pillars', 'Pillars'), ('pillars', 'Columns'), ('pillars', 'Pillar'), ('pillars', 'Column')
  ) as a(bt, alias)
  where public.normalize_type_name(alias) = public.normalize_type_name(p_name)
    and public.normalize_type_name(p_name) <> ''
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Backfill (runs before the sync triggers exist, so project_categories is
-- read, never rewritten, while features are being created).
-- ---------------------------------------------------------------------------

do $$
declare
  r        record;
  v_feat   uuid;
  v_cat    uuid;
  v_n      int;
  v_count  int;
begin
  -- 1. One active feature per existing project type.
  insert into public.project_features (project_id, category_id, status, sort_order)
  select pc.project_id, pc.category_id, 'active',
         row_number() over (partition by pc.project_id order by c.sort_order, c.name) - 1
  from public.project_categories pc
  join public.categories c on c.id = pc.category_id
  where not exists (select 1 from public.project_features f where f.project_id = pc.project_id);

  -- 2. Measurement instances. The Nth instance of a build type on a project
  --    goes to the Nth feature of the matching type, creating extra features
  --    for extra instances ("+ Add another patio" = a second patio feature).
  --    An instance whose type isn't on the project gets a *removed* feature
  --    so its data is kept but hidden.
  for r in
    select m.id, m.project_id, m.build_type, m.label, p.user_id,
           row_number() over (partition by m.project_id, m.build_type order by m.sort_order, m.created_at) as n
    from public.project_feature_measurements m
    join public.projects p on p.id = m.project_id
    where m.feature_id is null
    order by m.project_id, m.build_type, n
  loop
    -- the project's category for this build type, else the user's
    select f.category_id into v_cat
    from public.project_features f
    join public.categories c on c.id = f.category_id
    where f.project_id = r.project_id and public.build_type_for_category_name(c.name) = r.build_type
    limit 1;

    if v_cat is not null then
      select count(*) into v_count
      from public.project_features f
      where f.project_id = r.project_id and f.category_id = v_cat and f.status = 'active';

      if r.n <= v_count then
        select f.id into v_feat from public.project_features f
        where f.project_id = r.project_id and f.category_id = v_cat and f.status = 'active'
        order by f.sort_order, f.created_at offset r.n - 1 limit 1;
      else
        insert into public.project_features (project_id, category_id, label, status, sort_order)
        values (r.project_id, v_cat, r.label, 'active',
                (select coalesce(max(sort_order), -1) + 1 from public.project_features where project_id = r.project_id))
        returning id into v_feat;
      end if;
    else
      select c.id into v_cat from public.categories c
      where c.user_id = r.user_id and public.build_type_for_category_name(c.name) = r.build_type
      order by c.sort_order limit 1;

      insert into public.project_features (project_id, category_id, label, status, sort_order)
      values (r.project_id, v_cat, r.label, 'removed',
              (select coalesce(max(sort_order), -1) + 1 from public.project_features where project_id = r.project_id))
      returning id into v_feat;
    end if;

    update public.project_feature_measurements set feature_id = v_feat where id = r.id;
    update public.project_features set label = r.label where id = v_feat and label is null and r.label is not null;
    v_cat := null;
  end loop;

  -- 3. Cost plan sections (non-General). Type from job_category_id, else a
  --    project type whose name the section name contains. The Nth section of
  --    a type on a sheet -> the Nth feature of that type (extra sections share
  --    the first feature).
  for r in
    select s.id, s.project_id, s.sheet_id, s.name, s.job_category_id
    from public.materials_sections s
    where s.feature_id is null and not coalesce(s.is_general, false)
    order by s.sheet_id, s.sort_order, s.id
  loop
    v_cat := r.job_category_id;
    if v_cat is null then
      select f.category_id into v_cat
      from public.project_features f
      join public.categories c on c.id = f.category_id
      where f.project_id = r.project_id and f.status = 'active'
        and public.normalize_type_name(r.name) like '%' || public.normalize_type_name(c.name) || '%'
      order by length(c.name) desc limit 1;
      if v_cat is not null then
        update public.materials_sections set job_category_id = v_cat where id = r.id;
      end if;
    end if;
    continue when v_cat is null;

    select count(*) + 1 into v_n from public.materials_sections s2
    where s2.sheet_id = r.sheet_id and s2.feature_id is not null
      and s2.feature_id in (select id from public.project_features where project_id = r.project_id and category_id = v_cat);

    select f.id into v_feat from public.project_features f
    where f.project_id = r.project_id and f.category_id = v_cat and f.status = 'active'
    order by f.sort_order, f.created_at offset v_n - 1 limit 1;
    if v_feat is null then
      select f.id into v_feat from public.project_features f
      where f.project_id = r.project_id and f.category_id = v_cat and f.status = 'active'
      order by f.sort_order, f.created_at limit 1;
    end if;

    update public.materials_sections set feature_id = v_feat where id = r.id;
    v_feat := null;
  end loop;

  -- 4. Quote sections on project quotes — same matching, per quote.
  for r in
    select qs.id, q.project_id, qs.quote_id, qs.name, qs.job_category_id
    from public.quote_sections qs
    join public.quotes q on q.id = qs.quote_id
    where qs.feature_id is null and q.project_id is not null
    order by qs.quote_id, qs.sort_order, qs.id
  loop
    v_cat := r.job_category_id;
    if v_cat is null then
      select f.category_id into v_cat
      from public.project_features f
      join public.categories c on c.id = f.category_id
      where f.project_id = r.project_id and f.status = 'active'
        and public.normalize_type_name(r.name) like '%' || public.normalize_type_name(c.name) || '%'
      order by length(c.name) desc limit 1;
      if v_cat is not null then
        update public.quote_sections set job_category_id = v_cat where id = r.id;
      end if;
    end if;
    continue when v_cat is null;

    select count(*) + 1 into v_n from public.quote_sections s2
    where s2.quote_id = r.quote_id and s2.feature_id is not null
      and s2.feature_id in (select id from public.project_features where project_id = r.project_id and category_id = v_cat);

    select f.id into v_feat from public.project_features f
    where f.project_id = r.project_id and f.category_id = v_cat and f.status = 'active'
    order by f.sort_order, f.created_at offset v_n - 1 limit 1;
    if v_feat is null then
      select f.id into v_feat from public.project_features f
      where f.project_id = r.project_id and f.category_id = v_cat and f.status = 'active'
      order by f.sort_order, f.created_at limit 1;
    end if;

    update public.quote_sections set feature_id = v_feat where id = r.id;
    v_feat := null;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Keep project_categories = distinct types of active + proposed features.
-- ---------------------------------------------------------------------------

create or replace function public.sync_project_categories(p_project_id uuid)
returns void language plpgsql as $$
begin
  delete from public.project_categories pc
  where pc.project_id = p_project_id
    and not exists (
      select 1 from public.project_features f
      where f.project_id = p_project_id and f.category_id = pc.category_id and f.status in ('active', 'proposed')
    );
  insert into public.project_categories (project_id, category_id)
  select distinct p_project_id, f.category_id
  from public.project_features f
  where f.project_id = p_project_id and f.category_id is not null and f.status in ('active', 'proposed')
  on conflict do nothing;
end;
$$;

create or replace function public.project_features_sync_categories()
returns trigger language plpgsql as $$
begin
  perform public.sync_project_categories(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;

drop trigger if exists project_features_sync_categories on public.project_features;
create trigger project_features_sync_categories
  after insert or update of status, category_id or delete on public.project_features
  for each row execute function public.project_features_sync_categories();

-- A type added straight to project_categories (older SQL writers) gets a
-- feature: revive the most recent removed original one, else create one.
create or replace function public.project_categories_ensure_feature()
returns trigger language plpgsql as $$
declare
  v_id uuid;
begin
  if exists (
    select 1 from public.project_features f
    where f.project_id = new.project_id and f.category_id = new.category_id and f.status in ('active', 'proposed')
  ) then
    return null;
  end if;

  select f.id into v_id from public.project_features f
  where f.project_id = new.project_id and f.category_id = new.category_id
    and f.status = 'removed' and f.source_quote_id is null
  order by f.updated_at desc limit 1;

  if v_id is not null then
    update public.project_features set status = 'active' where id = v_id;
  else
    insert into public.project_features (project_id, category_id, status, sort_order)
    values (new.project_id, new.category_id, 'active',
            (select coalesce(max(sort_order), -1) + 1 from public.project_features where project_id = new.project_id));
  end if;
  return null;
end;
$$;

drop trigger if exists project_categories_ensure_feature on public.project_categories;
create trigger project_categories_ensure_feature
  after insert on public.project_categories
  for each row execute function public.project_categories_ensure_feature();

-- ---------------------------------------------------------------------------
-- The Project type multi-selects: make the project's active types exactly
-- p_category_ids. A deselected type's features become removed (data kept); a
-- re-selected type revives its removed feature. Proposed (add-on) features
-- are never touched here.
-- ---------------------------------------------------------------------------

create or replace function public.set_project_feature_types(p_project_id uuid, p_category_ids uuid[])
returns void language plpgsql as $$
declare
  v_cat uuid;
  v_id  uuid;
begin
  update public.project_features
     set status = 'removed'
   where project_id = p_project_id
     and status = 'active'
     and category_id is not null
     and not (category_id = any (coalesce(p_category_ids, '{}')));

  foreach v_cat in array coalesce(p_category_ids, '{}') loop
    continue when exists (
      select 1 from public.project_features f
      where f.project_id = p_project_id and f.category_id = v_cat and f.status in ('active', 'proposed')
    );
    select f.id into v_id from public.project_features f
    where f.project_id = p_project_id and f.category_id = v_cat
      and f.status = 'removed' and f.source_quote_id is null
    order by f.updated_at desc limit 1;
    if v_id is not null then
      update public.project_features set status = 'active' where id = v_id;
    else
      insert into public.project_features (project_id, category_id, status, sort_order)
      values (p_project_id, v_cat, 'active',
              (select coalesce(max(sort_order), -1) + 1 from public.project_features where project_id = p_project_id));
    end if;
    v_id := null;
  end loop;
end;
$$;

grant execute on function public.set_project_feature_types(uuid, uuid[]) to authenticated;

-- Per-project check: features, and what's attached to them.
select p.name as project,
       count(distinct f.id) filter (where f.status = 'active')  as active_features,
       count(distinct f.id) filter (where f.status = 'removed') as removed_features,
       (select count(*) from public.project_feature_measurements m where m.project_id = p.id and m.feature_id is null) as unattached_measurements,
       (select count(*) from public.materials_sections s where s.project_id = p.id and s.feature_id is null and not coalesce(s.is_general, false)) as unattached_plan_sections,
       (select count(*) from public.quote_sections qs join public.quotes q on q.id = qs.quote_id where q.project_id = p.id and qs.feature_id is null) as unattached_quote_sections
from public.projects p
left join public.project_features f on f.project_id = p.id
group by p.id, p.name
order by p.name;
