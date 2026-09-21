-- ContractorHQ — fixes a bug in 0080: materials_usage_log_events had
-- `on delete cascade` back to materials_usage_logs, so the very "deleted"
-- audit row deleteUsageLog() inserts right before removing the log would
-- itself be wiped out by that same delete, one statement later. History
-- can't survive its own subject going away. Run AFTER 0080.
--
-- Fix: events reference the (permanent) materials_item instead as their
-- ownership/RLS anchor, and materials_usage_log_id is now nullable with
-- `on delete set null` — a deleted log's events keep everything they
-- recorded, just with the pointer to the now-gone log row cleared.

alter table public.materials_usage_log_events
  add column if not exists materials_item_id uuid references public.materials_items (id) on delete cascade;

update public.materials_usage_log_events e
set materials_item_id = ul.materials_item_id
from public.materials_usage_logs ul
where e.materials_usage_log_id = ul.id and e.materials_item_id is null;

alter table public.materials_usage_log_events alter column materials_item_id set not null;

alter table public.materials_usage_log_events
  drop constraint if exists materials_usage_log_events_materials_usage_log_id_fkey;

alter table public.materials_usage_log_events alter column materials_usage_log_id drop not null;

alter table public.materials_usage_log_events
  add constraint materials_usage_log_events_materials_usage_log_id_fkey
  foreign key (materials_usage_log_id) references public.materials_usage_logs (id) on delete set null;

create index if not exists materials_usage_log_events_materials_item_id_idx
  on public.materials_usage_log_events (materials_item_id);

-- RLS: re-anchor on materials_item_id (permanent) instead of joining
-- through the log row (which may now be gone for a 'deleted' event).
drop policy if exists "own" on public.materials_usage_log_events;

create policy "own" on public.materials_usage_log_events for all to authenticated
  using      (exists (
    select 1 from public.materials_items mi
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where mi.id = materials_item_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.materials_items mi
    join public.materials_sections ms on ms.id = mi.section_id
    join public.projects p on p.id = ms.project_id
    where mi.id = materials_item_id and p.user_id = auth.uid()
  ));
