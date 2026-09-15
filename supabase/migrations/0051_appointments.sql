-- ContractorHQ — CRM Phase 4: Appointments & Site Visits. Run AFTER 0001-0050.
--
-- Same ownership-through-clients RLS pattern as every other CRM table since
-- 0048 — see 0049's header comment for why (avoids the direct-user_id-column
-- class of bug fixed in 0047).

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  opportunity_id  uuid references public.opportunities (id) on delete set null,
  type            text not null default 'site_visit'
    check (type in (
      'phone_consultation', 'site_visit', 'estimate_appointment',
      'design_meeting', 'proposal_review', 'follow_up'
    )),
  date_time       timestamptz not null,
  duration_minutes int not null default 60,
  address         text,
  status          text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes           text,
  -- Freeform label, same rationale as opportunities.assigned_to — no real
  -- multi-user-per-account system exists yet.
  assigned_to     text,
  reminder_at     timestamptz,
  outcome         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.appointments (client_id);
create index on public.appointments (opportunity_id);
create index on public.appointments (date_time);

create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

create policy "own" on public.appointments for all to authenticated
  using      (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

revoke all on public.appointments from anon;
