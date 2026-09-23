-- ContractorHQ — snapshot a sheet's estimate baseline the moment it
-- actually starts tracking (quotes.material_sheet_id becomes set), not
-- only when a project's status happens to transition out of Estimating.
-- Run AFTER 0087.
--
-- Root cause this fixes: snapshot_sheet_baselines() (0080) was only ever
-- called from two triggers — a project leaving Estimating, or a change
-- order being approved. Neither fires for a project that was ALREADY past
-- Estimating (or has no linked opportunity, so apply_opportunity_won never
-- touches public.projects at all) by the time its quote finally gets
-- linked to a materials sheet — whether that link comes from 0087's
-- auto-link or the contractor's own "Link a materials sheet" action. The
-- sheet correctly starts tracking (isTracked flips true) but every line's
-- baseline stays empty, so the Material Tracker shows "Estimated $0.00"
-- instead of the real planned quantity/cost — exactly what turned up on
-- John's patio right after being auto-linked.
--
-- snapshot_sheet_baselines() is already idempotent (skips any line that
-- already has a baseline), so firing it again here for a sheet that WAS
-- correctly snapshotted through the existing Won-transition path is a
-- harmless no-op.

-- ---------------------------------------------------------------------------
-- Hardening: 0087's quote_approved_link_materials_sheet trigger fires on
-- BOTH insert and update, but its function reads OLD.status/OLD.
-- material_sheet_id — which doesn't exist on an insert. The app never
-- actually inserts a quote with status='approved' (createQuote always
-- takes the column default, 'draft'), so this hasn't misfired in
-- practice, but it's one accidental direct insert away from erroring the
-- whole transaction. Re-issued here to only run on UPDATE, where OLD is
-- always valid.
-- ---------------------------------------------------------------------------

drop trigger if exists quote_approved_link_materials_sheet on public.quotes;
create trigger quote_approved_link_materials_sheet
  after update on public.quotes
  for each row execute function public.link_solo_materials_sheet_on_quote_approved();

create or replace function public.snapshot_baselines_on_quote_sheet_linked()
returns trigger
language plpgsql
as $$
begin
  if new.material_sheet_id is not null and old.material_sheet_id is distinct from new.material_sheet_id then
    perform public.snapshot_sheet_baselines(new.material_sheet_id);
  end if;
  return new;
end;
$$;

drop trigger if exists quote_sheet_linked_snapshot_baselines on public.quotes;
create trigger quote_sheet_linked_snapshot_baselines
  after update on public.quotes
  for each row execute function public.snapshot_baselines_on_quote_sheet_linked();

-- One-time backfill: every quote already linked to a sheet today gets its
-- sheet's baseline filled in for any line that's still missing one.
do $$
declare
  r record;
begin
  for r in select distinct material_sheet_id from public.quotes where material_sheet_id is not null loop
    perform public.snapshot_sheet_baselines(r.material_sheet_id);
  end loop;
end $$;
