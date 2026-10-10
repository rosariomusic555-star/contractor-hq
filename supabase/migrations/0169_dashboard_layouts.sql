-- 0169 — dashboard_layouts: each owner's Dashboard layout (Edit layout),
-- saved to their account so it follows them across devices.
--
-- One row per user. `layout` is the client's JSON (src/lib/dashboardLayout.ts):
--   { v: 1,
--     extras: ["revenue", …],                       -- optional cards shown
--     lg:    [{ i, x, y, w, h, auto? }, …] | absent, -- desktop (12 columns)
--     md:    [{ i, x, y, w, h, auto? }, …] | absent, -- tablet  (12 columns)
--     phone: ["needs", "schedule", …]      | absent } -- phone card order
-- A missing breakpoint is derived from the default layout on the client.

create table if not exists public.dashboard_layouts (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  layout     jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_layouts enable row level security;
drop policy if exists "own" on public.dashboard_layouts;
create policy "own" on public.dashboard_layouts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
