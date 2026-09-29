-- ContractorHQ — One deposit invoice per job. Run AFTER 0146.
--
-- Found 2026-09-29: editing an approved quote returns it to draft (0033);
-- when the client signs again, the Won transaction ran again and drafted a
-- SECOND deposit invoice (the first was already paid). Same for an add-on
-- quote approved twice. Now:
--   - no deposit invoice yet            → drafted, as before
--   - a draft deposit exists            → its amount follows the re-approved quote
--   - a sent / paid deposit exists      → nothing new; the event says so
-- Same functions as 0143 otherwise.

create or replace function public.apply_opportunity_won(
  p_opportunity_id uuid,
  p_signed_quote_id uuid
)
returns void
language plpgsql
as $$
declare
  v_project_id     uuid;
  v_client_id      uuid;
  v_prior_stage    text;
  v_user_id        uuid;
  v_contract_value numeric;
  v_deposit_pct    numeric;
  v_deposit_amount numeric;
  v_invoice_count  int;
  v_invoice_number text;
  v_dep_id         uuid;
  v_dep_status     text;
  v_dep_number     text;
  v_note           text := 'deposit invoice drafted';
begin
  select o.project_id, o.client_id, o.stage
    into v_project_id, v_client_id, v_prior_stage
    from public.opportunities o
   where o.id = p_opportunity_id
   for update;

  if not found then
    raise exception 'Opportunity % not found', p_opportunity_id;
  end if;

  -- Almost always already exists by the time a lead reaches Won (lazy
  -- creation from the first photo/sheet/quote) — this is just the safety
  -- net for the rare lead that skips straight to Won.
  if v_project_id is null then
    v_project_id := public.get_or_create_opportunity_project(p_opportunity_id);
  end if;

  select p.user_id into v_user_id from public.projects p where p.id = v_project_id;

  update public.projects
     set status = 'scheduled'
   where id = v_project_id
     and status = 'estimating';

  if p_signed_quote_id is not null then
    v_contract_value := public.quote_committed_total(p_signed_quote_id);
    select deposit_percentage into v_deposit_pct from public.quotes where id = p_signed_quote_id;
    v_deposit_amount := round(v_contract_value * coalesce(v_deposit_pct, 0) / 100, 2);

    -- 0147: one deposit per job. A quote approved again (edited after
    -- approval → back to draft → re-signed) used to draft a second one.
    select i.id, i.status, i.invoice_number into v_dep_id, v_dep_status, v_dep_number
      from public.invoices i
     where i.project_id = v_project_id and i.notes = 'Deposit'
     order by i.created_at
     limit 1;

    if v_dep_id is not null then
      if v_dep_status = 'draft' and v_deposit_amount > 0 then
        -- not sent yet: follow the re-approved total
        update public.invoices set amount = v_deposit_amount, quote_id = p_signed_quote_id where id = v_dep_id;
        v_note := 'deposit ' || coalesce(v_dep_number, 'invoice') || ' updated';
      else
        v_note := 'deposit already invoiced (' || coalesce(v_dep_number, 'invoice') || ')';
      end if;
    elsif v_deposit_amount > 0 then
      v_invoice_number := public.next_invoice_number(v_project_id);

      insert into public.invoices (project_id, quote_id, user_id, amount, status, invoice_number, notes)
      values (v_project_id, p_signed_quote_id, v_user_id, v_deposit_amount, 'draft', v_invoice_number, 'Deposit');
    end if;
  end if;

  if v_prior_stage is distinct from 'won' then
    update public.opportunities set stage = 'won' where id = p_opportunity_id;
    insert into public.activities (client_id, opportunity_id, created_by, kind, summary, meta)
    values (
      v_client_id, p_opportunity_id, v_user_id, 'stage_changed',
      'Stage changed: ' || initcap(replace(v_prior_stage, '_', ' ')) || ' → Won',
      '{}'::jsonb
    );
  end if;

  insert into public.project_events (project_id, user_id, kind, summary)
  values (
    v_project_id, v_user_id, 'status_changed',
    case when p_signed_quote_id is not null
      then case when v_prior_stage = 'won' then 'Quote approved again — ' || v_note
                else 'Won — project scheduled, ' || v_note end
      else 'Won manually — no signed quote on file'
    end
  );
end;
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
    -- 0147: re-approving an add-on keeps its one deposit (a draft follows the new total).
    if exists (select 1 from public.invoices where quote_id = new.id and notes = 'Deposit — ' || v_label) then
      update public.invoices set amount = v_deposit
       where quote_id = new.id and notes = 'Deposit — ' || v_label and status = 'draft' and v_deposit > 0;
    elsif v_deposit > 0 then
      insert into public.invoices (project_id, quote_id, user_id, amount, status, invoice_number, notes)
      values (new.project_id, new.id, v_user_id, v_deposit, 'draft',
              public.next_invoice_number(new.project_id), 'Deposit — ' || v_label);
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
