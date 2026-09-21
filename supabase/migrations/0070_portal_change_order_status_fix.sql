-- ContractorHQ — fixes portal_approve_change_order / portal_decline_change_order
-- (0065), whose gate was hardcoded to the old status literal 'pending'.
-- 0069 renamed change_orders' lifecycle to draft/sent/approved/declined,
-- so 'pending' no longer exists — without this fix, a client approving or
-- declining a change order from their Client Hub portal silently no-ops
-- (the UPDATE's WHERE clause never matches anything). Run AFTER 0069.
--
-- Also now stamps signed_at/signed_by (0069) alongside the existing
-- approved_at/approved_by/approved_ip, so a change order approved via
-- EITHER path (portal session or the new public share-token link) ends up
-- with both field-sets populated the same way — the builder never needs
-- to know which path was used to consider a change order locked.

create or replace function public.portal_approve_change_order(p_change_order_id uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.change_orders co
     set status = 'approved',
         approved_at = now(),
         approved_by = nullif(trim(p_signed_by), ''),
         approved_ip = portal_request_ip(),
         signed_at = now(),
         signed_by = nullif(trim(p_signed_by), '')
    from public.projects p, public.clients c
   where co.id = p_change_order_id
     and p.id = co.project_id
     and c.id = p.client_id
     and co.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning co.project_id into v_project_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'change_order_approved',
           'Change order approved by client: ' || co.title || ' · $' || to_char(co.amount, 'FM999,999,990.00')
    from public.projects p join public.change_orders co on co.id = p_change_order_id
    where p.id = v_project_id;
  end if;
end;
$$;

grant execute on function public.portal_approve_change_order(uuid, text) to authenticated;

create or replace function public.portal_decline_change_order(p_change_order_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.change_orders co
     set status = 'declined',
         declined_at = now(),
         decline_comment = nullif(trim(p_comment), '')
    from public.projects p, public.clients c
   where co.id = p_change_order_id
     and p.id = co.project_id
     and c.id = p.client_id
     and co.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning co.project_id into v_project_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'change_order_rejected', 'Change order declined by client: ' || co.title
    from public.projects p where p.id = v_project_id;
  end if;
end;
$$;

grant execute on function public.portal_decline_change_order(uuid, text) to authenticated;
