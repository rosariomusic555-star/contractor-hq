-- 0118 — fix: a client signing a CRM-linked quote with a deposit failed.
--
-- apply_opportunity_won (0075) drafted the deposit invoice without an
-- explicit user_id, so it fell back to the column default auth.uid():
--   * share link (anon)  -> null -> "null value in column user_id" and the
--     whole signature rolled back;
--   * Client Hub login   -> the CLIENT's auth id, so the invoice was
--     invisible to the contractor under RLS.
-- Only the contractor's own manual Won (auth.uid() = owner) worked. The
-- invoice now belongs to the project's owner, like 0083 / 0108 already do.
-- Body otherwise identical to 0075.

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

    if v_deposit_amount > 0 then
      select count(*) into v_invoice_count from public.invoices where project_id = v_project_id;
      v_invoice_number := 'INV-' || lpad((v_invoice_count + 1)::text, 3, '0');

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
      then 'Won — project scheduled, deposit invoice drafted'
      else 'Won manually — no signed quote on file'
    end
  );
end;
$$;
