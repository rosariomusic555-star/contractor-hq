-- ContractorHQ — fix set_quote_item_selection to also allow toggling items
-- that are only optional by virtue of their SECTION being optional (the
-- shared quote page lets a client check/uncheck a whole optional section,
-- which flips every item in it regardless of that item's own is_optional
-- flag). The original condition only allowed individually-optional items,
-- so section-level toggles silently no-op'd on non-optional items inside
-- an optional section.
-- Run AFTER 0003/0004/0005/0006/0007.

create or replace function public.set_quote_item_selection(
  p_token uuid, p_item_id uuid, p_selected bool
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null then
    return;
  end if;
  update public.quote_items i
     set client_selected = p_selected
    from public.quote_sections s
    join public.quotes q on q.id = s.quote_id
   where i.id = p_item_id
     and s.id = i.section_id
     and q.share_token = p_token
     and (i.is_optional or s.is_optional);
end $$;
