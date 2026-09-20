-- ContractorHQ — fixes portal_set_quote_item_selection (0065): it only
-- matched quote_items where the ITEM's own is_optional flag was set, but
-- this app's actual "is this an addon" rule (see itemIsAddon() in
-- QuoteWorkspace.tsx) is "the section is optional OR the item is" — a
-- whole optional section's items aren't necessarily flagged individually.
-- The narrower check meant the update's WHERE clause silently matched zero
-- rows for exactly that (common) case: 204 success, nothing actually
-- changed. Caught by live-testing the portal quote approval dialog.

create or replace function public.portal_set_quote_item_selection(p_quote_item_id uuid, p_selected boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quote_items i
     set client_selected = p_selected
    from public.quote_sections s, public.quotes q, public.projects p, public.clients c
   where i.id = p_quote_item_id
     and s.id = i.section_id
     and q.id = s.quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and (s.is_optional or i.is_optional)
     and q.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$$;
