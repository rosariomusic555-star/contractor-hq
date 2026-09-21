-- ContractorHQ — Change Order Builder: change orders grow sections/items,
-- exactly like a quote, instead of a single free-text amount. Run AFTER
-- 0068.
--
-- ---------------------------------------------------------------------------
-- 1. change_orders gains a real draft->sent->approved/declined lifecycle
--    (previously just pending/approved/rejected, with no "not sent yet"
--    concept at all) plus the same public share-token signature mechanism
--    quotes already have.
-- ---------------------------------------------------------------------------

alter table public.change_orders drop constraint if exists change_orders_status_check;

-- Backfill first, THEN tighten the constraint, so existing rows are never
-- briefly invalid. 'pending' (visible/actionable in the old flat-form UI)
-- maps to 'sent' (the closest analog: not a local draft, already active);
-- 'rejected' maps to the new 'declined' label.
update public.change_orders set status = 'sent' where status = 'pending';
update public.change_orders set status = 'declined' where status = 'rejected';

alter table public.change_orders
  add constraint change_orders_status_check
  check (status in ('draft', 'sent', 'approved', 'declined'));

alter table public.change_orders alter column status set default 'draft';

alter table public.change_orders
  add column if not exists share_token uuid unique,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by text,
  -- Signed: positive adds working days to the schedule, negative saves
  -- them, null/0 = "No schedule change". Only an APPROVED change order's
  -- value ever actually applies to a project's estimated_duration_days —
  -- see the Estimated Duration card's own read of this, wired from the
  -- app layer (src/lib/changeOrderImpact.ts), not a DB trigger.
  add column if not exists schedule_impact_days integer;

-- ---------------------------------------------------------------------------
-- 2. Sections + items — same shape as quote_sections/quote_items, minus
--    is_optional (a change order has no "menu the client picks from"
--    concept; every line item unconditionally counts). `price` is signed:
--    a negative line is a credit/removal. `amount` on the parent
--    change_orders row stays the persisted, canonical total (same
--    "stored, app keeps it in sync" convention invoices.amount already
--    uses) — every existing reader (approvedChangeOrderTotal,
--    projectContractValue, the Dashboard, Revenue) keeps working
--    unchanged; the builder's save just always recomputes and writes it
--    from the items below, the same way it always wrote a single amount,
--    just now derived instead of typed in.
-- ---------------------------------------------------------------------------

create table public.change_order_sections (
  id              uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders (id) on delete cascade,
  name            text not null,
  sort_order      int not null default 0
);

create table public.change_order_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.change_order_sections (id) on delete cascade,
  name        text not null,
  description text,
  price       numeric not null default 0,
  quantity    numeric not null default 1,
  unit        text,
  category_id uuid references public.categories (id) on delete set null,
  sort_order  int not null default 0
);

create table public.change_order_item_images (
  id                    uuid primary key default gen_random_uuid(),
  change_order_item_id  uuid not null references public.change_order_items (id) on delete cascade,
  storage_path          text not null,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now()
);

create index on public.change_order_sections (change_order_id);
create index on public.change_order_items (section_id);
create index on public.change_order_item_images (change_order_item_id);

alter table public.change_order_sections enable row level security;
alter table public.change_order_items enable row level security;
alter table public.change_order_item_images enable row level security;

create policy "own" on public.change_order_sections for all to authenticated
  using      (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()))
  with check (exists (select 1 from public.change_orders co where co.id = change_order_id and co.user_id = auth.uid()));

create policy "own" on public.change_order_items for all to authenticated
  using      (exists (select 1 from public.change_order_sections s
                        join public.change_orders co on co.id = s.change_order_id
                       where s.id = section_id and co.user_id = auth.uid()))
  with check (exists (select 1 from public.change_order_sections s
                        join public.change_orders co on co.id = s.change_order_id
                       where s.id = section_id and co.user_id = auth.uid()));

create policy "own" on public.change_order_item_images for all to authenticated
  using      (exists (select 1 from public.change_order_items i
                        join public.change_order_sections s on s.id = i.section_id
                        join public.change_orders co on co.id = s.change_order_id
                       where i.id = change_order_item_id and co.user_id = auth.uid()))
  with check (exists (select 1 from public.change_order_items i
                        join public.change_order_sections s on s.id = i.section_id
                        join public.change_orders co on co.id = s.change_order_id
                       where i.id = change_order_item_id and co.user_id = auth.uid()));

revoke all on public.change_order_sections from anon;
revoke all on public.change_order_items from anon;
revoke all on public.change_order_item_images from anon;

-- ---------------------------------------------------------------------------
-- 3. Storage — change-order-items/{item_id}/... , same owner + "public
--    while shared" shape as quote-items/ (0023).
-- ---------------------------------------------------------------------------

create policy "own change-order-item images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-order-items'
    and exists (
      select 1 from public.change_order_items i
      join public.change_order_sections s on s.id = i.section_id
      join public.change_orders co on co.id = s.change_order_id
      where i.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "own change-order-item images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-order-items'
    and exists (
      select 1 from public.change_order_items i
      join public.change_order_sections s on s.id = i.section_id
      join public.change_orders co on co.id = s.change_order_id
      where i.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "own change-order-item images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-order-items'
    and exists (
      select 1 from public.change_order_items i
      join public.change_order_sections s on s.id = i.section_id
      join public.change_orders co on co.id = s.change_order_id
      where i.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "own change-order-item images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-order-items'
    and exists (
      select 1 from public.change_order_items i
      join public.change_order_sections s on s.id = i.section_id
      join public.change_orders co on co.id = s.change_order_id
      where i.id::text = (storage.foldername(storage.objects.name))[2]
        and co.user_id = auth.uid()
    )
  );

create policy "shared change-order-item images select" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'change-order-items'
    and exists (
      select 1 from public.change_order_items i
      join public.change_order_sections s on s.id = i.section_id
      join public.change_orders co on co.id = s.change_order_id
      where i.id::text = (storage.foldername(storage.objects.name))[2]
        and co.share_token is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Public share-token flow — get_shared_change_order / sign_change_order
--    / decline_shared_change_order, exactly mirroring get_shared_quote /
--    sign_quote (0004/0007/0013/0026).
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_change_order(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'change_order', to_jsonb(co) - 'user_id' - 'share_token',
    'project',  case when p.id is null then null else jsonb_build_object('name', p.name) end,
    'client',   case when c.id is null then null else jsonb_build_object('name', c.name) end,
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'sort_order', s.sort_order,
          'items', coalesce((
            select jsonb_agg(
              to_jsonb(i) || jsonb_build_object(
                'images', coalesce((
                  select jsonb_agg(
                    jsonb_build_object('id', img.id, 'storage_path', img.storage_path)
                    order by img.sort_order
                  )
                  from public.change_order_item_images img
                  where img.change_order_item_id = i.id
                ), '[]'::jsonb)
              )
              order by i.sort_order, i.name
            )
            from public.change_order_items i
            where i.section_id = s.id
          ), '[]'::jsonb)
        )
        order by s.sort_order, s.name
      )
      from public.change_order_sections s
      where s.change_order_id = co.id
    ), '[]'::jsonb)
  )
  from public.change_orders co
  join public.projects p on p.id = co.project_id
  left join public.clients c on c.id = p.client_id
  where p_token is not null
    and co.share_token = p_token;
$$;

revoke execute on function public.get_shared_change_order(uuid) from public;
grant execute on function public.get_shared_change_order(uuid) to anon, authenticated;

create or replace function public.sign_change_order(p_token uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_user_id    uuid;
  v_signed_by  text;
begin
  if p_token is null then
    return;
  end if;

  update public.change_orders
     set signed_at = now(),
         status = 'approved',
         approved_at = now(),
         signed_by = nullif(trim(p_signed_by), ''),
         approved_by = nullif(trim(p_signed_by), '')
   where share_token = p_token
     and status = 'sent'
  returning project_id, user_id, signed_by
      into v_project_id, v_user_id, v_signed_by;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (
      v_project_id,
      v_user_id,
      'change_order_approved',
      'Change order approved' || coalesce(' by ' || v_signed_by, ''),
      '{}'::jsonb
    );
  end if;
end $$;

revoke execute on function public.sign_change_order(uuid, text) from public;
grant execute on function public.sign_change_order(uuid, text) to anon, authenticated;

create or replace function public.decline_shared_change_order(p_token uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_user_id    uuid;
begin
  if p_token is null then
    return;
  end if;

  update public.change_orders
     set status = 'declined',
         declined_at = now(),
         decline_comment = nullif(trim(p_comment), '')
   where share_token = p_token
     and status = 'sent'
  returning project_id, user_id
      into v_project_id, v_user_id;

  if v_project_id is not null then
    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (v_project_id, v_user_id, 'change_order_rejected', 'Change order declined by client', '{}'::jsonb);
  end if;
end $$;

revoke execute on function public.decline_shared_change_order(uuid, text) from public;
grant execute on function public.decline_shared_change_order(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Client Hub portal — get_portal_project() re-issued to (a) hide 'draft'
--    change orders (never sent, shouldn't leak to the client — same rule
--    quotes already follow) and (b) include each change order's itemized
--    sections, so PortalDocumentView can show a real breakdown instead of
--    just the flat total. Full function body re-issued (`create or
--    replace` needs it whole); every OTHER field/behavior here is
--    unchanged from 0065.
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
          'schedule_impact_days', co.schedule_impact_days,
          'approved_at', co.approved_at, 'approved_by', co.approved_by,
          'declined_at', co.declined_at, 'decline_comment', co.decline_comment,
          'created_at', co.created_at,
          'sections', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', s.id, 'name', s.name, 'sort_order', s.sort_order,
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
          'invoice_sent', 'invoice_paid', 'change_order_created', 'change_order_sent',
          'change_order_approved', 'change_order_rejected', 'project_started'
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

-- ---------------------------------------------------------------------------
-- 6. Invoicing an approved change order — invoices can now optionally link
--    to the change order they're billing (standalone "Create invoice" from
--    an approved CO, or rolled into the project's next invoice), same
--    nullable-FK shape as invoices.quote_id already uses.
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists change_order_id uuid references public.change_orders (id) on delete set null;

create index if not exists invoices_change_order_id_idx on public.invoices (change_order_id);
