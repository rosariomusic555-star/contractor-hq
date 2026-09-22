-- ContractorHQ — follow-up to 0083: linking a signed quote to its sheet
-- makes that sheet start tracking, but the baseline snapshot only fires on
-- a *live* Estimating->Won transition or CO approval (0080's triggers) —
-- neither happens retroactively just because the link was backfilled. Same
-- gap 0080's own one-time backfill (its step 10) covered for projects that
-- were already tracked at the time; this just re-runs that exact query so
-- it also catches the sheets 0083 linked afterward. snapshot_sheet_
-- baselines() only inserts for a line with no baseline yet, so this is
-- safe to run again for sheets it already covered.
do $$
declare
  v_sheet_id uuid;
begin
  for v_sheet_id in
    select q.material_sheet_id
      from public.quotes q
      join public.projects p on p.id = q.project_id
     where q.status = 'approved' and q.material_sheet_id is not null and p.status <> 'estimating'
  loop
    perform public.snapshot_sheet_baselines(v_sheet_id);
  end loop;
end $$;
