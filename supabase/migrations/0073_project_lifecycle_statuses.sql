-- ContractorHQ — Opportunity/Project restructure, part 1: project status
-- becomes a pure job-lifecycle field. Run AFTER 0072.
--
-- The old enum (draft/quote_sent/approved/invoiced/paid, migration 0005)
-- mixed three unrelated concepts: sales stage (now the opportunity's own
-- pipeline stage), billing state (now derived live from invoices via
-- src/lib/financials.ts — see the new "billing badge" concept, never
-- stored), and where the job itself physically is. This migration leaves
-- status with only that last job-lifecycle meaning:
--
--   estimating -> scheduled -> in_progress -> complete
--                                  (or -> lost, from any pre-complete state)
--
-- Old -> new mapping (verified against live data before writing this —
-- zero self-contradictory rows: no project had actual dates set while
-- mapping to estimating, and no invoiced/approved row had a later date set
-- than its own mapped state implies):
--   draft, quote_sent            -> estimating
--   approved                     -> scheduled, or in_progress if actual_start_date is already set
--   invoiced                     -> in_progress, or complete if actual_end_date is already set
--   paid                         -> complete
--
-- Same drop-constraint-before-backfill-before-tighten order as 0072 (and
-- 0069 before it) — backfilling into a value the OLD constraint doesn't
-- allow would fail against a still-live old constraint otherwise.

alter table public.projects drop constraint if exists projects_status_check;

update public.projects
   set status = 'estimating'
 where status in ('draft', 'quote_sent');

update public.projects
   set status = case when actual_start_date is not null then 'in_progress' else 'scheduled' end
 where status = 'approved';

update public.projects
   set status = case when actual_end_date is not null then 'complete' else 'in_progress' end
 where status = 'invoiced';

update public.projects
   set status = 'complete'
 where status = 'paid';

alter table public.projects
  add constraint projects_status_check
  check (status in ('estimating', 'scheduled', 'in_progress', 'complete', 'lost'));

alter table public.projects alter column status set default 'estimating';

-- ---------------------------------------------------------------------------
-- Status <-> actual-date consistency, one direction at a time, no loop risk
-- (a BEFORE trigger mutates NEW before the row is written, so it only ever
-- runs once per statement — there's nothing here to recurse).
--
-- Status -> date: moving to in_progress stamps actual_start_date with
-- today if it's still null; moving to complete stamps actual_end_date
-- (and backfills actual_start_date too, if that's somehow still null — a
-- job can't complete without having started).
--
-- Date -> status: setting actual_start_date while status is scheduled (or
-- still estimating) bumps it to in_progress; setting actual_end_date bumps
-- to complete from anything before it. Deliberately one-directional —
-- clearing a date never moves status backward; a downgrade is always a
-- deliberate, explicit status change, never implied by editing a date.
-- ---------------------------------------------------------------------------

create or replace function public.sync_project_status_and_dates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'in_progress' and new.actual_start_date is null then
      new.actual_start_date := current_date;
    elsif new.status = 'complete' then
      if new.actual_end_date is null then
        new.actual_end_date := current_date;
      end if;
      if new.actual_start_date is null then
        new.actual_start_date := new.actual_end_date;
      end if;
    end if;
  elsif (tg_op = 'INSERT')
     or (new.actual_start_date is distinct from old.actual_start_date)
     or (new.actual_end_date is distinct from old.actual_end_date) then
    if new.actual_end_date is not null and new.status in ('estimating', 'scheduled', 'in_progress') then
      new.status := 'complete';
    elsif new.actual_start_date is not null and new.status in ('estimating', 'scheduled') then
      new.status := 'in_progress';
    end if;
  end if;
  return new;
end;
$$;

create trigger project_status_date_sync
  before insert or update on public.projects
  for each row execute function public.sync_project_status_and_dates();

-- ---------------------------------------------------------------------------
-- Quotes gain 'not_selected' — a sibling option that lost once a different
-- quote on the same project was signed (see the Won transaction, next
-- migration). Distinct from 'declined' (the client explicitly rejected
-- it) — a not-selected quote was simply never up for a decision once its
-- sibling won. Excluded from every total the same way declined already is.
-- ---------------------------------------------------------------------------

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check
  check (status in ('draft', 'sent', 'approved', 'declined', 'not_selected'));
