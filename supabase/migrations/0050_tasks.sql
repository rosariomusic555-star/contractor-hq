-- ContractorHQ — CRM Phase 3: Tasks & Follow-ups. Run AFTER 0001-0049.
--
-- Unlike Phase 1/2's tables, a task can exist with NO client/opportunity/
-- project at all (a pure "general task" — the ask's own "global task
-- view" requires this), so ownership can't be a join-through-clients
-- like every other CRM table so far — it has to be a direct
-- `user_id = auth.uid()` column instead. That's exactly the shape that
-- let an employee self-satisfy RLS in the original Employee-Only Mode
-- bug (0045-0047), so this migration also adds the same RESTRICTIVE
-- "employees excluded" policy 0047 used elsewhere, reusing that
-- migration's `is_employee()` function rather than redefining it.

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title          text not null,
  description    text,
  due_at         timestamptz,
  client_id      uuid references public.clients (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete cascade,
  assigned_to    text,
  priority       text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  task_type      text not null default 'general_task'
    check (task_type in (
      'call', 'text', 'email', 'site_visit', 'prepare_estimate', 'send_proposal',
      'follow_up', 'collect_deposit', 'schedule_project', 'general_task'
    )),
  completed      boolean not null default false,
  completed_at   timestamptz,
  reminder_at    timestamptz,
  recurrence     text check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on public.tasks (user_id);
create index on public.tasks (client_id);
create index on public.tasks (opportunity_id);
create index on public.tasks (project_id);
create index on public.tasks (due_at);

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "own" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- See this migration's header comment — tasks.user_id is a direct
-- ownership column (unlike Phase 1/2's tables), so it needs the same
-- explicit employee-exclusion 0047 added for quotes/clients/etc.
create policy "employees excluded" on public.tasks as restrictive for all to authenticated
  using (not public.is_employee())
  with check (not public.is_employee());

revoke all on public.tasks from anon;
