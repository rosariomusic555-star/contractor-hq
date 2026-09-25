-- ContractorHQ — give untyped quote sections their project type.
-- Run AFTER 0100.
--
-- The opportunity page's "Start the quote with a section per project type"
-- created each section with only a name ("Outdoor Kitchen"), never its
-- project type (quote_sections.job_category_id, 0095). So those sections
-- showed "Add project type" and couldn't auto-link to materials. New ones
-- are now created with the type set; this fixes the existing ones.
--
-- An untyped section gets the category whose name matches its own name
-- (case, spacing, punctuation and a trailing "s" ignored — the same
-- normalization the app uses). A project type of the quote's own project
-- wins. A standalone quote (no project) falls back to the contractor's
-- other categories, since the quote builder offers those as types there.
-- Sections already typed, or whose name matches nothing (e.g. "Back
-- patio"), are left alone.

with norm as (
  select
    qs.id as section_id,
    regexp_replace(regexp_replace(lower(qs.name), '[^a-z0-9]', '', 'g'), 's$', '') as key,
    q.user_id,
    q.project_id
  from public.quote_sections qs
  join public.quotes q on q.id = qs.quote_id
  where qs.job_category_id is null
    and trim(coalesce(qs.name, '')) <> ''
),
candidates as (
  select
    n.section_id,
    c.id as category_id,
    -- 0 = one of the quote's project types, 1 = another of the contractor's categories
    case when pc.category_id is not null then 0 else 1 end as rank
  from norm n
  join public.categories c
    on c.user_id = n.user_id
   and regexp_replace(regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g'), 's$', '') = n.key
  left join public.project_categories pc
    on pc.project_id = n.project_id and pc.category_id = c.id
  -- On a project, only its own project types count.
  where n.project_id is null or pc.category_id is not null
),
best as (
  select distinct on (section_id) section_id, category_id
  from candidates
  order by section_id, rank
)
update public.quote_sections qs
set job_category_id = best.category_id
from best
where qs.id = best.section_id;
