-- ContractorHQ — lock a quote's sections/items/item-photos once it's
-- approved. Run AFTER 0001-0032.
--
-- This is a DB-level backstop, not just a UI convention (unlike most other
-- "required"/"locked" rules in this app, which are enforced only in the
-- form) — deliberate, since this feature is specifically about trust: a
-- client's signature must never be silently invalidated by an edit they
-- can't see. The app's own save flow (QuoteWorkspace.tsx) knows to revert
-- the quote to 'draft' (clearing signed_at/signed_by) BEFORE writing any
-- section/item/image changes when editing an approved quote, so these
-- triggers never fire during normal use — they only catch any write path
-- that skips that step.
--
-- Plain (non SECURITY DEFINER) functions: the owner can already read their
-- own quotes row under the existing "own" RLS policy, so no elevated
-- rights are needed just to check its status.

create or replace function public.reject_edit_on_approved_quote_sections()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_status text;
begin
  select status into v_status from public.quotes where id = v_quote_id;
  if v_status = 'approved' then
    raise exception 'Cannot edit an approved quote''s sections — save from the quote builder, which reverts it to draft first.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_sections_lock_when_approved
  before insert or update or delete on public.quote_sections
  for each row execute function public.reject_edit_on_approved_quote_sections();

create or replace function public.reject_edit_on_approved_quote_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_section_id uuid := coalesce(new.section_id, old.section_id);
  v_status text;
begin
  select q.status into v_status
    from public.quotes q
    join public.quote_sections qs on qs.quote_id = q.id
   where qs.id = v_section_id;
  if v_status = 'approved' then
    raise exception 'Cannot edit an approved quote''s items — save from the quote builder, which reverts it to draft first.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_items_lock_when_approved
  before insert or update or delete on public.quote_items
  for each row execute function public.reject_edit_on_approved_quote_items();

create or replace function public.reject_edit_on_approved_quote_item_images()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_item_id uuid := coalesce(new.quote_item_id, old.quote_item_id);
  v_status text;
begin
  select q.status into v_status
    from public.quotes q
    join public.quote_sections qs on qs.quote_id = q.id
    join public.quote_items qi on qi.section_id = qs.id
   where qi.id = v_quote_item_id;
  if v_status = 'approved' then
    raise exception 'Cannot edit an approved quote''s photos — save from the quote builder, which reverts it to draft first.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_item_images_lock_when_approved
  before insert or update or delete on public.quote_item_images
  for each row execute function public.reject_edit_on_approved_quote_item_images();
