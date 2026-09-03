-- ContractorHQ — project status becomes a job-lifecycle field.
-- Run AFTER 0003/0004.
--
-- Old values: draft | active | completed | archived
-- New values: draft | quote_sent | approved | invoiced | paid

do $$
declare
  c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.projects'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if c is not null then
    execute format('alter table public.projects drop constraint %I', c);
  end if;
end $$;

update public.projects
   set status = 'draft'
 where status not in ('draft', 'quote_sent', 'approved', 'invoiced', 'paid');

alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'quote_sent', 'approved', 'invoiced', 'paid'));
