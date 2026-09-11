-- ContractorHQ — audit trail for AI-assistant WRITE actions (v2: writes).
-- Run AFTER 0001-0029.
--
-- Distinct from assistant_usage_log (0029), which is a bare rate-limit
-- counter with no content. This table exists so the user can later see
-- what the assistant actually changed on their behalf — structured fields
-- resolved from the action itself, never the user's original free-text
-- question. One row per confirmed write ATTEMPT (success or failure), only
-- ever inserted from the execute-action code path (never from the
-- read/tool-use loop, and never by the model itself).

create table public.assistant_action_log (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_type           text not null,
  status                text not null check (status in ('executed', 'failed')),
  project_id            uuid references public.projects (id) on delete set null,
  amount                numeric,
  expense_category_id   uuid references public.expense_categories (id) on delete set null,
  created_expense_id    uuid references public.expenses (id) on delete set null,
  error_message         text,
  created_at            timestamptz not null default now()
);

create index on public.assistant_action_log (user_id, created_at);

alter table public.assistant_action_log enable row level security;

create policy "own" on public.assistant_action_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.assistant_action_log from anon;
