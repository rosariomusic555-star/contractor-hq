-- 0160 — Possible subcontracted work: one item can serve several features.
--
-- Until now the items lived in opportunities.possible_subs (0155), a jsonb
-- list where each item had at most one project type (category_id). A gas
-- line can serve both the fire pit and the outdoor kitchen, so:
--
-- 1. possible_subs — one row per item (kind, label, note, order), owned
--    by the opportunity. Ids are kept from the jsonb where they were uuids.
-- 2. possible_sub_categories — item ↔ project type, many-to-many, in the
--    order picked. No rows = General (not tied to a feature).
-- 3. materials_items.possible_sub_id — a Cost plan line added from an item
--    ("Add as subcontractor line"). Any such line = the item was added; its
--    suggestion goes away and the opportunity shows "Added to cost plan".
--    Several lines can share one item (split across features).
-- 4. Removing a type from the job (opportunity_categories before there's
--    a project, project_categories after) drops it from the job's items.
--    The item stays; with nothing left it is General again. The app only
--    deletes the types that were actually removed (never delete-all +
--    re-insert), so saving the job's types doesn't wipe the links.
-- 5. reassign_category (0156) moves the items' links to the new type
--    before anything else, so the prune in 4 never sees them.
-- 6. get_crew_work_order — `type` lists every linked type still on the job,
--    e.g. "Fire Pit, Outdoor Kitchen". Otherwise identical to 0157.
--
-- opportunities.possible_subs is left in place (no longer read or written).

create table if not exists public.possible_subs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  kind            text not null default 'custom',
  label           text not null,
  note            text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists possible_subs_opportunity_idx on public.possible_subs (opportunity_id, sort_order);

drop trigger if exists possible_subs_set_updated_at on public.possible_subs;
create trigger possible_subs_set_updated_at before update on public.possible_subs
  for each row execute function public.set_updated_at();

create table if not exists public.possible_sub_categories (
  possible_sub_id uuid not null references public.possible_subs (id) on delete cascade,
  category_id     uuid not null references public.categories (id) on delete cascade,
  sort_order      int not null default 0,
  primary key (possible_sub_id, category_id)
);
create index if not exists possible_sub_categories_category_idx on public.possible_sub_categories (category_id);

alter table public.materials_items
  add column if not exists possible_sub_id uuid references public.possible_subs (id) on delete set null;
create index if not exists materials_items_possible_sub_idx on public.materials_items (possible_sub_id) where possible_sub_id is not null;

-- RLS: the opportunity's owner (opportunities are owned through the client).
alter table public.possible_subs enable row level security;
drop policy if exists "own" on public.possible_subs;
create policy "own" on public.possible_subs for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.opportunities o
      join public.clients c on c.id = o.client_id
      where o.id = opportunity_id and c.user_id = auth.uid()
    )
  );
revoke all on public.possible_subs from anon;

alter table public.possible_sub_categories enable row level security;
drop policy if exists "own" on public.possible_sub_categories;
create policy "own" on public.possible_sub_categories for all to authenticated
  using (exists (select 1 from public.possible_subs s where s.id = possible_sub_id and s.user_id = auth.uid()))
  with check (
    exists (select 1 from public.possible_subs s where s.id = possible_sub_id and s.user_id = auth.uid())
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
  );
revoke all on public.possible_sub_categories from anon;

-- ---------------------------------------------------------------------------
-- Backfill from opportunities.possible_subs (run once; skipped for items
-- already copied). The item's one type becomes its one selected feature;
-- General stays as no features.
-- ---------------------------------------------------------------------------
insert into public.possible_subs (id, user_id, opportunity_id, kind, label, note, sort_order)
select
  case when s.item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then (s.item->>'id')::uuid else gen_random_uuid() end,
  c.user_id,
  o.id,
  coalesce(nullif(s.item->>'kind', ''), 'custom'),
  coalesce(nullif(trim(s.item->>'label'), ''), 'Subcontracted work'),
  nullif(s.item->>'note', ''),
  (s.ord - 1)::int
from public.opportunities o
join public.clients c on c.id = o.client_id
cross join lateral jsonb_array_elements(coalesce(o.possible_subs, '[]'::jsonb)) with ordinality as s(item, ord)
where not exists (select 1 from public.possible_subs p where p.opportunity_id = o.id)
on conflict (id) do nothing;

insert into public.possible_sub_categories (possible_sub_id, category_id, sort_order)
select p.id, cat.id, 0
from public.opportunities o
cross join lateral jsonb_array_elements(coalesce(o.possible_subs, '[]'::jsonb)) as s(item)
join public.possible_subs p
  on p.opportunity_id = o.id
 and p.id::text = s.item->>'id'
join public.categories cat
  on cat.id::text = nullif(s.item->>'category_id', '')
 and cat.user_id = p.user_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- A type removed from the job → dropped from that job's items.
-- ---------------------------------------------------------------------------
create or replace function public.prune_possible_sub_categories_project()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  delete from public.possible_sub_categories psc
   using public.possible_subs s, public.opportunities o
   where psc.possible_sub_id = s.id
     and s.opportunity_id = o.id
     and o.project_id = old.project_id
     and psc.category_id = old.category_id;
  return old;
end;
$$;

drop trigger if exists project_categories_prune_subs on public.project_categories;
create trigger project_categories_prune_subs after delete on public.project_categories
  for each row execute function public.prune_possible_sub_categories_project();

-- Before there's a project the opportunity's own tags are the live list;
-- once linked they're frozen history, so only unlinked opportunities prune.
create or replace function public.prune_possible_sub_categories_opportunity()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  delete from public.possible_sub_categories psc
   using public.possible_subs s, public.opportunities o
   where psc.possible_sub_id = s.id
     and s.opportunity_id = old.opportunity_id
     and o.id = old.opportunity_id
     and o.project_id is null
     and psc.category_id = old.category_id;
  return old;
end;
$$;

drop trigger if exists opportunity_categories_prune_subs on public.opportunity_categories;
create trigger opportunity_categories_prune_subs after delete on public.opportunity_categories
  for each row execute function public.prune_possible_sub_categories_opportunity();

-- Settings › Project types › reassign (0156): move the items' links first.
-- Moving the features drops the old type from project_categories at once
-- (0105 sync), which would otherwise prune the links before they move.
-- Otherwise identical to 0156.
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

  insert into public.possible_sub_categories (possible_sub_id, category_id, sort_order)
    select possible_sub_id, p_to, sort_order from public.possible_sub_categories where category_id = p_from
  on conflict do nothing;
  delete from public.possible_sub_categories where category_id = p_from;

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

-- ---------------------------------------------------------------------------
-- Crew work order: every linked type, from the rows (was: one, from jsonb).
-- ---------------------------------------------------------------------------
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
               'label', left(s.label, 120),
               'note', left(nullif(s.note, ''), 500),
               'type', (select string_agg(c.name, ', ' order by psc.sort_order, c.name)
                          from public.possible_sub_categories psc
                          join public.categories c on c.id = psc.category_id
                          join public.project_categories pc on pc.project_id = p_project_id and pc.category_id = psc.category_id
                         where psc.possible_sub_id = s.id))
             order by s.sort_order, s.created_at)
        from public.opportunities o
        join public.possible_subs s on s.opportunity_id = o.id
       where o.project_id = p_project_id), '[]'::jsonb)
  );
end;
$$;

-- Check: both tables, the new column, and the copied items.
select
  (select count(*) from public.possible_subs) as items,
  (select count(*) from public.possible_sub_categories) as feature_links,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'materials_items' and column_name = 'possible_sub_id') as line_link_column;
