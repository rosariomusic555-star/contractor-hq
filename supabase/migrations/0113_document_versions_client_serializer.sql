-- ContractorHQ — Feature 3: document version history + one client-facing
-- serializer. Run AFTER 0112.
--
-- 1. Client-facing serializer. client_quote_json / client_change_order_json
--    / client_invoice_json / client_payment_json / client_business_json build
--    every client-visible object FIELD BY FIELD (a whitelist — never
--    to_jsonb(row) minus a few keys, which is how overhead_rate and
--    target_margin_pct were leaking through the public quote link). The
--    Client Hub, the public quote / change order / invoice / receipt links,
--    the version snapshots and the project summary PDF all read through
--    these. Mirrored in src/lib/clientSafe.ts (+ its test).
--
-- 2. document_versions — one shared, immutable snapshot table for quotes
--    (original + add-on), change orders and invoices. A snapshot is taken
--    by the DB itself whenever a document becomes sent / approved /
--    declined, and by the app after saving a document that's already out
--    (snapshot_document RPC). The version number only goes up when the
--    client-facing content changed; an approval / decline is recorded on
--    the version that was approved. Older versions stay viewable
--    ("Superseded by v2"). Existing documents get a v1 baseline from their
--    current state — earlier edits were never stored and can't be recovered.
--
-- 3. Client Hub: get_portal_project re-issued on the serializer, plus
--    payments and versions; get_client_view_project — the same payload for
--    the contractor's own "Client view" preview.

-- ---------------------------------------------------------------------------
-- 1. Serializer
-- ---------------------------------------------------------------------------

create or replace function public.client_business_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', bp.company_name, 'phone', bp.phone, 'email', bp.email,
      'address', bp.address, 'license', bp.license, 'logo_url', bp.logo_url)
    from public.business_profile bp where bp.user_id = p_user_id
  ), jsonb_build_object('company_name', null, 'phone', null, 'email', null, 'address', null, 'license', null, 'logo_url', null));
$$;

create or replace function public.client_quote_json(p_quote_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id,
    'kind', coalesce(q.kind, 'original'),
    'addon_number', case when q.kind = 'addon' then public.addon_quote_number(q.id) end,
    'status', q.status,
    'deposit_percentage', q.deposit_percentage,
    'notes', q.notes,
    'terms', q.terms,
    'signed_at', q.signed_at,
    'signed_by', q.signed_by,
    'declined_at', q.declined_at,
    'decline_comment', q.decline_comment,
    'created_at', q.created_at,
    'updated_at', q.updated_at,
    'total', public.quote_committed_total(q.id),
    'approval', case
      when q.status = 'approved' then jsonb_build_object('name', q.signed_by, 'at', q.signed_at, 'ip', q.signed_ip)
      when q.status = 'declined' then jsonb_build_object('at', q.declined_at, 'comment', q.decline_comment)
    end,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'is_optional', s.is_optional, 'sort_order', s.sort_order,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'description', i.description,
            'price', i.price, 'quantity', i.quantity, 'unit', i.unit,
            'is_optional', i.is_optional, 'client_selected', i.client_selected, 'sort_order', i.sort_order,
            'images', coalesce((
              select jsonb_agg(jsonb_build_object('id', img.id, 'storage_path', img.storage_path) order by img.sort_order)
              from public.quote_item_images img where img.quote_item_id = i.id
            ), '[]'::jsonb)
          ) order by i.sort_order, i.name)
          from public.quote_items i where i.section_id = s.id
        ), '[]'::jsonb)
      ) order by s.sort_order, s.name)
      from public.quote_sections s where s.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.quotes q where q.id = p_quote_id;
$$;

create or replace function public.client_change_order_json(p_change_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', co.id,
    'number', public.change_order_number(co.id),
    'title', co.title,
    'description', co.description,
    'reason', co.reason,
    'amount', co.amount,
    'status', co.status,
    'schedule_impact_days', co.schedule_impact_days,
    'signed_at', co.signed_at,
    'signed_by', co.signed_by,
    'approved_at', co.approved_at,
    'approved_by', co.approved_by,
    'declined_at', co.declined_at,
    'decline_comment', co.decline_comment,
    'created_at', co.created_at,
    'total', co.amount,
    'approval', case
      when co.status = 'approved' then jsonb_build_object(
        'name', coalesce(co.approved_by, co.signed_by), 'at', coalesce(co.approved_at, co.signed_at), 'ip', co.approved_ip)
      when co.status = 'declined' then jsonb_build_object('at', co.declined_at, 'comment', co.decline_comment)
    end,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'sort_order', s.sort_order, 'scope_note', s.scope_note,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'description', i.description,
            'price', i.price, 'quantity', i.quantity, 'unit', i.unit, 'sort_order', i.sort_order,
            'images', coalesce((
              select jsonb_agg(jsonb_build_object('id', img.id, 'storage_path', img.storage_path) order by img.sort_order)
              from public.change_order_item_images img where img.change_order_item_id = i.id
            ), '[]'::jsonb)
          ) order by i.sort_order, i.name)
          from public.change_order_items i where i.section_id = s.id
        ), '[]'::jsonb)
      ) order by s.sort_order, s.name)
      from public.change_order_sections s where s.change_order_id = co.id
    ), '[]'::jsonb)
  )
  from public.change_orders co where co.id = p_change_order_id;
$$;

create or replace function public.client_invoice_json(p_invoice_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', inv.id,
    'invoice_number', inv.invoice_number,
    'amount', inv.amount,
    'amount_paid', inv.amount_paid,
    'status', inv.status,
    'due_date', inv.due_date,
    'notes', inv.notes,
    'paid_at', inv.paid_at,
    'created_at', inv.created_at,
    'updated_at', inv.updated_at,
    'total', inv.amount,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', it.description, 'quantity', it.quantity, 'unit_price', it.unit_price
      ) order by it.sort_order)
      from public.invoice_items it where it.invoice_id = inv.id
    ), '[]'::jsonb)
  )
  from public.invoices inv where inv.id = p_invoice_id;
$$;

-- No internal note, no ids beyond the receipt token and the invoice it
-- was applied to.
create or replace function public.client_payment_json(p_payment_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token', pay.share_token,
    'receipt_number', pay.receipt_number,
    'amount', pay.amount,
    'paid_on', pay.paid_on,
    'method', pay.method,
    'reference', pay.reference,
    'status', pay.status,
    'voided_at', pay.voided_at,
    'created_at', pay.created_at,
    'applied_to', coalesce((
      select jsonb_agg(jsonb_build_object('invoice_id', a.invoice_id, 'invoice_number', i.invoice_number, 'amount', a.amount)
                       order by i.invoice_number)
      from public.payment_allocations a join public.invoices i on i.id = a.invoice_id
      where a.payment_id = pay.id
    ), '[]'::jsonb)
  )
  from public.payments pay where pay.id = p_payment_id;
$$;

create or replace function public.client_document_json(p_type text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_type
    when 'quote' then public.client_quote_json(p_id)
    when 'change_order' then public.client_change_order_json(p_id)
    when 'invoice' then public.client_invoice_json(p_id)
  end;
$$;

-- The part of a document whose change makes a NEW version: what the client
-- is being asked to agree to / pay. Status, signatures, the client's own
-- optional-item picks, and paid amounts are not content.
create or replace function public.client_document_core(p_type text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_type
    when 'quote' then (
      select jsonb_build_object(
        'notes', q.notes, 'terms', q.terms, 'deposit', q.deposit_percentage,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', s.name, 'optional', s.is_optional,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', i.name, 'description', i.description, 'price', i.price,
                'quantity', i.quantity, 'unit', i.unit, 'optional', i.is_optional
              ) order by i.sort_order, i.name)
              from public.quote_items i where i.section_id = s.id
            ), '[]'::jsonb)
          ) order by s.sort_order, s.name)
          from public.quote_sections s where s.quote_id = q.id
        ), '[]'::jsonb))
      from public.quotes q where q.id = p_id)
    when 'change_order' then (
      select jsonb_build_object(
        'title', co.title, 'description', co.description, 'reason', co.reason,
        'amount', co.amount, 'days', co.schedule_impact_days,
        'sections', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', s.name, 'scope', s.scope_note,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', i.name, 'description', i.description, 'price', i.price,
                'quantity', i.quantity, 'unit', i.unit
              ) order by i.sort_order, i.name)
              from public.change_order_items i where i.section_id = s.id
            ), '[]'::jsonb)
          ) order by s.sort_order, s.name)
          from public.change_order_sections s where s.change_order_id = co.id
        ), '[]'::jsonb))
      from public.change_orders co where co.id = p_id)
    when 'invoice' then (
      select jsonb_build_object(
        'amount', inv.amount, 'due', inv.due_date, 'notes', inv.notes,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('d', it.description, 'q', it.quantity, 'p', it.unit_price) order by it.sort_order)
          from public.invoice_items it where it.invoice_id = inv.id
        ), '[]'::jsonb))
      from public.invoices inv where inv.id = p_id)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. document_versions
-- ---------------------------------------------------------------------------

create table if not exists public.document_versions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  doc_type     text not null check (doc_type in ('quote', 'change_order', 'invoice')),
  doc_id       uuid not null,
  version      int not null,
  -- quote / change order: sent | approved | declined; invoice: issued
  state        text not null check (state in ('sent', 'approved', 'declined', 'issued')),
  -- what created it: baseline (0113 backfill) | sent | approved | declined | edited
  event        text not null,
  content      jsonb not null,
  content_hash text not null,
  total        numeric,
  approval     jsonb,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (doc_type, doc_id, version)
);

create index if not exists document_versions_project_idx on public.document_versions (project_id, created_at);

alter table public.document_versions enable row level security;
drop policy if exists "own read" on public.document_versions;
create policy "own read" on public.document_versions for select to authenticated using (user_id = auth.uid());
drop policy if exists "employees excluded" on public.document_versions;
create policy "employees excluded" on public.document_versions as restrictive for all to authenticated
  using (not public.is_employee()) with check (not public.is_employee());
revoke all on public.document_versions from anon;
-- Writes only through the security-definer snapshot function below.
revoke insert, update, delete on public.document_versions from authenticated;

-- Immutable: the only change ever allowed is recording the client's
-- approval / decline on the (unchanged) version they were sent.
create or replace function public.document_versions_guard()
returns trigger language plpgsql as $$
begin
  if old.state = 'sent' and new.state in ('approved', 'declined')
     and new.content_hash = old.content_hash and new.version = old.version
     and new.doc_id = old.doc_id and new.doc_type = old.doc_type then
    return new;
  end if;
  raise exception 'Document versions are immutable';
end;
$$;

drop trigger if exists document_versions_guard on public.document_versions;
create trigger document_versions_guard before update on public.document_versions
  for each row execute function public.document_versions_guard();

create or replace function public._snapshot_document(p_type text, p_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text; v_user uuid; v_project uuid; v_state text;
  v_content jsonb; v_hash text; v_approval jsonb;
  l_id uuid; l_version int; l_state text; l_hash text;
begin
  if p_type = 'quote' then
    select status, user_id, project_id into v_status, v_user, v_project from public.quotes where id = p_id;
  elsif p_type = 'change_order' then
    select status, user_id, project_id into v_status, v_user, v_project from public.change_orders where id = p_id;
  elsif p_type = 'invoice' then
    select status, user_id, project_id into v_status, v_user, v_project from public.invoices where id = p_id;
  else
    raise exception 'Unknown document type %', p_type;
  end if;
  if v_status is null or v_status in ('draft', 'not_selected') then return; end if;

  v_state := case when p_type = 'invoice' then 'issued' when v_status in ('approved', 'declined') then v_status else 'sent' end;
  v_content := public.client_document_json(p_type, p_id);
  v_hash := md5(public.client_document_core(p_type, p_id)::text);
  v_approval := case when v_state in ('approved', 'declined') then v_content -> 'approval' end;

  select id, version, state, content_hash into l_id, l_version, l_state, l_hash
    from public.document_versions where doc_type = p_type and doc_id = p_id
    order by version desc limit 1;

  if l_id is null or l_hash <> v_hash or (l_state in ('approved', 'declined') and v_state = 'sent') then
    insert into public.document_versions (user_id, project_id, doc_type, doc_id, version, state, event, content, content_hash, total, approval, decided_at)
    values (v_user, v_project, p_type, p_id, coalesce(l_version, 0) + 1, v_state, p_event, v_content, v_hash,
            (v_content ->> 'total')::numeric, v_approval, case when v_approval is not null then now() end);
  elsif l_state = 'sent' and v_state in ('approved', 'declined') then
    -- Same content: the approval (and the client's optional picks) land on
    -- the version they were sent.
    update public.document_versions
       set state = v_state, content = v_content, total = (v_content ->> 'total')::numeric,
           approval = v_approval, decided_at = now()
     where id = l_id;
  end if;
end;
$$;

revoke all on function public._snapshot_document(text, uuid, text) from public, anon, authenticated;

-- The app calls this after saving a document that's already out with the
-- client (a revision). No-op for drafts / unchanged content.
create or replace function public.snapshot_document(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if p_type = 'quote' then select user_id into v_owner from public.quotes where id = p_id;
  elsif p_type = 'change_order' then select user_id into v_owner from public.change_orders where id = p_id;
  elsif p_type = 'invoice' then select user_id into v_owner from public.invoices where id = p_id;
  end if;
  if v_owner is null or v_owner <> auth.uid() or public.is_employee() then return; end if;
  perform public._snapshot_document(p_type, p_id, 'edited');
end;
$$;

grant execute on function public.snapshot_document(text, uuid) to authenticated;

-- Status transitions → snapshot, whoever makes them (contractor send,
-- share-link signature, Client Hub approval).
create or replace function public.document_status_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('sent', 'approved', 'declined') then
    perform public._snapshot_document(tg_argv[0], new.id, new.status);
  end if;
  return null;
end;
$$;

drop trigger if exists quotes_version_snapshot on public.quotes;
create trigger quotes_version_snapshot after update of status on public.quotes
  for each row execute function public.document_status_snapshot('quote');
drop trigger if exists change_orders_version_snapshot on public.change_orders;
create trigger change_orders_version_snapshot after update of status on public.change_orders
  for each row execute function public.document_status_snapshot('change_order');
drop trigger if exists invoices_version_snapshot on public.invoices;
create trigger invoices_version_snapshot after update of status on public.invoices
  for each row execute function public.document_status_snapshot('invoice');

-- A deleted document takes its versions with it.
create or replace function public.document_versions_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.document_versions where doc_type = tg_argv[0] and doc_id = old.id;
  return null;
end;
$$;

-- The guard only blocks UPDATEs, so this delete is allowed.
drop trigger if exists quotes_versions_cleanup on public.quotes;
create trigger quotes_versions_cleanup after delete on public.quotes
  for each row execute function public.document_versions_cleanup('quote');
drop trigger if exists change_orders_versions_cleanup on public.change_orders;
create trigger change_orders_versions_cleanup after delete on public.change_orders
  for each row execute function public.document_versions_cleanup('change_order');
drop trigger if exists invoices_versions_cleanup on public.invoices;
create trigger invoices_versions_cleanup after delete on public.invoices
  for each row execute function public.document_versions_cleanup('invoice');

-- Baseline v1 for everything already out with a client.
do $$
declare r record;
begin
  for r in select id from public.quotes where status in ('sent', 'approved', 'declined') order by created_at loop
    perform public._snapshot_document('quote', r.id, 'baseline');
  end loop;
  for r in select id from public.change_orders where status in ('sent', 'approved', 'declined') order by created_at loop
    perform public._snapshot_document('change_order', r.id, 'baseline');
  end loop;
  for r in select id from public.invoices where status <> 'draft' order by created_at loop
    perform public._snapshot_document('invoice', r.id, 'baseline');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Client Hub payload (one builder, two gates)
-- ---------------------------------------------------------------------------

create or replace function public._portal_project_json(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'status', p.status,
      'address', p.address,
      'scheduled_start_date', case when p.status <> 'estimating' then p.scheduled_start_date end,
      'scheduled_end_date', case when p.status <> 'estimating' then p.scheduled_end_date end,
      'actual_start_date', case when p.status <> 'estimating' then p.actual_start_date end,
      'actual_end_date', case when p.status <> 'estimating' then p.actual_end_date end
    ),
    'client', (select jsonb_build_object('name', c.name) from public.clients c where c.id = p.client_id),
    'business', public.client_business_json(p.user_id),
    'quotes', coalesce((
      select jsonb_agg(public.client_quote_json(q.id) order by q.created_at desc)
      from public.quotes q
      where q.project_id = p.id and q.status in ('sent', 'approved', 'declined')
    ), '[]'::jsonb),
    'change_orders', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
      select jsonb_agg(public.client_change_order_json(co.id) order by co.created_at desc)
      from public.change_orders co
      where co.project_id = p.id and co.status in ('sent', 'approved', 'declined')
    ), '[]'::jsonb) end,
    'invoices', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
      select jsonb_agg(public.client_invoice_json(inv.id) order by inv.created_at desc)
      from public.invoices inv
      where inv.project_id = p.id and inv.status in ('sent', 'paid', 'overdue')
    ), '[]'::jsonb) end,
    'payments', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
      select jsonb_agg(public.client_payment_json(pay.id) order by pay.paid_on desc, pay.created_at desc)
      from public.payments pay where pay.project_id = p.id
    ), '[]'::jsonb) end,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'doc_type', v.doc_type, 'doc_id', v.doc_id, 'version', v.version, 'state', v.state,
        'event', v.event, 'total', v.total, 'approval', v.approval,
        'created_at', v.created_at, 'decided_at', v.decided_at, 'content', v.content
      ) order by v.doc_type, v.doc_id, v.version)
      from public.document_versions v
      where v.project_id = p.id
        and (p.status <> 'estimating' or v.doc_type = 'quote')
    ), '[]'::jsonb),
    'money', case when p.status = 'estimating' then null else jsonb_build_object(
      'contract_value', public.project_contract_value(p.id),
      'received', coalesce((select sum(pay.amount) from public.payments pay where pay.project_id = p.id and pay.status = 'active'), 0),
      'receipts', coalesce((
        select jsonb_agg(jsonb_build_object('number', pay.receipt_number, 'amount', pay.amount, 'paid_on', pay.paid_on,
                                            'token', pay.share_token) order by pay.paid_on desc, pay.created_at desc)
          from public.payments pay where pay.project_id = p.id and pay.status = 'active'), '[]'::jsonb)
    ) end,
    'photos', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', pi.id, 'storage_path', pi.storage_path, 'caption', pi.caption)
        order by pi.sort_order, pi.created_at
      )
      from public.project_images pi
      where pi.project_id = p.id and pi.client_visible = true
    ), '[]'::jsonb),
    'deliveries', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
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
    ), '[]'::jsonb) end,
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
  where p.id = p_project_id;
$$;

-- The serializer pieces are only ever reached through the gated functions.
revoke all on function public._portal_project_json(uuid) from public, anon, authenticated;
revoke all on function public.client_business_json(uuid) from public, anon, authenticated;
revoke all on function public.client_quote_json(uuid) from public, anon, authenticated;
revoke all on function public.client_change_order_json(uuid) from public, anon, authenticated;
revoke all on function public.client_invoice_json(uuid) from public, anon, authenticated;
revoke all on function public.client_payment_json(uuid) from public, anon, authenticated;
revoke all on function public.client_document_json(text, uuid) from public, anon, authenticated;
revoke all on function public.client_document_core(text, uuid) from public, anon, authenticated;

-- The client: their own project (matched by email), never a lost one.
create or replace function public.get_portal_project(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json(p.id)
  from public.projects p
  where p.id = p_project_id
    and p.status <> 'lost'
    and p.client_id is not null
    and exists (
      select 1 from public.clients c
      where c.id = p.client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;
grant execute on function public.get_portal_project(uuid) to authenticated;

-- The contractor's "Client view" preview: exactly what the client gets.
create or replace function public.get_client_view_project(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._portal_project_json(p.id)
  from public.projects p
  where p.id = p_project_id and p.user_id = auth.uid() and not public.is_employee();
$$;
grant execute on function public.get_client_view_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public links on the serializer (same output shape as before, minus
--    the leaked internal columns).
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_quote(p_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'quote', j - 'sections',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client', case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'sections', j -> 'sections'
  )
  from public.quotes q
  cross join lateral (select public.client_quote_json(q.id) as j) x
  left join public.projects p on p.id = q.project_id
  left join public.clients c on c.id = coalesce(q.client_id, p.client_id)
  where p_token is not null and q.share_token = p_token;
$$;

create or replace function public.get_shared_change_order(p_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'change_order', j - 'sections',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client', case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'sections', j -> 'sections'
  )
  from public.change_orders co
  cross join lateral (select public.client_change_order_json(co.id) as j) x
  join public.projects p on p.id = co.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null and co.share_token = p_token;
$$;

create or replace function public.get_shared_invoice(p_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'invoice', j - 'items',
    'project', case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client', case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'items', j -> 'items'
  )
  from public.invoices inv
  cross join lateral (select public.client_invoice_json(inv.id) as j) x
  left join public.projects p on p.id = inv.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null and inv.share_token = p_token;
$$;

create or replace function public.get_shared_receipt(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pay record; j jsonb; v_contract numeric; v_through numeric;
begin
  select * into pay from public.payments where share_token = p_token;
  if not found then return null; end if;
  j := public.client_payment_json(pay.id);
  if pay.project_id is not null then
    v_contract := public.project_contract_value(pay.project_id);
    select coalesce(sum(amount), 0) into v_through
      from public.payments
     where project_id = pay.project_id and status = 'active'
       and (paid_on, created_at) <= (pay.paid_on, pay.created_at);
  end if;
  return jsonb_build_object(
    'receipt', jsonb_build_object(
      'number', j -> 'receipt_number', 'amount', j -> 'amount', 'paid_on', j -> 'paid_on', 'method', j -> 'method',
      'reference', j -> 'reference', 'status', j -> 'status', 'voided_at', j -> 'voided_at'),
    'business', public.client_business_json(pay.user_id),
    'project', (select jsonb_build_object('name', p.name, 'address', p.address) from public.projects p where p.id = pay.project_id),
    'client', (select jsonb_build_object('name', c.name) from public.projects p join public.clients c on c.id = p.client_id where p.id = pay.project_id),
    'applied_to', j -> 'applied_to',
    'contract_value', v_contract,
    'received_through', v_through,
    'remaining_balance', case when v_contract is null then null else v_contract - v_through end
  );
end;
$$;
grant execute on function public.get_shared_receipt(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Result: versions created by the baseline, per type.
-- ---------------------------------------------------------------------------
select doc_type, state, count(*) as versions
from public.document_versions
group by doc_type, state
order by doc_type, state;
