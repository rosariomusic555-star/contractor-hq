-- ContractorHQ — quote status simplified to draft | sent | approved
-- (was draft | sent | accepted | declined). Run AFTER 0003/0004/0005.

do $$
declare
  c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.quotes'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if c is not null then
    execute format('alter table public.quotes drop constraint %I', c);
  end if;
end $$;

update public.quotes set status = 'approved' where status = 'accepted';
update public.quotes set status = 'draft' where status not in ('draft', 'sent', 'approved');

alter table public.quotes
  add constraint quotes_status_check
  check (status in ('draft', 'sent', 'approved'));

-- The client-facing "accept" action now lands on 'approved', matching the
-- new status set (was 'accepted').
create or replace function public.sign_quote(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null then
    return;
  end if;
  update public.quotes
     set signed_at = now(),
         status = 'approved'
   where share_token = p_token
     and signed_at is null;
end $$;
