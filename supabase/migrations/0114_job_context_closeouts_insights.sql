-- ContractorHQ — Feature 5: planned vs actual feedback loop. Run AFTER 0113.
--
-- 1. Structured job context on the project (slope / access / soil / demo),
--    next to the free-text site conditions. All optional.
-- 2. materials_sections.smart_inputs — what the Smart Section calculator was
--    given (base depth, area, product…), saved from now on. Past sections
--    are NOT backfilled: the calculator never stored its inputs, and a base
--    depth guessed back from tonnage isn't reliable once a quantity was
--    edited. Closeouts just leave base depth blank for those.
-- 3. project_closeouts — an immutable planned-vs-actual snapshot taken when
--    a project is marked Complete (computed in the app, where the math
--    lives). Only the contractor's note, "exclude from comparisons" and
--    "superseded" can change afterwards. Re-completing adds a new closeout
--    and marks the old one superseded.
-- 4. Estimating insights — recommendation state (open / applied /
--    dismissed / snoozed), conditional adjustments ("sloped patios: base
--    ×1.2"), and a history of every applied change with before/after so it
--    can be undone. Nothing here changes a default by itself: every change
--    is an explicit Apply from the app.
-- 5. Variance color thresholds (Settings).
--
-- Internal only: none of this is ever read by the client-facing serializer
-- (client_*_json, 0113).

-- ---------------------------------------------------------------------------
-- 1. Job context
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists job_slope text check (job_slope in ('flat', 'slight', 'moderate', 'steep')),
  add column if not exists job_access text check (job_access in ('easy', 'tight', 'difficult')),
  add column if not exists job_soil text check (job_soil in ('normal', 'clay', 'rocky', 'wet')),
  add column if not exists job_demo text check (job_demo in ('none', 'light', 'heavy'));

-- ---------------------------------------------------------------------------
-- 2. Calculator inputs
-- ---------------------------------------------------------------------------

alter table public.materials_sections add column if not exists smart_inputs jsonb;

-- ---------------------------------------------------------------------------
-- 3. Closeouts
-- ---------------------------------------------------------------------------

create table if not exists public.project_closeouts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id      uuid not null references public.projects (id) on delete cascade,
  -- The whole planned-vs-actual result, frozen (see src/lib/closeout.ts).
  snapshot        jsonb not null,
  -- Slope / access / soil / demo / crew size at closeout.
  context         jsonb not null default '{}'::jsonb,
  -- Per-feature comparable units: build type, size, base depth, material
  -- system and unit actuals — what "similar jobs" match on.
  features        jsonb not null default '[]'::jsonb,
  what_happened   text,
  excluded        boolean not null default false,
  superseded_at   timestamptz,
  completed_on    date not null default current_date,
  created_at      timestamptz not null default now()
);

create index if not exists project_closeouts_user_idx on public.project_closeouts (user_id, superseded_at);
create index if not exists project_closeouts_project_idx on public.project_closeouts (project_id, created_at);

-- Frozen results: only the note, the exclude flag and superseded_at move.
create or replace function public.project_closeouts_guard()
returns trigger language plpgsql as $$
begin
  if new.snapshot is distinct from old.snapshot or new.context is distinct from old.context
     or new.features is distinct from old.features or new.project_id is distinct from old.project_id
     or new.completed_on is distinct from old.completed_on or new.created_at is distinct from old.created_at then
    raise exception 'A closeout is a snapshot — only its note and "exclude from comparisons" can change.';
  end if;
  return new;
end;
$$;

drop trigger if exists project_closeouts_guard on public.project_closeouts;
create trigger project_closeouts_guard before update on public.project_closeouts
  for each row execute function public.project_closeouts_guard();

-- ---------------------------------------------------------------------------
-- 4. Estimating insights
-- ---------------------------------------------------------------------------

-- State per recommendation (the recommendation itself is recomputed from
-- closeouts by the app's rules each time; `key` identifies the pattern).
create table if not exists public.estimating_recommendations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key           text not null,
  status        text not null default 'open' check (status in ('open', 'applied', 'applied_condition', 'dismissed', 'snoozed')),
  snooze_until  timestamptz,
  -- The evidence / suggestion as they were when the status last changed.
  evidence      jsonb,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (user_id, key)
);

-- "Apply to this condition only": a factor on one calculator line (e.g. the
-- patio base) or on planned labor, used only when a job matches `condition`
-- ({} = every job of that type).
create table if not exists public.estimating_adjustments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  build_type      text not null,
  -- 'slot:<slotKey>' (a calculator line) or 'labor_hours'
  target          text not null,
  condition       jsonb not null default '{}'::jsonb,
  factor          numeric not null check (factor > 0),
  label           text not null,
  active          boolean not null default true,
  recommendation_key text,
  created_at      timestamptz not null default now()
);

-- Every applied change, before and after, for undo.
create table if not exists public.estimating_changes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recommendation_key  text,
  -- 'tunable' (smart_section_settings.tunables), 'labor_default'
  -- (smart_section_settings.labor_default) or 'adjustment'
  kind                text not null check (kind in ('tunable', 'labor_default', 'adjustment')),
  build_type          text not null,
  field               text,
  adjustment_id       uuid references public.estimating_adjustments (id) on delete set null,
  before_value        jsonb,
  after_value         jsonb,
  summary             text not null,
  applied_at          timestamptz not null default now(),
  undone_at           timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['project_closeouts', 'estimating_recommendations', 'estimating_adjustments', 'estimating_changes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own" on public.%I', t);
    execute format('create policy "own" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Variance colors: green at / under plan, amber up to red_pct over,
--    red beyond it. amber_pct = a small tolerance still shown green.
-- ---------------------------------------------------------------------------

alter table public.business_profile
  add column if not exists variance_amber_pct numeric not null default 0,
  add column if not exists variance_red_pct numeric not null default 10;

select 'job context, closeouts and estimating insights ready' as result;
