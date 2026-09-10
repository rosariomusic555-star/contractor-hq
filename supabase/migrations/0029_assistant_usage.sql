-- ContractorHQ — usage log backing the AI assistant's per-user rate limit.
-- Run AFTER 0001-0028.
--
-- Deliberately minimal: one row per question asked, timestamp only. No
-- message content (question or answer) is ever stored here or anywhere else
-- server-side — conversations live only in the browser tab's memory. This
-- table exists purely so the Edge Function can count "how many questions in
-- the last 24h" per user before calling the Anthropic API.

create table public.assistant_usage_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index on public.assistant_usage_log (user_id, created_at);

alter table public.assistant_usage_log enable row level security;

-- The Edge Function queries/inserts using the calling user's own JWT (never
-- service_role), so this "own" policy is the actual enforcement, same
-- pattern as every other user-owned table.
create policy "own" on public.assistant_usage_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.assistant_usage_log from anon;
