-- ContractorHQ — Quote builder: 50% default deposit, and quote sections
-- linked to materials sheet sections. Run AFTER 0094.

-- 1. Default deposit 50% --------------------------------------------------
-- New quotes take the deposit from Settings > Quote defaults (createQuote),
-- falling back to 50% in code. Existing quotes keep their own deposit.
-- A saved Quote defaults row still at the old untouched default (30%)
-- moves to 50%; anything a contractor set by hand is left alone.
alter table public.quote_defaults alter column deposit_pct set default 50;
update public.quote_defaults set deposit_pct = 50 where deposit_pct = 30;
alter table public.quotes alter column deposit_percentage set default 50;

-- 2. Quote section ↔ materials sheet section --------------------------------
-- job_category_id: the quote section's project-type tag (same list and
-- chip as materials sheet sections, 0094). Drives auto-matching.
-- materials_link_mode: 'auto' = matched live against the quote's materials
-- sheet by project type (or same name) — nothing stored, so it can never
-- go stale; 'manual' = the rows in quote_section_material_links below.
alter table public.quote_sections
  add column if not exists job_category_id uuid references public.categories (id) on delete set null,
  add column if not exists materials_link_mode text not null default 'auto'
    check (materials_link_mode in ('auto', 'manual'));

-- Manual picks. Deleting a section on either side deletes the link (never a
-- dangling id). Links to sections that aren't on the quote's current sheet
-- (the linked sheet changed) are ignored by the app and pruned on next save.
create table if not exists public.quote_section_material_links (
  quote_section_id     uuid not null references public.quote_sections (id) on delete cascade,
  materials_section_id uuid not null references public.materials_sections (id) on delete cascade,
  created_at           timestamptz not null default now(),
  primary key (quote_section_id, materials_section_id)
);

create index if not exists quote_section_material_links_materials_idx
  on public.quote_section_material_links (materials_section_id);

alter table public.quote_section_material_links enable row level security;

drop policy if exists "own" on public.quote_section_material_links;
create policy "own" on public.quote_section_material_links for all to authenticated
  using (exists (select 1 from public.quote_sections s
                   join public.quotes q on q.id = s.quote_id
                  where s.id = quote_section_id and q.user_id = auth.uid()))
  with check (exists (select 1 from public.quote_sections s
                        join public.quotes q on q.id = s.quote_id
                       where s.id = quote_section_id and q.user_id = auth.uid()));

revoke all on public.quote_section_material_links from anon;
