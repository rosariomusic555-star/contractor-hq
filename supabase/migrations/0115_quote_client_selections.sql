-- ContractorHQ — Client Selections on quotes. Run AFTER 0114.
--
-- The contractor defines choice groups on a quote section ("Paver color:
-- Shale Grey / Chestnut Brown", "Paver style: Blu 60 (included) / Blu
-- Grande +$1,250"); the client picks in the Client Hub or on the shared
-- quote link. Sections without groups behave exactly as before.
--
--   quote_selection_groups    per quote section: name, help, required, multi
--   quote_selection_options   name, description, photo, price (+/−/0),
--                             internal cost adjustment, Cost plan link, default
--   quote_selection_picks     the current picks (client / contractor / default)
--   quote_selection_history   Original → CO #1 → … (after approval)
--   selection_group_templates reusable groups, per contractor
--   selection_change_requests "Request a change" from the Client Hub
--   change_order_selection_changes  a selection swap inside a change order
--
-- Totals: a section's total = its included items + each group's chosen
-- option prices (or the default option when nothing is picked yet), only
-- for included sections. Once approved, each group's price is frozen in
-- approved_price — a later swap is priced by its change order, never by
-- re-reading the pick (no double counting).
--
-- On approval (any path — Client Hub, share link, contractor): defaults
-- fill empty groups, a required group with nothing picked blocks approval,
-- history is written, linked Cost plan lines get the chosen product / color
-- / unit cost, and an unlinked internal cost adjustment becomes a Cost plan
-- line — all BEFORE the Won / baseline triggers run (trigger name order).
-- After approval, groups / options / picks are locked for everyone; only an
-- approved change order moves a pick.
--
-- Client-facing: the serializer (0113) gains each section's `selections`
-- — names, descriptions, photos, price adjustments, picks. Never the
-- internal cost, the Cost plan link, or the Catalog product.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.quote_selection_groups (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_section_id  uuid not null references public.quote_sections (id) on delete cascade,
  name              text not null,
  help_text         text,
  required          boolean not null default true,
  multi             boolean not null default false,
  sort_order        int not null default 0,
  -- Frozen at approval: the price this group adds to the approved quote.
  approved_price    numeric,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists quote_selection_groups_section_idx on public.quote_selection_groups (quote_section_id);

create table if not exists public.quote_selection_options (
  id                  uuid primary key default gen_random_uuid(),
  group_id            uuid not null references public.quote_selection_groups (id) on delete cascade,
  name                text not null,
  description         text,
  -- images bucket, selection-options/{user_id}/…
  image_path          text,
  catalog_product_id  uuid references public.product_catalog (id) on delete set null,
  color               text,
  -- + / − / 0 on the client's price
  price_delta         numeric not null default 0,
  -- internal only: what this option does to cost (margin accuracy)
  cost_delta          numeric not null default 0,
  -- internal only: the Cost plan line it changes, and what it sets on it
  -- {catalog_product_id, color, unit_cost, name}
  link_item_id        uuid references public.materials_items (id) on delete set null,
  link_set            jsonb not null default '{}'::jsonb,
  is_default          boolean not null default false,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists quote_selection_options_group_idx on public.quote_selection_options (group_id);

create table if not exists public.quote_selection_picks (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.quote_selection_groups (id) on delete cascade,
  option_id   uuid not null references public.quote_selection_options (id) on delete cascade,
  picked_by   text not null check (picked_by in ('client', 'contractor', 'default', 'change_order')),
  picked_at   timestamptz not null default now(),
  unique (group_id, option_id)
);
create index if not exists quote_selection_picks_group_idx on public.quote_selection_picks (group_id);

create table if not exists public.quote_selection_history (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.quote_selection_groups (id) on delete cascade,
  source           text not null check (source in ('original', 'change_order')),
  change_order_id  uuid references public.change_orders (id) on delete set null,
  option_ids       uuid[] not null default '{}',
  option_names     text[] not null default '{}',
  price            numeric not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists quote_selection_history_group_idx on public.quote_selection_history (group_id, created_at);

create table if not exists public.selection_group_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  help_text   text,
  required    boolean not null default true,
  multi       boolean not null default false,
  -- [{name, description, image_path, catalog_product_id, color, price_delta, cost_delta, is_default}]
  options     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.selection_change_requests (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  project_id           uuid references public.projects (id) on delete cascade,
  quote_id             uuid references public.quotes (id) on delete cascade,
  group_id             uuid not null references public.quote_selection_groups (id) on delete cascade,
  requested_option_id  uuid references public.quote_selection_options (id) on delete set null,
  note                 text,
  status               text not null default 'open' check (status in ('open', 'converted', 'completed', 'declined', 'closed')),
  change_order_id      uuid references public.change_orders (id) on delete set null,
  requested_by         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists selection_change_requests_project_idx on public.selection_change_requests (project_id, status);

create table if not exists public.change_order_selection_changes (
  id               uuid primary key default gen_random_uuid(),
  change_order_id  uuid not null references public.change_orders (id) on delete cascade,
  group_id         uuid not null references public.quote_selection_groups (id) on delete cascade,
  from_option_ids  uuid[] not null default '{}',
  to_option_ids    uuid[] not null default '{}',
  price_delta      numeric not null default 0,
  cost_delta       numeric not null default 0,
  applied_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists change_order_selection_changes_co_idx on public.change_order_selection_changes (change_order_id);

-- ---------------------------------------------------------------------------
-- RLS — the contractor's own (via the quote / change order); employees
-- never; clients only through the functions below.
-- ---------------------------------------------------------------------------

alter table public.quote_selection_groups enable row level security;
alter table public.quote_selection_options enable row level security;
alter table public.quote_selection_picks enable row level security;
alter table public.quote_selection_history enable row level security;
alter table public.selection_group_templates enable row level security;
alter table public.selection_change_requests enable row level security;
alter table public.change_order_selection_changes enable row level security;

drop policy if exists "own" on public.quote_selection_groups;
create policy "own" on public.quote_selection_groups for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own" on public.quote_selection_options;
create policy "own" on public.quote_selection_options for all to authenticated
  using (exists (select 1 from public.quote_selection_groups g where g.id = group_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.quote_selection_groups g where g.id = group_id and g.user_id = auth.uid()));
drop policy if exists "own" on public.quote_selection_picks;
create policy "own" on public.quote_selection_picks for all to authenticated
  using (exists (select 1 from public.quote_selection_groups g where g.id = group_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.quote_selection_groups g where g.id = group_id and g.user_id = auth.uid()));
drop policy if exists "own" on public.quote_selection_history;
create policy "own" on public.quote_selection_history for select to authenticated
  using (exists (select 1 from public.quote_selection_groups g where g.id = group_id and g.user_id = auth.uid()));
drop policy if exists "own" on public.selection_group_templates;
create policy "own" on public.selection_group_templates for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own" on public.selection_change_requests;
create policy "own" on public.selection_change_requests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own" on public.change_order_selection_changes;
create policy "own" on public.change_order_selection_changes for all to authenticated
  using (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()))
  with check (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['quote_selection_groups', 'quote_selection_options', 'quote_selection_picks', 'quote_selection_history',
                           'selection_group_templates', 'selection_change_requests', 'change_order_selection_changes'] loop
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- History is written only by the functions below.
revoke insert, update, delete on public.quote_selection_history from authenticated;

drop trigger if exists quote_selection_groups_set_updated_at on public.quote_selection_groups;
create trigger quote_selection_groups_set_updated_at before update on public.quote_selection_groups
  for each row execute function public.set_updated_at();
drop trigger if exists selection_group_templates_set_updated_at on public.selection_group_templates;
create trigger selection_group_templates_set_updated_at before update on public.selection_group_templates
  for each row execute function public.set_updated_at();
drop trigger if exists selection_change_requests_set_updated_at on public.selection_change_requests;
create trigger selection_change_requests_set_updated_at before update on public.selection_change_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: selection-options/{user_id}/… — the owner writes; anyone who can
-- see the quote (share link, or the client's own Client Hub) can read a
-- photo that's on one of its options.
-- ---------------------------------------------------------------------------

drop policy if exists "own selection images" on storage.objects;
create policy "own selection images" on storage.objects for all to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = 'selection-options' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = 'selection-options' and (storage.foldername(name))[2] = auth.uid()::text);

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
             or (q.status in ('sent', 'approved', 'declined') and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
    )
  );

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------

-- Whether a section counts: a required section always; an optional one
-- once the client selected something in it.
create or replace function public.quote_section_included(p_section_id uuid)
returns boolean language sql stable as $$
  select not s.is_optional
         or exists (select 1 from public.quote_items i where i.section_id = s.id and i.client_selected)
  from public.quote_sections s where s.id = p_section_id;
$$;

-- One group's price: frozen once approved; else the picked options, or
-- the default(s) while nothing is picked.
create or replace function public.selection_group_price(p_group_id uuid)
returns numeric language sql stable as $$
  select case
    when g.approved_price is not null then g.approved_price
    when exists (select 1 from public.quote_selection_picks p where p.group_id = g.id) then
      (select coalesce(sum(o.price_delta), 0) from public.quote_selection_picks p
         join public.quote_selection_options o on o.id = p.option_id where p.group_id = g.id)
    else (select coalesce(sum(o.price_delta), 0) from public.quote_selection_options o where o.group_id = g.id and o.is_default)
  end
  from public.quote_selection_groups g where g.id = p_group_id;
$$;

create or replace function public.quote_committed_total(p_quote_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce((
    select sum(
      case when (not s.is_optional and not i.is_optional) or i.client_selected
        then i.price * i.quantity
        else 0
      end)
    from public.quote_sections s
    join public.quote_items i on i.section_id = s.id
    where s.quote_id = p_quote_id
  ), 0)
  + coalesce((
    select sum(public.selection_group_price(g.id))
    from public.quote_sections s
    join public.quote_selection_groups g on g.quote_section_id = s.id
    where s.quote_id = p_quote_id and public.quote_section_included(s.id)
  ), 0);
$$;

-- ---------------------------------------------------------------------------
-- Lock: once the quote is approved, nobody edits its groups / options /
-- picks — except the approval / change-order functions below, which set
-- app.selection_unlock for their own transaction.
-- ---------------------------------------------------------------------------

create or replace function public.quote_selection_lock()
returns trigger language plpgsql as $$
declare v_group uuid; v_status text;
begin
  if coalesce(current_setting('app.selection_unlock', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'quote_selection_groups' then
    select q.status into v_status from public.quote_sections s join public.quotes q on q.id = s.quote_id
     where s.id = coalesce(new.quote_section_id, old.quote_section_id);
  else
    v_group := coalesce(new.group_id, old.group_id);
    select q.status into v_status
      from public.quote_selection_groups g
      join public.quote_sections s on s.id = g.quote_section_id
      join public.quotes q on q.id = s.quote_id
     where g.id = v_group;
  end if;
  if v_status = 'approved' then
    raise exception 'These selections were approved — they''re locked. Use a change order to change them.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_selection_groups_lock on public.quote_selection_groups;
create trigger quote_selection_groups_lock before insert or update or delete on public.quote_selection_groups
  for each row execute function public.quote_selection_lock();
drop trigger if exists quote_selection_options_lock on public.quote_selection_options;
create trigger quote_selection_options_lock before insert or update or delete on public.quote_selection_options
  for each row execute function public.quote_selection_lock();
drop trigger if exists quote_selection_picks_lock on public.quote_selection_picks;
create trigger quote_selection_picks_lock before insert or update or delete on public.quote_selection_picks
  for each row execute function public.quote_selection_lock();

-- ---------------------------------------------------------------------------
-- Approval — defaults + required check (BEFORE), then freeze + history +
-- Cost plan (AFTER, named to run before every other quote trigger, i.e.
-- before the Won / baseline snapshot).
-- ---------------------------------------------------------------------------

create or replace function public.quote_selections_before_approve()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record; v_missing text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    for g in
      select sg.* from public.quote_selection_groups sg
      join public.quote_sections s on s.id = sg.quote_section_id
      where s.quote_id = new.id and public.quote_section_included(s.id)
    loop
      if not exists (select 1 from public.quote_selection_picks p where p.group_id = g.id) then
        insert into public.quote_selection_picks (group_id, option_id, picked_by)
        select g.id, o.id, 'default' from public.quote_selection_options o where o.group_id = g.id and o.is_default
        on conflict do nothing;
        if g.required and not exists (select 1 from public.quote_selection_picks p where p.group_id = g.id) then
          v_missing := coalesce(v_missing || ', ', '') || '"' || g.name || '"';
        end if;
      end if;
    end loop;
    if v_missing is not null then
      raise exception 'Please make a choice for %', v_missing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_selections_before_approve on public.quotes;
create trigger quote_selections_before_approve before update of status on public.quotes
  for each row execute function public.quote_selections_before_approve();

create or replace function public.quote_selections_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record; o record; v_section uuid; v_ids uuid[]; v_names text[]; v_price numeric; v_included boolean;
begin
  perform set_config('app.selection_unlock', 'on', true);

  if new.status = 'approved' and old.status is distinct from 'approved' then
    for g in
      select sg.*, s.feature_id, s.id as section_id, s.quote_id
      from public.quote_selection_groups sg
      join public.quote_sections s on s.id = sg.quote_section_id
      where s.quote_id = new.id
    loop
      v_included := public.quote_section_included(g.section_id);
      select coalesce(array_agg(o.id order by o.sort_order), '{}'), coalesce(array_agg(o.name order by o.sort_order), '{}'), coalesce(sum(o.price_delta), 0)
        into v_ids, v_names, v_price
        from public.quote_selection_picks p join public.quote_selection_options o on o.id = p.option_id
       where p.group_id = g.id;
      update public.quote_selection_groups
         set approved_price = case when v_included then v_price else 0 end, approved_at = now()
       where id = g.id;
      if not v_included then continue; end if;
      insert into public.quote_selection_history (group_id, source, option_ids, option_names, price)
      values (g.id, 'original', v_ids, v_names, v_price);

      -- Cost plan: linked lines take the chosen product / color / unit
      -- cost; an unlinked internal cost adjustment becomes a line.
      for o in select opt.* from public.quote_selection_picks p join public.quote_selection_options opt on opt.id = p.option_id where p.group_id = g.id loop
        if o.link_item_id is not null then
          update public.materials_items mi
             set catalog_product_id = coalesce(nullif(o.link_set ->> 'catalog_product_id', '')::uuid, mi.catalog_product_id),
                 color = coalesce(nullif(o.link_set ->> 'color', ''), mi.color),
                 unit_cost = coalesce((o.link_set ->> 'unit_cost')::numeric, mi.unit_cost),
                 name = coalesce(nullif(o.link_set ->> 'name', ''), mi.name)
           where mi.id = o.link_item_id;
        elsif o.cost_delta <> 0 and g.feature_id is not null then
          select ms.id into v_section from public.materials_sections ms
           where ms.feature_id = g.feature_id and not coalesce(ms.is_general, false)
           order by ms.sort_order limit 1;
          if v_section is not null then
            insert into public.materials_items (section_id, name, quantity, unit, unit_cost, sort_order, cost_type, tracked)
            values (v_section, 'Selection: ' || g.name || ' — ' || o.name, 1, 'lump sum', o.cost_delta, 9000, 'other', false);
          end if;
        end if;
      end loop;
    end loop;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    -- Reverted (edited after approval): selections are live again.
    update public.quote_selection_groups sg set approved_price = null, approved_at = null
      from public.quote_sections s where s.id = sg.quote_section_id and s.quote_id = new.id;
  end if;

  perform set_config('app.selection_unlock', '', true);
  return null;
end;
$$;

drop trigger if exists quote_0_selections_apply on public.quotes;
create trigger quote_0_selections_apply after update of status on public.quotes
  for each row execute function public.quote_selections_on_status();

-- ---------------------------------------------------------------------------
-- Client picks — Client Hub (by email) and the share link (by token).
-- Only while the quote is out for approval.
-- ---------------------------------------------------------------------------

create or replace function public._set_selection_picks(p_group_id uuid, p_option_ids uuid[], p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare v_multi boolean; v_ids uuid[] := coalesce(p_option_ids, '{}');
begin
  select multi into v_multi from public.quote_selection_groups where id = p_group_id;
  if not v_multi and array_length(v_ids, 1) > 1 then
    raise exception 'Pick one option';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.quote_selection_options o where o.id = x and o.group_id = p_group_id)) then
    raise exception 'That option isn''t available any more';
  end if;
  delete from public.quote_selection_picks where group_id = p_group_id;
  insert into public.quote_selection_picks (group_id, option_id, picked_by)
  select p_group_id, x, p_by from unnest(v_ids) x;
end;
$$;
revoke all on function public._set_selection_picks(uuid, uuid[], text) from public, anon, authenticated;

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
      and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'This quote can''t be changed';
  end if;
  perform public._set_selection_picks(p_group_id, p_option_ids, 'client');
end;
$$;
grant execute on function public.portal_set_quote_selection(uuid, uuid[]) to authenticated;

create or replace function public.set_shared_quote_selection(p_token uuid, p_group_id uuid, p_option_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or not exists (
    select 1 from public.quote_selection_groups g
    join public.quote_sections s on s.id = g.quote_section_id
    join public.quotes q on q.id = s.quote_id
    where g.id = p_group_id and q.share_token = p_token and q.status = 'sent'
  ) then
    raise exception 'This quote can''t be changed';
  end if;
  perform public._set_selection_picks(p_group_id, p_option_ids, 'client');
end;
$$;
grant execute on function public.set_shared_quote_selection(uuid, uuid, uuid[]) to anon, authenticated;

-- "Request a change" (Client Hub) — records the request for the
-- contractor; changes nothing.
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
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
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
grant execute on function public.portal_request_selection_change(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Change orders: an approved selection change moves the pick and adds to
-- the history; the request it came from is completed. Its price / Cost
-- plan effect is the change order's own items / planned-cost changes.
-- ---------------------------------------------------------------------------

create or replace function public.change_order_selection_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform set_config('app.selection_unlock', 'on', true);
    for c in select * from public.change_order_selection_changes where change_order_id = new.id and applied_at is null loop
      delete from public.quote_selection_picks where group_id = c.group_id;
      insert into public.quote_selection_picks (group_id, option_id, picked_by)
      select c.group_id, x, 'change_order' from unnest(c.to_option_ids) x
      where exists (select 1 from public.quote_selection_options o where o.id = x);
      insert into public.quote_selection_history (group_id, source, change_order_id, option_ids, option_names, price)
      select c.group_id, 'change_order', new.id, c.to_option_ids,
             coalesce((select array_agg(o.name order by o.sort_order) from public.quote_selection_options o where o.id = any (c.to_option_ids)), '{}'),
             coalesce((select sum(o.price_delta) from public.quote_selection_options o where o.id = any (c.to_option_ids)), 0);
      update public.change_order_selection_changes set applied_at = now() where id = c.id;
    end loop;
    perform set_config('app.selection_unlock', '', true);
    update public.selection_change_requests set status = 'completed' where change_order_id = new.id;
  elsif new.status = 'declined' and old.status is distinct from 'declined' then
    update public.selection_change_requests set status = 'declined' where change_order_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists change_orders_selection_status on public.change_orders;
create trigger change_orders_selection_status after update of status on public.change_orders
  for each row execute function public.change_order_selection_status();

-- ---------------------------------------------------------------------------
-- Crew view — approved choices only, no prices (Employee-Only Mode).
-- ---------------------------------------------------------------------------

create or replace function public.employee_project_selections(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'section', s.name, 'group', g.name,
           'choices', coalesce((select jsonb_agg(o.name order by o.sort_order)
                                  from public.quote_selection_picks p join public.quote_selection_options o on o.id = p.option_id
                                 where p.group_id = g.id), '[]'::jsonb)
         ) order by s.sort_order, g.sort_order), '[]'::jsonb)
  from public.quote_selection_groups g
  join public.quote_sections s on s.id = g.quote_section_id
  join public.quotes q on q.id = s.quote_id
  where q.project_id = p_project_id and q.status = 'approved'
    and public.quote_section_included(s.id)
    and (
      exists (select 1 from public.projects pr where pr.id = p_project_id and pr.user_id = auth.uid())
      or exists (select 1 from public.employee_project_assignments a join public.employees e on e.id = a.employee_id
                 where a.project_id = p_project_id and e.auth_user_id = auth.uid() and e.status = 'active')
    );
$$;
grant execute on function public.employee_project_selections(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Client-facing serializer (0113): each section's selections — names,
-- descriptions, photos, price adjustments, picks, and the approved history
-- (option names only). Internal cost, Cost plan links and the Catalog
-- product never leave. Group / option edits are content (a new quote
-- version); picks aren't.
-- ---------------------------------------------------------------------------

create or replace function public.client_selections_json(p_section_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'help_text', g.help_text,
    'required', g.required,
    'multi', g.multi,
    'approved_at', g.approved_at,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'description', o.description, 'image_path', o.image_path,
        'price_delta', o.price_delta, 'is_default', o.is_default
      ) order by o.sort_order, o.created_at)
      from public.quote_selection_options o where o.group_id = g.id
    ), '[]'::jsonb),
    'picked', coalesce((select jsonb_agg(p.option_id) from public.quote_selection_picks p where p.group_id = g.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', h.source, 'option_names', to_jsonb(h.option_names), 'created_at', h.created_at,
        'change_order_number', case when h.change_order_id is not null then public.change_order_number(h.change_order_id) end
      ) order by h.created_at)
      from public.quote_selection_history h where h.group_id = g.id
    ), '[]'::jsonb)
  ) order by g.sort_order, g.created_at), '[]'::jsonb)
  from public.quote_selection_groups g where g.quote_section_id = p_section_id;
$$;
revoke all on function public.client_selections_json(uuid) from public, anon, authenticated;

create or replace function public.client_quote_json(p_quote_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id,
    'kind', coalesce(q.kind, 'original'),
    'addon_number', case when q.kind = 'addon' then public.addon_quote_number(q.id) end,
    'status', q.status,
    'deposit_percentage', q.deposit_percentage,
    'notes', q.notes,
    'terms', q.terms,
    'signed_at', q.signed_at,
    'signed_by', q.signed_by,
    'declined_at', q.declined_at,
    'decline_comment', q.decline_comment,
    'created_at', q.created_at,
    'updated_at', q.updated_at,
    'total', public.quote_committed_total(q.id),
    'approval', case
      when q.status = 'approved' then jsonb_build_object('name', q.signed_by, 'at', q.signed_at, 'ip', q.signed_ip)
      when q.status = 'declined' then jsonb_build_object('at', q.declined_at, 'comment', q.decline_comment)
    end,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'is_optional', s.is_optional, 'sort_order', s.sort_order,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'description', i.description,
            'price', i.price, 'quantity', i.quantity, 'unit', i.unit,
            'is_optional', i.is_optional, 'client_selected', i.client_selected, 'sort_order', i.sort_order,
            'images', coalesce((
              select jsonb_agg(jsonb_build_object('id', img.id, 'storage_path', img.storage_path) order by img.sort_order)
              from public.quote_item_images img where img.quote_item_id = i.id
            ), '[]'::jsonb)
          ) order by i.sort_order, i.name)
          from public.quote_items i where i.section_id = s.id
        ), '[]'::jsonb),
        'selections', public.client_selections_json(s.id)
      ) order by s.sort_order, s.name)
      from public.quote_sections s where s.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.quotes q where q.id = p_quote_id;
$$;
revoke all on function public.client_quote_json(uuid) from public, anon, authenticated;

create or replace function public.client_document_core(p_type text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_type
    when 'quote' then (
      select jsonb_build_object(
        'notes', q.notes, 'terms', q.terms, 'deposit', q.deposit_percentage,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', s.name, 'optional', s.is_optional,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', i.name, 'description', i.description, 'price', i.price,
                'quantity', i.quantity, 'unit', i.unit, 'optional', i.is_optional
              ) order by i.sort_order, i.name)
              from public.quote_items i where i.section_id = s.id
            ), '[]'::jsonb),
            'selections', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', g.name, 'help', g.help_text, 'required', g.required, 'multi', g.multi,
                'options', coalesce((
                  select jsonb_agg(jsonb_build_object('name', o.name, 'description', o.description, 'image', o.image_path,
                                                      'price', o.price_delta, 'default', o.is_default) order by o.sort_order, o.created_at)
                  from public.quote_selection_options o where o.group_id = g.id
                ), '[]'::jsonb)
              ) order by g.sort_order, g.created_at)
              from public.quote_selection_groups g where g.quote_section_id = s.id
            ), '[]'::jsonb)
          ) order by s.sort_order, s.name)
          from public.quote_sections s where s.quote_id = q.id
        ), '[]'::jsonb))
      from public.quotes q where q.id = p_id)
    when 'change_order' then (
      select jsonb_build_object(
        'title', co.title, 'description', co.description, 'reason', co.reason,
        'amount', co.amount, 'days', co.schedule_impact_days,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', s.name, 'scope', s.scope_note,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', i.name, 'description', i.description, 'price', i.price,
                'quantity', i.quantity, 'unit', i.unit
              ) order by i.sort_order, i.name)
              from public.change_order_items i where i.section_id = s.id
            ), '[]'::jsonb)
          ) order by s.sort_order, s.name)
          from public.change_order_sections s where s.change_order_id = co.id
        ), '[]'::jsonb))
      from public.change_orders co where co.id = p_id)
    when 'invoice' then (
      select jsonb_build_object(
        'amount', inv.amount, 'due', inv.due_date, 'notes', inv.notes,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('d', it.description, 'q', it.quantity, 'p', it.unit_price) order by it.sort_order)
          from public.invoice_items it where it.invoice_id = inv.id
        ), '[]'::jsonb))
      from public.invoices inv where inv.id = p_id)
  end;
$$;
revoke all on function public.client_document_core(text, uuid) from public, anon, authenticated;

select 'client selections ready' as result;
