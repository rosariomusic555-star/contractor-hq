-- ContractorHQ — applies an approved change order's schedule_impact_days
-- (0069) to the project's estimated_duration_days, exactly once, the
-- moment status transitions TO 'approved'. Run AFTER 0070.
--
-- A single DB trigger rather than three separate application-layer calls
-- (the contractor's own one-click approve in the builder, the public
-- share-token sign_change_order RPC, and the Client Hub portal's
-- portal_approve_change_order RPC) — whichever path actually approves a
-- change order, this fires the same way. Never fabricates a baseline: if
-- the project has no estimate set yet (estimated_duration_days is null),
-- nothing happens — there's nothing to adjust.

create or replace function public.apply_change_order_schedule_impact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and old.status is distinct from 'approved'
     and new.schedule_impact_days is not null
     and new.schedule_impact_days <> 0
  then
    update public.projects
       set estimated_duration_days = greatest(0, estimated_duration_days + new.schedule_impact_days)
     where id = new.project_id
       and estimated_duration_days is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists change_orders_apply_schedule_impact on public.change_orders;
create trigger change_orders_apply_schedule_impact
  after update on public.change_orders
  for each row execute function public.apply_change_order_schedule_impact();
