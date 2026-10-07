-- 0166 — Standalone quote → project.
--
-- A standalone quote (quotes.project_id is null) that gets approved was a
-- dead end: invoices, change orders, payments and scheduling all need a
-- project. convert_standalone_quote() is the one way a standalone quote
-- joins a project — a new one the app has just created, or an existing one
-- of the client's — used by the "Create project" modal everywhere it opens
-- (right after Mark approved, the approved-quote banner, Needs you, the
-- client-signed notification, and the older "Create project" nudge).
--
-- It:
--   1. moves the quote into the project (its approval, signature, version
--      history, selections and share link are all keyed by the quote id,
--      so they carry over untouched);
--   2. optionally links the client's open opportunity to the project (so
--      the lead isn't left behind as a duplicate);
--   3. gives the project a feature per quote section — the section's own
--      project type, else the contractor's type whose name the section
--      name contains — and points each section at it; the Cost plan then
--      gets those features' sections as usual (ensureFeatureSections, app);
--   4. for an APPROVED quote, the Won step: through the opportunity when
--      the project has one (apply_quote_signed → apply_opportunity_won,
--      unchanged), else the same effects directly — project Scheduled,
--      other original quotes not selected, one deposit invoice drafted
--      (same rule as 0147);
--   5. logs the conversion on the project timeline.
--
-- Owner only (employees never). A declined / not-selected quote can't be
-- converted.
--
-- Also: the "<client> signed your quote" notification for a standalone
-- quote now links to /quotes/<id>?convert=1, which opens the modal.

create or replace function public.convert_standalone_quote(
  p_quote_id       uuid,
  p_project_id     uuid,
  p_opportunity_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q            record;
  v_opp        record;
  v_sec        record;
  v_cat        uuid;
  v_feature    uuid;
  v_label      text;
  v_total      numeric;
  v_amount     numeric;
  v_dep_id     uuid;
  v_dep_status text;
  v_note       text := 'no deposit set';
  v_won        boolean;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or q.user_id <> auth.uid() or public.is_employee() then
    raise exception 'Only the account owner can create a project from this quote';
  end if;
  if q.project_id is not null then
    raise exception 'This quote is already in a project';
  end if;
  if q.status in ('declined', 'not_selected') then
    raise exception 'A declined quote can''t be turned into a project';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id and user_id = auth.uid()) then
    raise exception 'Project not found';
  end if;

  -- 2. the client's open opportunity, if the contractor chose to link it
  if p_opportunity_id is not null then
    select o.* into v_opp
      from public.opportunities o
      join public.clients c on c.id = o.client_id
     where o.id = p_opportunity_id and c.user_id = auth.uid()
     for update of o;
    if not found then
      raise exception 'Opportunity not found';
    end if;
    if v_opp.stage in ('won', 'lost') or v_opp.archived_at is not null then
      raise exception 'That opportunity is already closed';
    end if;
    if v_opp.project_id is null then
      update public.opportunities set project_id = p_project_id where id = p_opportunity_id;
    elsif v_opp.project_id <> p_project_id then
      raise exception 'That opportunity already has its own project';
    end if;
  end if;

  -- 1. move the quote (triggers link it to the project's Cost plan, as for
  -- any project quote)
  update public.quotes set project_id = p_project_id where id = p_quote_id;

  -- 3. a feature per section
  for v_sec in
    select s.id, s.name, s.job_category_id
      from public.quote_sections s
     where s.quote_id = p_quote_id
     order by s.sort_order, s.id
  loop
    v_cat := coalesce(
      (select c.id from public.categories c where c.id = v_sec.job_category_id and c.user_id = q.user_id),
      (select c.id from public.categories c
        where c.user_id = q.user_id
          and length(trim(c.name)) > 0
          and lower(coalesce(v_sec.name, '')) like '%' || lower(trim(c.name)) || '%'
        order by length(trim(c.name)) desc
        limit 1)
    );
    v_feature := null;
    if v_cat is not null then
      -- the project's type list (its trigger adds a feature if it has none)
      insert into public.project_categories (project_id, category_id)
      values (p_project_id, v_cat)
      on conflict do nothing;
      -- an active feature of this type no other section of the quote has taken
      select f.id into v_feature
        from public.project_features f
       where f.project_id = p_project_id and f.category_id = v_cat and f.status = 'active'
         and not exists (select 1 from public.quote_sections s2 where s2.quote_id = p_quote_id and s2.feature_id = f.id)
       order by f.sort_order, f.created_at
       limit 1;
    end if;
    if v_feature is null then
      -- a second feature of the same type, or a section with no type: its
      -- name becomes the feature's label (unless it's just the type's name)
      v_label := nullif(trim(coalesce(v_sec.name, '')), '');
      if v_cat is not null and lower(v_label) = (select lower(trim(name)) from public.categories where id = v_cat) then
        v_label := null;
      end if;
      insert into public.project_features (project_id, category_id, label, status, sort_order)
      values (p_project_id, v_cat, v_label, 'active',
              (select coalesce(max(sort_order), -1) + 1 from public.project_features where project_id = p_project_id))
      returning id into v_feature;
    end if;
    -- (0105 lets job_category_id / feature_id change on an approved quote)
    update public.quote_sections
       set feature_id = v_feature,
           job_category_id = coalesce(job_category_id, v_cat)
     where id = v_sec.id;
  end loop;

  -- 4. Won
  v_won := q.status = 'approved' and coalesce(q.kind, 'original') = 'original';
  if v_won then
    if exists (select 1 from public.opportunities o where o.project_id = p_project_id) then
      perform public.apply_quote_signed(p_quote_id);
    else
      update public.quotes
         set status = 'not_selected'
       where project_id = p_project_id and id <> p_quote_id and kind = 'original'
         and status in ('draft', 'sent', 'approved');

      update public.projects set status = 'scheduled' where id = p_project_id and status = 'estimating';

      -- one deposit per job — same rule as apply_opportunity_won (0147)
      v_total := public.quote_committed_total(p_quote_id);
      v_amount := round(v_total * coalesce(q.deposit_percentage, 0) / 100, 2);
      select i.id, i.status into v_dep_id, v_dep_status
        from public.invoices i
       where i.project_id = p_project_id and i.notes = 'Deposit'
       order by i.created_at
       limit 1;
      if v_dep_id is not null then
        if v_dep_status = 'draft' and v_amount > 0 then
          update public.invoices set amount = v_amount, quote_id = p_quote_id where id = v_dep_id;
          v_note := 'deposit invoice updated';
        else
          v_note := 'deposit already invoiced';
        end if;
      elsif v_amount > 0 then
        insert into public.invoices (project_id, quote_id, user_id, amount, status, invoice_number, notes)
        values (p_project_id, p_quote_id, q.user_id, v_amount, 'draft', public.next_invoice_number(p_project_id), 'Deposit');
        v_note := 'deposit invoice drafted';
      end if;

      insert into public.project_events (project_id, user_id, kind, summary)
      values (p_project_id, q.user_id, 'status_changed', 'Won — project scheduled, ' || v_note);
    end if;
  end if;

  -- 5. the timeline
  insert into public.project_events (project_id, user_id, kind, summary, meta)
  values (
    p_project_id, q.user_id, 'quote_converted',
    case when q.status = 'approved' then 'Approved standalone quote moved into this project'
         else 'Standalone quote moved into this project' end,
    jsonb_build_object('quote_id', p_quote_id)
  );

  select i.id into v_dep_id
    from public.invoices i
   where i.project_id = p_project_id and i.notes = 'Deposit' and i.status = 'draft'
   order by i.created_at
   limit 1;

  return jsonb_build_object('project_id', p_project_id, 'won', v_won, 'deposit_invoice_id', v_dep_id);
end;
$$;

revoke all on function public.convert_standalone_quote(uuid, uuid, uuid) from public, anon;
grant execute on function public.convert_standalone_quote(uuid, uuid, uuid) to authenticated;

-- The client-signed notification of a standalone quote opens the modal.
create or replace function public._notify(p_user uuid, p_kind text, p_setting text, p_title text, p_body text, p_quote uuid, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_on boolean := true;
begin
  if p_setting is not null then
    execute format('select %I from public.notification_settings where user_id = $1', p_setting) into v_on using p_user;
    v_on := coalesce(v_on, true);
  end if;
  if not v_on then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, quote_id, dedupe_key)
  values (p_user, p_kind, p_title, p_body,
          (select case when q.project_id is not null then '/projects/' || q.project_id || '/quotes/' || q.id
                       when p_kind = 'quote_approved' then '/quotes/' || q.id || '?convert=1'
                       else '/quotes/' || q.id end
             from public.quotes q where q.id = p_quote),
          p_quote, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- Check: the function exists.
select exists (select 1 from pg_proc where proname = 'convert_standalone_quote') as convert_fn;
