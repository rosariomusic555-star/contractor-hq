-- ContractorHQ — Opportunity/Project restructure, part 3: the Won
-- transaction. Run AFTER 0074.
--
-- One transaction, three entry points (public quote link, Client Hub
-- portal, manual pipeline drag) — all funnel into the same
-- apply_opportunity_won(), so there is exactly one place "what happens on
-- Won" is defined. Every statement below runs inside the single calling
-- function's transaction, so a failure anywhere rolls the whole thing
-- back automatically — there's no separate commit to half-apply.

-- Mirrors quoteTotal()/quoteItemIncluded() in src/lib/api.ts exactly —
-- required items, plus whatever optional items the client actually
-- selected. Keep in sync by hand if the TS definition ever changes (same
-- convention the assistant-chat edge function's format.ts mirror uses).
create or replace function public.quote_committed_total(p_quote_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case when (not s.is_optional and not i.is_optional) or i.client_selected
      then i.price * i.quantity
      else 0
    end
  ), 0)
  from public.quote_sections s
  join public.quote_items i on i.section_id = s.id
  where s.quote_id = p_quote_id;
$$;

-- Project-level: signing ANY quote marks every other quote option on the
-- SAME project "not selected" — this applies whether or not the project
-- has a linked opportunity at all (a direct/walk-in project with two quote
-- options behaves identically). Then, only if there IS a linked
-- opportunity, runs the full Won transaction on it.
create or replace function public.apply_quote_signed(p_quote_id uuid)
returns void
language plpgsql
as $$
declare
  v_project_id uuid;
  v_opportunity_id uuid;
begin
  select q.project_id into v_project_id from public.quotes q where q.id = p_quote_id;
  if v_project_id is null then
    return;
  end if;

  update public.quotes
     set status = 'not_selected'
   where project_id = v_project_id
     and id <> p_quote_id
     and status in ('draft', 'sent', 'approved');

  select o.id into v_opportunity_id from public.opportunities o where o.project_id = v_project_id;
  if v_opportunity_id is not null then
    perform public.apply_opportunity_won(v_opportunity_id, p_quote_id);
  end if;
end;
$$;

-- The Won transaction itself. p_signed_quote_id is null for a manual Won
-- with no quote on file (see mark_opportunity_won below) — every step
-- that depends on a quote existing is skipped in that case, not guessed.
--
-- Not SECURITY DEFINER: when called from within sign_quote/
-- portal_approve_quote (both SECURITY DEFINER), it transitively runs with
-- their already-verified elevated rights for the duration of that call.
-- When called directly (mark_opportunity_won, the manual path), it runs
-- under the calling contractor's own session — who already has full RLS
-- access to their own rows, so no elevation is needed there either.
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

      insert into public.invoices (project_id, quote_id, amount, status, invoice_number, notes)
      values (v_project_id, p_signed_quote_id, v_deposit_amount, 'draft', v_invoice_number, 'Deposit');
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

-- The manual pipeline-drag entry point — the only one exposed directly to
-- the contractor's own session (the other two fire from inside
-- sign_quote/portal_approve_quote, never called directly by a client).
-- Finds "the" signed quote on the opportunity's project, if any, applies
-- the same sibling-marking apply_quote_signed would, then runs the shared
-- transaction. No project, no quote, or a quote nobody ever signed all
-- degrade gracefully — see apply_opportunity_won's own null-handling.
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
     where project_id = v_project_id and status = 'approved'
     order by signed_at desc nulls last, updated_at desc
     limit 1;

    if v_signed_quote_id is not null then
      update public.quotes
         set status = 'not_selected'
       where project_id = v_project_id
         and id <> v_signed_quote_id
         and status in ('draft', 'sent', 'approved');
    end if;
  end if;

  perform public.apply_opportunity_won(p_opportunity_id, v_signed_quote_id);
end;
$$;

grant execute on function public.mark_opportunity_won(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sign_quote / portal_approve_quote — re-issued to call apply_quote_signed()
-- instead of the old direct "just flip the opportunity's stage" logic
-- (0072). Everything about their own authorization/signing logic is
-- unchanged; only what happens after the signature is captured is new.
-- ---------------------------------------------------------------------------

create or replace function public.sign_quote(p_token uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id   uuid;
  v_project_id uuid;
  v_user_id    uuid;
  v_signed_by  text;
begin
  if p_token is null then
    return;
  end if;

  update public.quotes
     set signed_at = now(),
         status = 'approved',
         signed_by = nullif(trim(p_signed_by), '')
   where share_token = p_token
     and signed_at is null
  returning id, project_id, user_id, signed_by
      into v_quote_id, v_project_id, v_user_id, v_signed_by;

  if v_project_id is not null then
    update public.projects set status = 'scheduled' where id = v_project_id and status = 'estimating';

    insert into public.project_events (project_id, user_id, kind, summary, meta)
    values (
      v_project_id,
      v_user_id,
      'quote_signed',
      'Quote approved' || coalesce(' by ' || v_signed_by, ''),
      '{}'::jsonb
    );
  end if;

  if v_quote_id is not null then
    perform public.apply_quote_signed(v_quote_id);
  end if;
end $$;

revoke execute on function public.sign_quote(uuid, text) from public;
grant execute on function public.sign_quote(uuid, text) to anon, authenticated;

create or replace function public.portal_approve_quote(p_quote_id uuid, p_signed_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_quote_id   uuid;
  v_user_id    uuid;
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
   returning q.project_id, q.id, q.user_id into v_project_id, v_quote_id, v_user_id;

  if v_project_id is not null then
    update public.projects set status = 'scheduled' where id = v_project_id and status = 'estimating';
    insert into public.project_events (project_id, user_id, kind, summary)
    select v_project_id, p.user_id, 'quote_signed',
           'Quote approved' || case
             when nullif(trim(p_signed_by), '') is not null then ' by ' || trim(p_signed_by)
             else ''
           end
    from public.projects p where p.id = v_project_id;
  end if;

  if v_quote_id is not null then
    perform public.apply_quote_signed(v_quote_id);
  end if;
end;
$$;

grant execute on function public.portal_approve_quote(uuid, text) to authenticated;
