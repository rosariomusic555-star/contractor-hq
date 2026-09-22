-- ContractorHQ — cleanup for jobs that reached an active status without
-- ever running through apply_opportunity_won (0075): a standalone project
-- (no linked opportunity) whose quote gets signed never drafts a deposit
-- invoice today, since apply_quote_signed only calls apply_opportunity_won
-- when there IS a linked opportunity. Same gap explains why some signed
-- quotes were never linked to a materials sheet — that link is otherwise
-- only ever made by hand (Link a quote / Link a materials sheet) once a
-- project has more than one sheet or quote (see materials-sheet-quote-
-- linking, 0042) — and why one project's schedule dates were saved with
-- no ordering guard at all.
--
-- 1) Link an unambiguous materials sheet to a signed quote that has none.
--    "Unambiguous" here means: only one sheet on the project actually has
--    line items (an empty leftover sheet doesn't count as a real second
--    option). Mirrors linkQuoteToMaterialSheet()'s own single-column write
--    (src/lib/api.ts), including its "steal" step.
do $$
declare
  r record;
begin
  for r in
    -- Inner joins down to materials_items mean only sheets that actually
    -- have line items contribute a row — an empty leftover sheet is never
    -- counted as a second option.
    select q.id as quote_id, (array_agg(distinct ms.id))[1] as only_sheet_id
      from public.quotes q
      join public.projects p on p.id = q.project_id
      join public.materials_sheets ms on ms.project_id = p.id
      join public.materials_sections sec on sec.sheet_id = ms.id
      join public.materials_items mi on mi.section_id = sec.id
     where q.status = 'approved'
       and q.material_sheet_id is null
     group by q.id
    having count(distinct ms.id) = 1
  loop
    update public.quotes set material_sheet_id = null
     where material_sheet_id = r.only_sheet_id and id <> r.quote_id;
    update public.quotes set material_sheet_id = r.only_sheet_id where id = r.quote_id;
  end loop;
end $$;

-- 2) Fix any existing schedule range with the end before the start —
--    clear the end date rather than guess which side was wrong.
update public.projects
   set scheduled_end_date = null
 where scheduled_start_date is not null
   and scheduled_end_date is not null
   and scheduled_end_date < scheduled_start_date;

-- 3) DB-level backstop so this can't happen again, from the UI or any
--    other write path (the primary guard is client-side, ProjectDetailView
--    — same "UI validation + DB backstop" split as lock-approved-quotes).
alter table public.projects
  add constraint projects_schedule_range_check
  check (scheduled_end_date is null or scheduled_start_date is null or scheduled_end_date >= scheduled_start_date);

-- 4) Backfill draft deposit invoices (drafts only, never sent) for every
--    project that's past Estimating with a signed quote but NO invoice of
--    any kind on file yet — same math and shape as apply_opportunity_won's
--    own insert (0075), just run once here for jobs that never passed
--    through it. Deliberately "no invoice at all", not "no invoice
--    literally labeled Deposit": some projects already carry a real
--    invoice created outside the Won automation (different notes text,
--    e.g. a bare deposit percentage) — those must never get a second one.
do $$
declare
  r record;
  v_contract_value numeric;
  v_deposit_amount numeric;
  v_invoice_count int;
  v_invoice_number text;
  v_user_id uuid;
begin
  for r in
    select p.id as project_id, p.user_id as project_user_id, q.id as quote_id, q.deposit_percentage
      from public.projects p
      join public.quotes q on q.project_id = p.id and q.status = 'approved'
     where p.status in ('scheduled', 'in_progress', 'complete')
       and not exists (
         select 1 from public.invoices i where i.project_id = p.id
       )
  loop
    v_contract_value := public.quote_committed_total(r.quote_id);
    v_deposit_amount := round(v_contract_value * coalesce(r.deposit_percentage, 0) / 100, 2);
    v_user_id := r.project_user_id;

    if v_deposit_amount > 0 then
      select count(*) into v_invoice_count from public.invoices where project_id = r.project_id;
      v_invoice_number := 'INV-' || lpad((v_invoice_count + 1)::text, 3, '0');

      insert into public.invoices (project_id, quote_id, user_id, amount, status, invoice_number, notes)
      values (r.project_id, r.quote_id, v_user_id, v_deposit_amount, 'draft', v_invoice_number, 'Deposit');
    end if;
  end loop;
end $$;
