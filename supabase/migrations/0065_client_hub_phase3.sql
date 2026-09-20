-- ContractorHQ — Client Hub, Phase 3 (quote + change order approvals from
-- the portal). Run AFTER 0064.
--
-- Every write here follows get_portal_project()'s exact authorization
-- shape (0064): a SECURITY DEFINER function that only ever touches a row
-- if it can prove, from the CALLER'S OWN verified JWT email, that the
-- row's project belongs to one of their client records — never from a
-- client-supplied token or id alone. An update whose WHERE clause doesn't
-- match (wrong email, wrong status, doesn't exist) silently affects zero
-- rows rather than erroring, so there's nothing here that leaks whether a
-- given id is real.

-- 'declined' was a valid quote status once (0003) and was deliberately
-- removed in 0006 ("simplified to draft | sent | approved") when nothing
-- used it yet. The portal is now the first real user of it.
do $$
declare c text;
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
alter table public.quotes add constraint quotes_status_check
  check (status in ('draft', 'sent', 'approved', 'declined'));

alter table public.quotes
  add column if not exists declined_at timestamptz,
  add column if not exists decline_comment text,
  -- sign_quote() (0007) already captures signed_by/signed_at; IP was never
  -- captured anywhere before — the spec now asks for it explicitly.
  add column if not exists signed_ip text;

-- change_orders had no signature-capture concept at all before this —
-- approval was always a contractor-side one-tap action, no client
-- signature to record.
alter table public.change_orders
  add column if not exists approved_by text,
  add column if not exists approved_ip text,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_comment text;

-- Best-effort caller IP, read from the request headers Supabase's
-- PostgREST layer exposes as a Postgres GUC — same "IP is what the
-- edge/proxy reports, not cryptographically provable" caveat as
-- portal-request-link's own IP-based rate limiting (0063).
create or replace function public.portal_request_ip()
returns text
language sql
stable
as $$
  select nullif(
    split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1),
    ''
  );
$$;

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
     and i.is_optional
     and q.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$$;

grant execute on function public.portal_set_quote_item_selection(uuid, boolean) to authenticated;

create or replace function public.portal_approve_quote(p_quote_id uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.quotes q
     set status = 'approved',
         signed_at = now(),
         signed_by = nullif(trim(p_signed_by), ''),
         signed_ip = portal_request_ip()
    from public.projects p, public.clients c
   where q.id = p_quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and q.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning q.project_id into v_project_id;

  if v_project_id is not null then
    update public.projects set status = 'approved' where id = v_project_id;
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'quote_signed',
           'Quote approved' || case
             when nullif(trim(p_signed_by), '') is not null then ' by ' || trim(p_signed_by)
             else ''
           end
    from public.projects p where p.id = v_project_id;
  end if;
end;
$$;

grant execute on function public.portal_approve_quote(uuid, text) to authenticated;

create or replace function public.portal_decline_quote(p_quote_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  update public.quotes q
     set status = 'declined',
         declined_at = now(),
         decline_comment = nullif(trim(p_comment), '')
    from public.projects p, public.clients c
   where q.id = p_quote_id
     and p.id = q.project_id
     and c.id = p.client_id
     and q.status = 'sent'
     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning q.project_id into v_project_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'quote_declined', 'Quote declined by client'
    from public.projects p where p.id = v_project_id;
  end if;
end;
$$;

grant execute on function public.portal_decline_quote(uuid, text) to authenticated;

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
         approved_ip = portal_request_ip()
    from public.projects p, public.clients c
   where co.id = p_change_order_id
     and p.id = co.project_id
     and c.id = p.client_id
     and co.status = 'pending'
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
     set status = 'rejected',
         declined_at = now(),
         decline_comment = nullif(trim(p_comment), '')
    from public.projects p, public.clients c
   where co.id = p_change_order_id
     and p.id = co.project_id
     and c.id = p.client_id
     and co.status = 'pending'
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

-- get_portal_project() (0064) re-issued only to add two event kinds that
-- didn't exist yet when it was first written: 'project_started' (new
-- ProjectEventKind, logged from the Estimated Duration card's own
-- actual_start_date transition) and 'quote_declined' (this migration).
-- Everything else about the function is unchanged from 0064.
create or replace function public.get_portal_project(p_project_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'status', p.status,
      'scheduled_start_date', p.scheduled_start_date,
      'scheduled_end_date', p.scheduled_end_date,
      'actual_start_date', p.actual_start_date,
      'actual_end_date', p.actual_end_date
    ),
    'business', jsonb_build_object(
      'company_name', bp.company_name,
      'phone', bp.phone,
      'email', bp.email,
      'logo_url', bp.logo_url
    ),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'status', q.status,
        'deposit_percentage', q.deposit_percentage,
        'signed_at', q.signed_at,
        'signed_by', q.signed_by,
        'declined_at', q.declined_at,
        'decline_comment', q.decline_comment,
        'sections', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', s.id, 'name', s.name, 'is_optional', s.is_optional, 'sort_order', s.sort_order,
              'items', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', i.id, 'name', i.name, 'description', i.description,
                    'price', i.price, 'quantity', i.quantity, 'unit', i.unit,
                    'is_optional', i.is_optional, 'client_selected', i.client_selected
                  ) order by i.sort_order, i.name
                )
                from public.quote_items i where i.section_id = s.id
              ), '[]'::jsonb)
            ) order by s.sort_order, s.name
          )
          from public.quote_sections s where s.quote_id = q.id
        ), '[]'::jsonb)
      ) order by q.created_at desc)
      from public.quotes q
      where q.project_id = p.id and q.status in ('sent', 'approved', 'declined')
    ), '[]'::jsonb),
    'change_orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', co.id, 'title', co.title, 'description', co.description,
          'reason', co.reason, 'amount', co.amount, 'status', co.status,
          'approved_at', co.approved_at, 'approved_by', co.approved_by,
          'declined_at', co.declined_at, 'decline_comment', co.decline_comment,
          'created_at', co.created_at
        ) order by co.created_at desc
      )
      from public.change_orders co where co.project_id = p.id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', inv.id, 'invoice_number', inv.invoice_number, 'amount', inv.amount,
          'status', inv.status, 'due_date', inv.due_date, 'paid_at', inv.paid_at,
          'created_at', inv.created_at
        ) order by inv.created_at desc
      )
      from public.invoices inv
      where inv.project_id = p.id and inv.status in ('sent', 'paid', 'overdue')
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', pi.id, 'storage_path', pi.storage_path, 'caption', pi.caption)
        order by pi.sort_order, pi.created_at
      )
      from public.project_images pi
      where pi.project_id = p.id and pi.client_visible = true
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mo.id, 'supplier', mo.supplier, 'expected_delivery_date', mo.expected_delivery_date,
          'status', mo.status,
          'photos', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', moi.id, 'storage_path', moi.storage_path, 'caption', moi.caption)
              order by moi.sort_order
            )
            from public.material_order_images moi where moi.material_order_id = mo.id
          ), '[]'::jsonb)
        ) order by mo.expected_delivery_date nulls last, mo.created_at desc
      )
      from public.material_orders mo where mo.project_id = p.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', e.id, 'kind', e.kind, 'summary', e.summary, 'created_at', e.created_at)
        order by e.created_at desc
      )
      from public.project_events e
      where e.project_id = p.id
        and e.kind in (
          'project_created', 'status_changed', 'quote_sent', 'quote_signed', 'quote_declined',
          'invoice_sent', 'invoice_paid', 'change_order_created', 'change_order_approved',
          'change_order_rejected', 'project_started'
        )
    ), '[]'::jsonb)
  )
  from public.projects p
  left join public.business_profile bp on bp.user_id = p.user_id
  where p.id = p_project_id
    and p.client_id is not null
    and exists (
      select 1 from public.clients c
      where c.id = p.client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

grant execute on function public.get_portal_project(uuid) to authenticated;
