-- ContractorHQ — Project type goes from a single free-text field on
-- opportunities to a real many-to-many against the existing Job Categories
-- taxonomy (0017/0019 — the same list quote line items tag for Revenue by
-- category). A job can be several types at once (Paver patio + Outdoor
-- kitchen + Fire pit + Steps), so this is a join table, not a
-- comma-separated string. Run AFTER 0078.
--
-- Two join tables, mirroring the "opportunity shows what lives on the
-- project" split the pipeline restructure (0073-0078) established:
--
--   - opportunity_categories: editable before a project exists — a lead can
--     be tagged with likely job types before any job-related action has
--     happened (project types aren't one of the lazy-creation triggers;
--     only first photo/sheet/quote are).
--   - project_categories: the durable set once a project exists, whether it
--     came from an opportunity or was created directly (walk-in/repeat
--     client). Bootstrapped ONCE from opportunity_categories the moment a
--     project is created (get_or_create_opportunity_project, re-issued
--     below) — same one-time-copy pattern projects.address already uses
--     (0074). After that point the opportunity page reads/writes THROUGH
--     the project (see src/lib/api.ts's opportunityCategoryIds()), so the
--     two never drift out of sync — there's exactly one live copy once a
--     project exists, same "nothing gets copied or transferred" rule the
--     rest of the restructure follows.
--
-- Neither table drives "Revenue by category" — that's computed purely from
-- quote_items.category_id (0019, collectedByCategory in financials.ts),
-- unchanged by this migration. Project types are descriptive tags; line
-- items are what carry money.

create table public.opportunity_categories (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  category_id    uuid not null references public.categories (id) on delete cascade,
  primary key (opportunity_id, category_id)
);

create index on public.opportunity_categories (opportunity_id);

alter table public.opportunity_categories enable row level security;

-- Same join-through-clients ownership shape as opportunities itself (0049).
create policy "own" on public.opportunity_categories for all to authenticated
  using (exists (
    select 1 from public.opportunities o
    join public.clients c on c.id = o.client_id
    where o.id = opportunity_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.opportunities o
    join public.clients c on c.id = o.client_id
    where o.id = opportunity_id and c.user_id = auth.uid()
  ));

revoke all on public.opportunity_categories from anon;

create table public.project_categories (
  project_id  uuid not null references public.projects (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (project_id, category_id)
);

create index on public.project_categories (project_id);

alter table public.project_categories enable row level security;

-- Same join-through-projects ownership shape as project_images (0025).
create policy "own" on public.project_categories for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

revoke all on public.project_categories from anon;

-- ---------------------------------------------------------------------------
-- Data migration: match each opportunity's free-text project_type to a
-- category by exact name, case-insensitively, scoped to the same owner
-- (an opportunity's project_type could otherwise coincidentally match
-- another contractor's category of the same name). Anything that doesn't
-- match is left untagged, not guessed — see the migration report below.
-- ---------------------------------------------------------------------------

insert into public.opportunity_categories (opportunity_id, category_id)
select o.id, c.id
from public.opportunities o
join public.clients cl on cl.id = o.client_id
join public.categories c
  on c.user_id = cl.user_id
 and lower(c.name) = lower(trim(o.project_type))
where o.project_type is not null and trim(o.project_type) <> ''
on conflict do nothing;

-- Bootstrap already-linked projects the same way get_or_create_opportunity_
-- project will for every NEW project from here on — existing jobs don't
-- lose their tags just because they predate this migration.
insert into public.project_categories (project_id, category_id)
select o.project_id, oc.category_id
from public.opportunity_categories oc
join public.opportunities o on o.id = oc.opportunity_id
where o.project_id is not null
on conflict do nothing;

alter table public.opportunities drop column project_type;

-- ---------------------------------------------------------------------------
-- get_or_create_opportunity_project — re-issued to also bootstrap the new
-- project's project_categories from the opportunity's opportunity_categories
-- at the moment of creation (same one-time copy as address, name, client).
-- Everything else about the function (locking, the unique index, the
-- project_events log line) is unchanged from 0074.
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_opportunity_project(p_opportunity_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_project_id uuid;
  v_client_id  uuid;
  v_title      text;
  v_address    text;
  v_user_id    uuid;
begin
  select o.project_id, o.client_id, o.title, o.address
    into v_project_id, v_client_id, v_title, v_address
    from public.opportunities o
   where o.id = p_opportunity_id
   for update;

  if not found then
    raise exception 'Opportunity % not found', p_opportunity_id;
  end if;

  if v_project_id is not null then
    return v_project_id;
  end if;

  select c.user_id into v_user_id from public.clients c where c.id = v_client_id;

  insert into public.projects (user_id, client_id, name, address, status)
  values (v_user_id, v_client_id, v_title, v_address, 'estimating')
  returning id into v_project_id;

  update public.opportunities set project_id = v_project_id where id = p_opportunity_id;

  insert into public.project_categories (project_id, category_id)
  select v_project_id, oc.category_id
  from public.opportunity_categories oc
  where oc.opportunity_id = p_opportunity_id;

  insert into public.project_events (project_id, user_id, kind, summary)
  values (v_project_id, v_user_id, 'project_created', 'Project created from opportunity');

  return v_project_id;
end;
$$;

grant execute on function public.get_or_create_opportunity_project(uuid) to authenticated;
