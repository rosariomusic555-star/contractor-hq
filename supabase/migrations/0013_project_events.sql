-- ContractorHQ — a real activity log for projects.
-- Run AFTER 0001–0012.
--
-- Replaces the placeholder "Activity" feed on the project page (and the
-- "History" list on the invoice page). Events are written by the app when
-- things actually happen — quote sent, invoice paid, expense logged, etc.
-- No backfill: existing quotes/invoices predate the table.

create table if not exists public.project_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,
  summary     text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists project_events_project_created_idx
  on public.project_events (project_id, created_at desc);
create index if not exists project_events_user_idx
  on public.project_events (user_id);

alter table public.project_events enable row level security;

drop policy if exists "own events" on public.project_events;
create policy "own events" on public.project_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.project_events from anon;

-- ---------------------------------------------------------------------------
-- sign_quote also logs a "quote_signed" event now. SECURITY DEFINER runs as
-- the function owner (superuser), so the insert is not blocked by the anon
-- caller failing the RLS check.
-- ---------------------------------------------------------------------------

create or replace function public.sign_quote(p_token uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_user_id    uuid;
  v_signed_by  text;
begin
  if p_token is null then
    return;
  end if;

  update public.quotes
     set signed_at = now(),
         status = 'approved',
         signed_by = nullif(trim(p_signed_by), '')
   where share_token = p_token
     and signed_at is null
  returning project_id, user_id, signed_by
      into v_project_id, v_user_id, v_signed_by;

  if v_project_id is not null then
    update public.projects set status = 'approved' where id = v_project_id;

    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (
      v_project_id,
      v_user_id,
      'quote_signed',
      'Quote approved' || coalesce(' by ' || v_signed_by, ''),
      '{}'::jsonb
    );
  end if;
end $$;

revoke execute on function public.sign_quote(uuid, text) from public;
grant execute on function public.sign_quote(uuid, text) to anon, authenticated;
