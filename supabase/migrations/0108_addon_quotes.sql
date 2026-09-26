-- =============================================================================
-- 0108 — Add-on quotes for entirely new features (Phase D)
--
-- On a Won / in-progress project, "Add new work" creates new features with
-- status 'proposed' (source_quote_id = the add-on quote) and an add-on quote
-- for just those features. Their Cost plan sections show in the one plan,
-- marked proposed, and never count toward totals, tracking or profit.
--
-- Approval (share link, Client Hub — anything that sets status 'approved'):
-- the features become active, their lines start tracking, the add-on's price
-- joins the contract (app-side projectContractValue) and a deposit invoice is
-- drafted at the add-on's deposit %. Declined: the features become removed —
-- hidden, kept in history, never deleted.
--
-- Signing an add-on must NOT do what signing the original quote does (mark
-- every other quote "not selected", run the Won transaction), so
-- apply_quote_signed / mark_opportunity_won now leave add-ons out.
-- =============================================================================

alter table public.quotes
  add column if not exists kind text not null default 'original' check (kind in ('original', 'addon'));

-- Signing: an add-on is handled by its own trigger below; an original quote
-- marks only the other ORIGINAL quotes "not selected".
create or replace function public.apply_quote_signed(p_quote_id uuid)
returns void
language plpgsql
as $$
declare
  v_project_id uuid;
  v_kind text;
  v_opportunity_id uuid;
begin
  select q.project_id, q.kind into v_project_id, v_kind from public.quotes q where q.id = p_quote_id;
  if v_project_id is null or v_kind = 'addon' then
    return;
  end if;

  update public.quotes
     set status = 'not_selected'
   where project_id = v_project_id
     and id <> p_quote_id
     and kind = 'original'
     and status in ('draft', 'sent', 'approved');

  select o.id into v_opportunity_id from public.opportunities o where o.project_id = v_project_id;
  if v_opportunity_id is not null then
    perform public.apply_opportunity_won(v_opportunity_id, p_quote_id);
  end if;
end;
$$;

create or replace function public.mark_opportunity_won(p_opportunity_id uuid)
returns void
language plpgsql
as $$
declare
  v_project_id      uuid;
  v_signed_quote_id uuid;
begin
  select project_id into v_project_id from public.opportunities where id = p_opportunity_id;

  if v_project_id is not null then
    select id into v_signed_quote_id
      from public.quotes
     where project_id = v_project_id and status = 'approved' and kind = 'original'
     order by signed_at desc nulls last, updated_at desc
     limit 1;

    if v_signed_quote_id is not null then
      update public.quotes
         set status = 'not_selected'
       where project_id = v_project_id
         and id <> v_signed_quote_id
         and kind = 'original'
         and status in ('draft', 'sent', 'approved');
    end if;
  end if;

  perform public.apply_opportunity_won(p_opportunity_id, v_signed_quote_id);
end;
$$;

grant execute on function public.mark_opportunity_won(uuid) to authenticated;

-- Baselines only ever cover lines that count: never a proposed add-on's or a
-- removed feature's section.
create or replace function public.snapshot_sheet_baselines(p_sheet_id uuid, p_reason text default null)
returns void
language plpgsql
as $$
begin
  insert into public.materials_item_baselines (materials_item_id, quantity, unit_cost, unit, reason)
  select mi.id, mi.quantity, mi.unit_cost, mi.unit, p_reason
  from public.materials_items mi
  join public.materials_sections ms on ms.id = mi.section_id
  left join public.project_features f on f.id = ms.feature_id
  where ms.sheet_id = p_sheet_id
    and mi.cost_type = 'material'
    and (f.id is null or f.status = 'active')
    and (
      p_reason is not null
      or not exists (select 1 from public.materials_item_baselines b where b.materials_item_id = mi.id)
    );
end;
$$;

-- "Add-on quote #n" — 1-based, in creation order within the project.
create or replace function public.addon_quote_number(p_quote_id uuid)
returns int language sql stable as $$
  select count(*)::int
  from public.quotes a
  join public.quotes b on b.project_id = a.project_id and b.kind = 'addon' and b.created_at <= a.created_at
  where a.id = p_quote_id
$$;

create or replace function public.addon_quote_status_applies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label   text;
  v_feature record;
  v_sheet   uuid;
  v_user_id uuid;
  v_total   numeric;
  v_deposit numeric;
  v_count   int;
begin
  if new.kind <> 'addon' or new.project_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  v_label := 'Add-on quote #' || public.addon_quote_number(new.id);
  select user_id into v_user_id from public.projects where id = new.project_id;

  if new.status = 'approved' then
    for v_feature in
      select * from public.project_features where source_quote_id = new.id and status = 'proposed'
    loop
      update public.project_features set status = 'active' where id = v_feature.id;
      insert into public.feature_history (feature_id, project_id, quote_id, event, label, cost_before, cost_after, price_before, price_after)
      values (v_feature.id, new.project_id, new.id, 'addon_approved', v_label,
              0, public.feature_planned_cost(v_feature.id), 0, public.feature_price(v_feature.id));
    end loop;

    -- its lines start tracking (the job is already under way)
    select id into v_sheet from public.materials_sheets where project_id = new.project_id limit 1;
    if v_sheet is not null then
      perform public.snapshot_sheet_baselines(v_sheet);
    end if;

    -- deposit invoice, same as the Won transaction does for the original
    v_total := public.quote_committed_total(new.id);
    v_deposit := round(v_total * coalesce(new.deposit_percentage, 0) / 100, 2);
    if v_deposit > 0 then
      select count(*) into v_count from public.invoices where project_id = new.project_id;
      insert into public.invoices (project_id, quote_id, user_id, amount, status, invoice_number, notes)
      values (new.project_id, new.id, v_user_id, v_deposit, 'draft',
              'INV-' || lpad((v_count + 1)::text, 3, '0'), 'Deposit — ' || v_label);
    end if;

    insert into public.project_events (project_id, user_id, kind, summary)
    values (new.project_id, v_user_id, 'status_changed', v_label || ' approved — new features added to the job');

  elsif new.status in ('declined', 'not_selected') then
    for v_feature in
      select * from public.project_features where source_quote_id = new.id and status = 'proposed'
    loop
      update public.project_features set status = 'removed' where id = v_feature.id;
      insert into public.feature_history (feature_id, project_id, quote_id, event, label, cost_before, cost_after, price_before, price_after)
      values (v_feature.id, new.project_id, new.id, 'addon_declined', v_label,
              public.feature_planned_cost(v_feature.id), public.feature_planned_cost(v_feature.id), 0, 0);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_addon_status on public.quotes;
create trigger quotes_addon_status
  after update of status on public.quotes
  for each row execute function public.addon_quote_status_applies();

-- ---------------------------------------------------------------------------
-- Client Hub: quotes say whether they're an add-on (and which); change
-- orders carry their number and each section's scope change. Same function
-- as 0076 otherwise — plus restoring what 0069 had and 0076 dropped: change
-- order sections/items and schedule impact, and never showing a draft
-- change order to the client.
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
