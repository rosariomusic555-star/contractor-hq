-- ContractorHQ — Client Hub, Phase 2 (project overview, read-only). Run
-- AFTER 0063.
--
-- One new read RPC, get_portal_project(), is the entire data surface for
-- the hub's project overview screen — same "SECURITY DEFINER function is
-- the authorization boundary" reasoning as get_portal_context() (0063):
-- it derives the caller's identity from their own verified JWT email, not
-- from a client-supplied token, and returns null (not an error) for a
-- project that isn't actually reachable from that email, so an
-- unauthorized project id reveals nothing.
--
-- Two new things it needs to read that nothing else exposes to a client
-- session today: a per-photo visibility flag (client_visible, default
-- hidden — the contractor opts photos in), and the contractor's logo for
-- the hub's own branding.

alter table public.project_images
  add column if not exists client_visible boolean not null default false;

alter table public.business_profile
  add column if not exists logo_url text;

-- ---------------------------------------------------------------------------
-- Storage RLS — the portal's own session (a client, not the contractor) has
-- no RLS access to project_images/material_order_images/business_profile
-- today, so it has none to their Storage objects either. Three narrow
-- carve-outs, same per-prefix-policy shape as every other Storage RLS in
-- this app (0023 and onward):
-- ---------------------------------------------------------------------------

-- Client-visible project photos only, and only for the client's own
-- project (matched the same way get_portal_project() does: caller's JWT
-- email against the project's own client row).
create policy "portal client-visible project images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'projects'
    and exists (
      select 1
      from public.project_images pi
      join public.projects p on p.id = pi.project_id
      join public.clients c on c.id = p.client_id
      where pi.storage_path = storage.objects.name
        and pi.client_visible = true
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Delivery photos have no visibility flag — the spec is explicit that
-- these are always visible ("Delivery photos visible too"), unlike the
-- main project gallery.
create policy "portal delivery images select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'material-orders'
    and exists (
      select 1
      from public.material_order_images moi
      join public.material_orders mo on mo.id = moi.material_order_id
      join public.projects p on p.id = mo.project_id
      join public.clients c on c.id = p.client_id
      where moi.storage_path = storage.objects.name
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Business logos aren't sensitive — any authenticated session (contractor
-- or any client, of any contractor) can read one, same as a real website's
-- logo image would be. Path convention: business-logos/{user_id}/{uuid}.ext.
create policy "read business logos" on storage.objects
  for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(storage.objects.name))[1] = 'business-logos');

create policy "own business logo insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'business-logos'
    and (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

create policy "own business logo update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'business-logos'
    and (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

create policy "own business logo delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(storage.objects.name))[1] = 'business-logos'
    and (storage.foldername(storage.objects.name))[2] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- get_portal_project() — header/schedule, the approved-or-pending quote(s)
-- (client-safe fields only — never cost/margin, none of which even exist
-- on quote_items), change orders, non-draft invoices, client-visible
-- photos, deliveries with their (always-visible) photos, and a client-safe
-- slice of the activity feed.
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
      where q.project_id = p.id and q.status in ('sent', 'approved')
    ), '[]'::jsonb),
    'change_orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', co.id, 'title', co.title, 'description', co.description,
          'reason', co.reason, 'amount', co.amount, 'status', co.status,
          'approved_at', co.approved_at, 'created_at', co.created_at
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
          'change_order_rejected'
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
