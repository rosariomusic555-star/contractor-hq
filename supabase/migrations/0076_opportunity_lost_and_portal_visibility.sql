-- ContractorHQ — Opportunity/Project restructure, part 4: Lost sync +
-- Client Hub visibility for an Estimating project. Run AFTER 0075.
--
-- Lost uses a plain AFTER UPDATE trigger (safe here — it only ever writes
-- to `projects`, never back to `opportunities`, so there's no risk of the
-- recursive re-entry a stage->won trigger would have against
-- apply_opportunity_won's own `update opportunities set stage = 'won'`.
-- Won deliberately stays three explicit call sites (sign_quote,
-- portal_approve_quote, and the client's mark_opportunity_won RPC call)
-- rather than a trigger, for exactly that reason.

create or replace function public.sync_project_on_opportunity_lost()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is not null and new.stage is distinct from old.stage then
    if new.stage = 'lost' then
      update public.projects set status = 'lost' where id = new.project_id;
    elsif old.stage = 'lost' then
      update public.projects set status = 'estimating' where id = new.project_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger opportunity_lost_project_sync
  after update on public.opportunities
  for each row execute function public.sync_project_on_opportunity_lost();

-- ---------------------------------------------------------------------------
-- get_portal_project — re-issued to gate an Estimating project down to just
-- what's needed to review and approve its pending quote: no schedule
-- section worth showing (nothing's scheduled yet), no deliveries, no
-- invoices (the deposit invoice is a draft — never client-visible until
-- sent, which only happens after Won anyway). Everything else about the
-- function (0065) is unchanged — scheduled/in_progress/complete projects
-- see exactly what they always have.
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
          'approved_at', co.approved_at, 'approved_by', co.approved_by,
          'declined_at', co.declined_at, 'decline_comment', co.decline_comment,
          'created_at', co.created_at
        ) order by co.created_at desc
      )
      from public.change_orders co where co.project_id = p.id
    ), '[]'::jsonb) end,
    'invoices', case when p.status = 'estimating' then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', inv.id, 'invoice_number', inv.invoice_number, 'amount', inv.amount,
          'status', inv.status, 'due_date', inv.due_date, 'paid_at', inv.paid_at,
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

-- get_portal_context() (0063) — no query change needed (it already just
-- passes `status` through with no filtering), but a Lost project should
-- never appear in the client's own project picker either.
create or replace function public.get_portal_context()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'client_id', c.id,
      'client_name', c.name,
      'business_name', bp.company_name,
      'projects', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status)
          order by p.created_at desc
        )
        from public.projects p
        where p.client_id = c.id and p.status <> 'lost'
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from public.clients c
  left join public.business_profile bp on bp.user_id = c.user_id
  where c.email is not null
    and c.email <> ''
    and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function public.get_portal_context() to authenticated;
