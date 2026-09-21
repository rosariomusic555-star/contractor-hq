-- ContractorHQ — Opportunity/Project restructure, part 2: the 1:1 link and
-- lazy, race-safe project creation. Run AFTER 0073.
--
-- Projects gain `address` — copied once from the opportunity at creation
-- time (site address; can differ from the client's own contact address on
-- file), never synced afterward. A walk-in project created directly (no
-- opportunity) simply leaves it null, same as every other project field.

alter table public.projects add column if not exists address text;

-- The actual DB-level 1:1 enforcement — nothing stopped two opportunities
-- pointing at the same project before this. Partial (WHERE project_id is
-- not null) so any number of opportunities can still sit at project_id =
-- null (the common case — most leads never get a project at all).
create unique index if not exists opportunities_project_id_key
  on public.opportunities (project_id)
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- get_or_create_opportunity_project — the ONE path a project is ever
-- created from an opportunity (replaces the old manual "Create project"
-- nudge entirely). Called the first time the user does anything
-- job-related from the opportunity page: first photo, first materials
-- sheet, first quote. Never called just for logging a lead.
--
-- Plain function, not SECURITY DEFINER — the caller already has full RLS
-- access to their own opportunities/projects/clients under the existing
-- "own" policies (same reasoning migration 0033 used), so there's nothing
-- here that needs elevated rights.
--
-- Concurrency: `select ... for update` locks the opportunity row for the
-- rest of the transaction, so two calls that fire at the same instant
-- (e.g. two photos picked and uploaded in the same gesture) serialize —
-- the second caller's SELECT blocks until the first COMMITs, then sees
-- project_id already set and returns the existing project instead of
-- creating a second one. The unique index above is the backstop in case
-- anything ever calls this outside a transaction that honors the lock.
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

  insert into public.project_events (project_id, user_id, kind, summary)
  values (v_project_id, v_user_id, 'project_created', 'Project created from opportunity');

  return v_project_id;
end;
$$;

grant execute on function public.get_or_create_opportunity_project(uuid) to authenticated;
