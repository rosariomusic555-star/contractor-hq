-- =============================================================================
-- 0111 — Project-level payments + receipts
--
--   Quote / change order / add-on  = price and scope
--   Invoice                        = request for payment
--   Payment                        = money actually received   (payments)
--   Allocation                     = how much of a payment pays an invoice
--   Receipt                        = proof of a payment (numbered R-0001…,
--                                    public link, never a hard delete)
--
-- A payment belongs to a project (or, for a standalone invoice, just to that
-- invoice). It can be applied to one or more invoices, in part; whatever
-- isn't applied is the project's unallocated credit. An invoice's
-- amount_paid / status / paid_at are kept in sync here, from ACTIVE
-- payments applied to it only — an unapplied payment never makes an invoice
-- look paid. Payments are edited or voided, never deleted; every change is
-- logged in payment_events.
--
-- Existing paid invoices become one payment each, applied in full, with no
-- change to any invoice's status, paid date or any total (checked at the end).
-- =============================================================================

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete cascade,
  amount         numeric not null check (amount > 0),
  paid_on        date not null default current_date,
  method         text not null default 'other' check (method in ('check', 'cash', 'card', 'ach', 'zelle', 'venmo', 'other')),
  reference      text,
  note           text,
  status         text not null default 'active' check (status in ('active', 'void')),
  voided_at      timestamptz,
  voided_by      uuid,
  void_reason    text,
  receipt_number text,
  share_token    uuid not null default gen_random_uuid() unique,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists payments_project_idx on public.payments (project_id, paid_on);
create index if not exists payments_user_idx on public.payments (user_id, paid_on);
create unique index if not exists payments_receipt_number_key on public.payments (user_id, receipt_number);

create table if not exists public.payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount     numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create index if not exists payment_allocations_invoice_idx on public.payment_allocations (invoice_id);

create table if not exists public.payment_events (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  user_id    uuid default auth.uid(),
  action     text not null check (action in ('created', 'edited', 'voided', 'restored', 'applied', 'unapplied', 'migrated')),
  changes    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_payment_idx on public.payment_events (payment_id, created_at);

alter table public.invoices add column if not exists amount_paid numeric not null default 0;

-- RLS: the contractor's own; employees never; clients only via the
-- receipt / Client Hub functions below.
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "own" on public.payments;
create policy "own" on public.payments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own" on public.payment_allocations;
create policy "own" on public.payment_allocations for all to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.payments p where p.id = payment_id and p.user_id = auth.uid()));
drop policy if exists "own" on public.payment_events;
create policy "own" on public.payment_events for all to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.payments p where p.id = payment_id and p.user_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['payments', 'payment_allocations', 'payment_events'] loop
    execute format('drop policy if exists "employees excluded" on public.%I', t);
    execute format('create policy "employees excluded" on public.%I as restrictive for all to authenticated using (not public.is_employee()) with check (not public.is_employee())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Receipt numbers: R-0001, R-0002… per contractor, never reused.
-- ---------------------------------------------------------------------------

create or replace function public.payments_assign_receipt_number()
returns trigger language plpgsql as $$
declare v_next int;
begin
  if new.receipt_number is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('receipt:' || new.user_id::text));
  select coalesce(max(nullif(regexp_replace(receipt_number, '\D', '', 'g'), '')::int), 0) + 1
    into v_next from public.payments where user_id = new.user_id;
  new.receipt_number := 'R-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists payments_receipt_number on public.payments;
create trigger payments_receipt_number before insert on public.payments
  for each row execute function public.payments_assign_receipt_number();

-- ---------------------------------------------------------------------------
-- A payment can't be applied for more than it's worth.
-- ---------------------------------------------------------------------------

create or replace function public.payment_allocations_within_amount()
returns trigger language plpgsql as $$
declare v_amount numeric; v_applied numeric;
begin
  select amount into v_amount from public.payments where id = new.payment_id;
  select coalesce(sum(amount), 0) into v_applied from public.payment_allocations where payment_id = new.payment_id;
  if v_applied > v_amount + 0.005 then
    raise exception 'Applied % is more than this payment (%).', v_applied, v_amount;
  end if;
  return null;
end;
$$;

drop trigger if exists payment_allocations_within_amount on public.payment_allocations;
create constraint trigger payment_allocations_within_amount
  after insert or update on public.payment_allocations
  deferrable initially deferred
  for each row execute function public.payment_allocations_within_amount();

-- ---------------------------------------------------------------------------
-- Invoice amount_paid / status / paid_at, from ACTIVE applied payments.
-- ---------------------------------------------------------------------------

create or replace function public.recompute_invoice_payments(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric; v_last date; v_inv record;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then return; end if;
  select coalesce(sum(a.amount), 0), max(p.paid_on)
    into v_paid, v_last
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
   where a.invoice_id = p_invoice_id and p.status = 'active';

  update public.invoices i set
    amount_paid = v_paid,
    status = case
      when v_paid >= i.amount - 0.005 and i.amount > 0 then 'paid'
      when i.status = 'paid' then 'sent'
      else i.status end,
    paid_at = case
      when v_paid >= i.amount - 0.005 and i.amount > 0 then coalesce(case when i.status = 'paid' then i.paid_at end, (v_last::timestamp + interval '12 hours') at time zone 'UTC')
      else null end
  where i.id = p_invoice_id
    and (i.amount_paid is distinct from v_paid
         or (v_paid >= i.amount - 0.005 and i.amount > 0) is distinct from (i.status = 'paid'));
end;
$$;

create or replace function public.payment_allocations_sync_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    perform public.recompute_invoice_payments(new.invoice_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id) then
    perform public.recompute_invoice_payments(old.invoice_id);
  end if;
  return null;
end;
$$;

create or replace function public.payments_sync_invoices()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv uuid;
begin
  for v_inv in select invoice_id from public.payment_allocations where payment_id = new.id loop
    perform public.recompute_invoice_payments(v_inv);
  end loop;
  return null;
end;
$$;

create or replace function public.invoices_resync_on_amount()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.amount is distinct from old.amount then perform public.recompute_invoice_payments(new.id); end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create or replace function public.payments_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_changes jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'INSERT' then
    insert into public.payment_events (payment_id, user_id, action, changes)
    values (new.id, coalesce(auth.uid(), new.user_id), 'created',
            jsonb_build_object('amount', new.amount, 'paid_on', new.paid_on, 'method', new.method, 'reference', new.reference));
    return null;
  end if;
  foreach k in array array['amount', 'paid_on', 'method', 'reference', 'note', 'project_id'] loop
    if (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
    end if;
  end loop;
  if old.status is distinct from new.status then
    insert into public.payment_events (payment_id, user_id, action, changes)
    values (new.id, coalesce(auth.uid(), new.user_id), case when new.status = 'void' then 'voided' else 'restored' end,
            jsonb_build_object('reason', new.void_reason));
  end if;
  if v_changes <> '{}'::jsonb then
    insert into public.payment_events (payment_id, user_id, action, changes)
    values (new.id, coalesce(auth.uid(), new.user_id), 'edited', v_changes);
  end if;
  return null;
end;
$$;

create or replace function public.payment_allocations_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  select invoice_number into v_num from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if tg_op = 'INSERT' then
    insert into public.payment_events (payment_id, action, changes)
    values (new.payment_id, 'applied', jsonb_build_object('invoice', v_num, 'amount', new.amount));
  elsif tg_op = 'UPDATE' then
    insert into public.payment_events (payment_id, action, changes)
    values (new.payment_id, 'applied', jsonb_build_object('invoice', v_num, 'amount', jsonb_build_object('from', old.amount, 'to', new.amount)));
  else
    insert into public.payment_events (payment_id, action, changes)
    values (old.payment_id, 'unapplied', jsonb_build_object('invoice', v_num, 'amount', old.amount));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contract value in SQL (mirrors projectContractValue in src/lib/api.ts):
-- headline original quote (approved, else sent, else draft — most recent) +
-- approved add-on quotes + approved change orders.
-- ---------------------------------------------------------------------------

create or replace function public.project_contract_value(p_project_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((
           select public.quote_committed_total(q.id) from public.quotes q
            where q.project_id = p_project_id and q.kind = 'original' and q.status in ('approved', 'sent', 'draft')
            order by case q.status when 'approved' then 1 when 'sent' then 2 else 3 end, q.created_at desc
            limit 1), 0)
       + coalesce((select sum(public.quote_committed_total(q.id)) from public.quotes q
                    where q.project_id = p_project_id and q.kind = 'addon' and q.status = 'approved'), 0)
       + coalesce((select sum(co.amount) from public.change_orders co
                    where co.project_id = p_project_id and co.status = 'approved'), 0)
$$;

-- ---------------------------------------------------------------------------
-- Convert existing paid invoices (before the sync / audit triggers exist, so
-- nothing about the invoices moves), then check.
-- ---------------------------------------------------------------------------

create temp table _pay_before as
select i.id, i.invoice_number, i.status, i.paid_at, i.amount,
       case when i.status = 'paid' then i.amount else 0 end as collected
from public.invoices i;

do $$
declare r record; v_pay uuid;
begin
  for r in
    select i.* from public.invoices i
     where i.status = 'paid' and i.amount > 0
       and not exists (select 1 from public.payment_allocations a where a.invoice_id = i.id)
     order by coalesce(i.paid_at, i.updated_at), i.created_at
  loop
    insert into public.payments (user_id, project_id, amount, paid_on, method, note, created_by, created_at)
    values (r.user_id, r.project_id, r.amount,
            coalesce((r.paid_at at time zone 'UTC')::date, r.updated_at::date), 'other',
            'Recorded from ' || coalesce(r.invoice_number, 'invoice'), r.user_id, coalesce(r.paid_at, now()))
    returning id into v_pay;
    insert into public.payment_allocations (payment_id, invoice_id, amount) values (v_pay, r.id, r.amount);
    insert into public.payment_events (payment_id, user_id, action, changes)
    values (v_pay, r.user_id, 'migrated', jsonb_build_object('invoice', r.invoice_number, 'amount', r.amount));
  end loop;

  update public.invoices i
     set amount_paid = coalesce((select sum(a.amount) from public.payment_allocations a
                                  join public.payments p on p.id = a.payment_id
                                 where a.invoice_id = i.id and p.status = 'active'), 0);
end $$;

drop trigger if exists payment_allocations_sync_invoice on public.payment_allocations;
create trigger payment_allocations_sync_invoice
  after insert or update or delete on public.payment_allocations
  for each row execute function public.payment_allocations_sync_invoice();

drop trigger if exists payments_sync_invoices on public.payments;
create trigger payments_sync_invoices
  after update of status, amount, paid_on on public.payments
  for each row execute function public.payments_sync_invoices();

drop trigger if exists invoices_resync_on_amount on public.invoices;
create trigger invoices_resync_on_amount
  after update of amount on public.invoices
  for each row execute function public.invoices_resync_on_amount();

drop trigger if exists payments_audit on public.payments;
create trigger payments_audit
  after insert or update on public.payments
  for each row execute function public.payments_audit();

drop trigger if exists payment_allocations_audit on public.payment_allocations;
create trigger payment_allocations_audit
  after insert or update or delete on public.payment_allocations
  for each row execute function public.payment_allocations_audit();

-- ---------------------------------------------------------------------------
-- Public receipt (client-facing): branding, client, project, amount, method,
-- reference, what it paid, the project balance after it. Never any cost,
-- profit, margin or the internal note.
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_receipt(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; pay record; v_contract numeric; v_through numeric;
begin
  select * into pay from public.payments where share_token = p_token and p_token is not null;
  if not found then return null; end if;
  if pay.project_id is not null then
    v_contract := public.project_contract_value(pay.project_id);
    select coalesce(sum(amount), 0) into v_through from public.payments
     where project_id = pay.project_id and status = 'active'
       and (paid_on, created_at) <= (pay.paid_on, pay.created_at);
  end if;
  select jsonb_build_object(
    'receipt', jsonb_build_object(
      'number', pay.receipt_number, 'amount', pay.amount, 'paid_on', pay.paid_on, 'method', pay.method,
      'reference', pay.reference, 'status', pay.status, 'voided_at', pay.voided_at),
    'business', (select jsonb_build_object('company_name', bp.company_name, 'phone', bp.phone, 'email', bp.email,
                                           'address', bp.address, 'license', bp.license)
                   from public.business_profile bp where bp.user_id = pay.user_id),
    'project', (select jsonb_build_object('name', p.name, 'address', p.address) from public.projects p where p.id = pay.project_id),
    'client', (select jsonb_build_object('name', c.name) from public.projects p join public.clients c on c.id = p.client_id where p.id = pay.project_id),
    'applied_to', coalesce((select jsonb_agg(jsonb_build_object('invoice_number', i.invoice_number, 'amount', a.amount) order by i.invoice_number)
                              from public.payment_allocations a join public.invoices i on i.id = a.invoice_id
                             where a.payment_id = pay.id), '[]'::jsonb),
    'contract_value', v_contract,
    'received_through', v_through,
    'remaining_balance', case when v_contract is null then null else v_contract - v_through end
  ) into v;
  return v;
end;
$$;

revoke execute on function public.get_shared_receipt(uuid) from public;
grant execute on function public.get_shared_receipt(uuid) to anon, authenticated;



-- ---------------------------------------------------------------------------
-- Client Hub: invoices carry amount_paid (so partial payments read right)
-- and a money summary — contract, paid to date, receipts. Same function as
-- 0108 otherwise.
-- ---------------------------------------------------------------------------

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
      'scheduled_start_date', case when p.status <> 'estimating' then p.scheduled_start_date end,
      'scheduled_end_date', case when p.status <> 'estimating' then p.scheduled_end_date end,
      'actual_start_date', case when p.status <> 'estimating' then p.actual_start_date end,
      'actual_end_date', case when p.status <> 'estimating' then p.actual_end_date end
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
        'kind', q.kind,
        'addon_number', case when q.kind = 'addon' then public.addon_quote_number(q.id) end,
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
    'change_orders', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', co.id, 'title', co.title, 'description', co.description,
          'reason', co.reason, 'amount', co.amount, 'status', co.status,
          'schedule_impact_days', co.schedule_impact_days,
          'approved_at', co.approved_at, 'approved_by', co.approved_by,
          'declined_at', co.declined_at, 'decline_comment', co.decline_comment,
          'created_at', co.created_at,
          'number', public.change_order_number(co.id),
          'sections', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id, 'name', s.name, 'sort_order', s.sort_order, 'scope_note', s.scope_note,
                'items', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', i.id, 'name', i.name, 'description', i.description,
                      'price', i.price, 'quantity', i.quantity, 'unit', i.unit
                    ) order by i.sort_order, i.name
                  )
                  from public.change_order_items i where i.section_id = s.id
                ), '[]'::jsonb)
              ) order by s.sort_order, s.name
            )
            from public.change_order_sections s where s.change_order_id = co.id
          ), '[]'::jsonb)
        ) order by co.created_at desc
      )
      from public.change_orders co
      where co.project_id = p.id and co.status <> 'draft'
    ), '[]'::jsonb) end,
    'money', case when p.status = 'estimating' then null else jsonb_build_object(
      'contract_value', public.project_contract_value(p.id),
      'received', coalesce((select sum(pay.amount) from public.payments pay where pay.project_id = p.id and pay.status = 'active'), 0),
      'receipts', coalesce((
        select jsonb_agg(jsonb_build_object('number', pay.receipt_number, 'amount', pay.amount, 'paid_on', pay.paid_on,
                                            'token', pay.share_token) order by pay.paid_on desc, pay.created_at desc)
          from public.payments pay where pay.project_id = p.id and pay.status = 'active'), '[]'::jsonb)
    ) end,
    'invoices', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', inv.id, 'invoice_number', inv.invoice_number, 'amount', inv.amount,
          'status', inv.status, 'due_date', inv.due_date, 'paid_at', inv.paid_at, 'amount_paid', inv.amount_paid,
          'created_at', inv.created_at
        ) order by inv.created_at desc
      )
      from public.invoices inv
      where inv.project_id = p.id and inv.status in ('sent', 'paid', 'overdue')
    ), '[]'::jsonb) end,
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
  left join public.business_profile bp on bp.user_id = p.user_id
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

-- Before / after: every invoice's status, paid date, amount paid, and total collected.
select b.invoice_number,
       b.status as status_before, i.status as status_after,
       b.paid_at = i.paid_at or (b.paid_at is null and i.paid_at is null) as paid_at_unchanged,
       b.collected as paid_before, i.amount_paid as paid_after,
       b.amount - b.collected as balance_before, i.amount - i.amount_paid as balance_after
from _pay_before b join public.invoices i on i.id = b.id
union all
select 'TOTAL collected', null, null, null,
       (select sum(collected) from _pay_before),
       (select coalesce(sum(amount), 0) from public.payments where status = 'active'),
       null, null
order by 1;
