-- ContractorHQ — Share pages carry the contractor's business; a client's
-- change order decision rings the bell. Run AFTER 0149.
--
-- 1. The public quote / invoice / change order pages showed "ContractorPro"
--    (the app's name) instead of the contractor's company — the receipt page
--    already had the business (0111). The three share RPCs now return
--    `business` from the same client-safe serializer (client_business_json,
--    0113): company name, phone, email, address, license, logo. All three
--    are their 0113 definitions plus that one field.
-- 2. A client approving or declining a change order (share link or Client
--    Hub) made no notification — quotes did (0117). Now it does, same rule:
--    only when the client decides, not when the contractor marks it approved
--    in the app (approval_method set, 0139). New toggle
--    notification_settings.change_order_decided (default on).

-- 1. Share RPCs + business
create or replace function public.get_shared_quote(p_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'quote', j - 'sections',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client', case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'business', public.client_business_json(q.user_id),
    'sections', j -> 'sections'
  )
  from public.quotes q
  cross join lateral (select public.client_quote_json(q.id) as j) x
  left join public.projects p on p.id = q.project_id
  left join public.clients c on c.id = coalesce(q.client_id, p.client_id)
  where p_token is not null and q.share_token = p_token;
$$;

create or replace function public.get_shared_invoice(p_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'invoice', j - 'items',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client', case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'business', public.client_business_json(inv.user_id),
    'items', j -> 'items'
  )
  from public.invoices inv
  cross join lateral (select public.client_invoice_json(inv.id) as j) x
  left join public.projects p on p.id = inv.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null and inv.share_token = p_token;
$$;

create or replace function public.get_shared_change_order(p_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'change_order', j - 'sections',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client', case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'business', public.client_business_json(co.user_id),
    'sections', j -> 'sections'
  )
  from public.change_orders co
  cross join lateral (select public.client_change_order_json(co.id) as j) x
  join public.projects p on p.id = co.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null and co.share_token = p_token;
$$;

-- 2. Change order decided → notification
alter table public.notification_settings add column if not exists change_order_decided boolean not null default true;

create or replace function public.change_order_notify_decided()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_on      boolean;
  v_client  text;
  v_project text;
  v_number  text;
begin
  if new.status not in ('approved', 'declined') or old.status is not distinct from new.status then
    return null;
  end if;
  -- The contractor recorded it themselves (in person / paper / other).
  if new.status = 'approved' and new.approval_method is not null then
    return null;
  end if;
  select change_order_decided into v_on from public.notification_settings where user_id = new.user_id;
  if not coalesce(v_on, true) then
    return null;
  end if;

  select c.name, p.name into v_client, v_project
    from public.projects p left join public.clients c on c.id = p.client_id
   where p.id = new.project_id;
  v_number := 'CO-' || lpad(public.change_order_number(new.id)::text, 3, '0');

  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  values (
    new.user_id,
    'change_order_' || new.status,
    coalesce(v_client, 'Your client') || case when new.status = 'approved' then ' signed ' else ' declined ' end
      || v_number || coalesce(' — ' || nullif(new.title, ''), ''),
    case when new.status = 'approved'
      then case when new.amount < 0 then 'Credit −$' || to_char(-new.amount, 'FM999,999,990.00')
                else 'Adds $' || to_char(new.amount, 'FM999,999,990.00') end
             || coalesce(' · ' || v_project, '')
      else coalesce('"' || left(new.decline_comment, 140) || '"', v_project)
    end,
    '/projects/' || new.project_id || '/change-orders/' || new.id,
    'change_order_' || new.status || ':' || new.id
  )
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;

drop trigger if exists change_orders_z_notify on public.change_orders;
create trigger change_orders_z_notify after update of status on public.change_orders
  for each row execute function public.change_order_notify_decided();
