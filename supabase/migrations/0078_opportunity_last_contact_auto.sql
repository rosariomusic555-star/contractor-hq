-- ContractorHQ — Opportunity/Project restructure, part 6: last_contact_date
-- becomes automatic. Run AFTER 0077.
--
-- Stamped whenever a call/text/email/note activity is logged against an
-- opportunity — no more manual date field to remember to update. Logging
-- an activity for a DIFFERENT reason (stage_changed, quote_created, etc.)
-- never touches it; only a real contact-shaped kind counts as contact.

create or replace function public.sync_opportunity_last_contact()
returns trigger
language plpgsql
as $$
begin
  if new.opportunity_id is not null and new.kind in ('call', 'text', 'email', 'note') then
    update public.opportunities
       set last_contact_date = (new.created_at at time zone 'utc')::date
     where id = new.opportunity_id;
  end if;
  return new;
end;
$$;

create trigger activity_updates_opportunity_last_contact
  after insert on public.activities
  for each row execute function public.sync_opportunity_last_contact();
