-- ContractorHQ — auto-link a quote to its project's materials sheet
-- whenever the pairing is unambiguous (at most one non-empty sheet, at
-- most one quote on the project), so the Material Tracker actually turns
-- on for the common case. Run AFTER 0086.
--
-- Root cause this fixes: quotes.material_sheet_id (0042) is the ONLY
-- signal trackedSheetIds() (src/lib/materialTracking.ts) uses to decide
-- whether a sheet tracks. It's written in exactly one place client-side —
-- linkQuoteToMaterialSheet() — which the UI only ever calls from the
-- explicit "Link a quote"/"Link a materials sheet" picker, and that picker
-- only renders once a project has MORE than one sheet or quote
-- (needsExplicitDocumentLink(), src/lib/documentLink.ts). Below that
-- threshold — the overwhelming majority of projects, one quote and one
-- sheet — nothing has ever written material_sheet_id at all. The Quote
-- builder's own "Estimated Cost" already papers over this with a
-- client-side fallback (QuoteWorkspace: falls back to materialsCogs(all
-- materials) when unambiguous, never touching the DB column), which is
-- exactly why the gap was invisible there but not in the Material Tracker,
-- which has no equivalent fallback and reads material_sheet_id directly.
--
-- The fix: mirror needsExplicitDocumentLink()'s own definition of
-- "unambiguous" in SQL, and auto-link the moment it becomes true — a
-- quote is approved with nothing else to choose from, or a project's
-- first (only) non-empty sheet appears after the quote is already signed.
-- Once a project has a second sheet or quote, this never fires again —
-- explicit linking takes over exactly as it already does today.

-- ---------------------------------------------------------------------------
-- 1. The shared linking function — same "unambiguous" definition as
--    needsExplicitDocumentLink(sheetsCount, quotesCount): sheetsCount <= 1
--    and quotesCount <= 1. "Non-empty sheet" mirrors 0083's own backfill
--    (an empty leftover sheet never counts as a real option). Never
--    overwrites an existing link — only fills in a null.
-- ---------------------------------------------------------------------------

create or replace function public.link_solo_materials_sheet(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_quote_id  uuid;
  v_sheet_id  uuid;
  v_quotes_count int;
  v_sheets_count int;
begin
  select count(*) into v_quotes_count from public.quotes where project_id = p_project_id;
  if v_quotes_count <> 1 then
    return;
  end if;

  select q.id into v_quote_id
    from public.quotes q
   where q.project_id = p_project_id
     and q.status = 'approved'
     and q.material_sheet_id is null;
  if v_quote_id is null then
    return;
  end if;

  select count(distinct ms.id) into v_sheets_count
    from public.materials_sheets ms
    join public.materials_sections sec on sec.sheet_id = ms.id
    join public.materials_items mi on mi.section_id = sec.id
   where ms.project_id = p_project_id;
  if v_sheets_count <> 1 then
    return;
  end if;

  select distinct ms.id into v_sheet_id
    from public.materials_sheets ms
    join public.materials_sections sec on sec.sheet_id = ms.id
    join public.materials_items mi on mi.section_id = sec.id
   where ms.project_id = p_project_id;

  update public.quotes set material_sheet_id = v_sheet_id where id = v_quote_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Fire it at the two moments the pairing can newly become resolvable:
--    a quote is signed (sheet may already exist), or a sheet's first line
--    item is saved (quote may already be signed). Both are thin triggers
--    delegating to the shared function above — same "one function, several
--    trigger moments" shape as 0080's snapshot_sheet_baselines().
-- ---------------------------------------------------------------------------

create or replace function public.link_solo_materials_sheet_on_quote_approved()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved' or old.material_sheet_id is null) then
    perform public.link_solo_materials_sheet(new.project_id);
  end if;
  return new;
end;
$$;

drop trigger if exists quote_approved_link_materials_sheet on public.quotes;
create trigger quote_approved_link_materials_sheet
  after insert or update on public.quotes
  for each row execute function public.link_solo_materials_sheet_on_quote_approved();

create or replace function public.link_solo_materials_sheet_on_item_added()
returns trigger
language plpgsql
as $$
declare
  v_project_id uuid;
begin
  select ms.project_id into v_project_id
    from public.materials_sections sec
    join public.materials_sheets ms on ms.id = sec.sheet_id
   where sec.id = new.section_id;
  if v_project_id is not null then
    perform public.link_solo_materials_sheet(v_project_id);
  end if;
  return new;
end;
$$;

drop trigger if exists materials_item_added_link_sheet on public.materials_items;
create trigger materials_item_added_link_sheet
  after insert on public.materials_items
  for each row execute function public.link_solo_materials_sheet_on_item_added();

-- ---------------------------------------------------------------------------
-- 3. One-time backfill so this takes effect immediately for every project
--    that's already sitting in the gap today, not just future writes.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select id from public.projects loop
    perform public.link_solo_materials_sheet(r.id);
  end loop;
end $$;
