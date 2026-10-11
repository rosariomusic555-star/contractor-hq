-- 0171 — global_search(): the app shell's search (sidebar box / ⌘K) in one
-- round trip. SECURITY INVOKER, so every table's own RLS scopes the results
-- to the signed-in account exactly as the list pages do.
--
-- Returns up to max_per_type rows per type, plus `total` (all matches of that
-- type, for "See all N"). Ranking inside a type: exact title match, then
-- starts-with, then most recently updated.
--
--   type        'client' | 'project' | 'opportunity' | 'quote' | 'invoice' | 'change_order'
--   href_params what the client needs to build the link (ids), as jsonb
--
-- Matching: case-insensitive, anywhere in the text (ILIKE). Phone numbers
-- ignore formatting ("5551234" finds "(555) 123-4567"); invoice numbers also
-- match on the number alone ("14" finds "INV-014").
--
-- Quotes have no number or title of their own: they're named after their
-- project ("Standalone quote" without one), add-on quotes "Add-on quote #n".

create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes so ILIKE '%…%' stays fast as accounts grow.
create index if not exists clients_name_trgm        on public.clients       using gin (name extensions.gin_trgm_ops);
create index if not exists clients_email_trgm       on public.clients       using gin (email extensions.gin_trgm_ops);
create index if not exists clients_address_trgm     on public.clients       using gin (address extensions.gin_trgm_ops);
create index if not exists clients_phone_digits_trgm on public.clients      using gin ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) extensions.gin_trgm_ops);
create index if not exists projects_name_trgm       on public.projects      using gin (name extensions.gin_trgm_ops);
create index if not exists projects_address_trgm    on public.projects      using gin (address extensions.gin_trgm_ops);
create index if not exists opportunities_title_trgm on public.opportunities using gin (title extensions.gin_trgm_ops);
create index if not exists opportunities_address_trgm on public.opportunities using gin (address extensions.gin_trgm_ops);
create index if not exists invoices_number_trgm     on public.invoices      using gin (invoice_number extensions.gin_trgm_ops);
create index if not exists change_orders_title_trgm on public.change_orders using gin (title extensions.gin_trgm_ops);

create or replace function public.global_search(q text, max_per_type int default 5)
returns table (
  type        text,
  id          uuid,
  title       text,
  subtitle    text,
  status      text,
  href_params jsonb,
  updated_at  timestamptz,
  total       int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  term   text := btrim(coalesce(q, ''));
  pat    text;
  starts text;
  digits text;
  num    text;
begin
  if length(term) < 2 then
    return;
  end if;
  -- The user's text is matched literally: escape LIKE's wildcards.
  pat    := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  starts := substr(pat, 2);
  digits := regexp_replace(term, '[^0-9]', '', 'g');
  num    := nullif(ltrim(digits, '0'), '');

  return query
  with
  cl as (
    select 'client'::text as type, c.id, c.name as title,
           concat_ws(' · ', nullif(c.email, ''), nullif(c.phone, ''), nullif(c.address, '')) as subtitle,
           c.status::text as status, jsonb_build_object('id', c.id) as href_params, c.created_at as updated_at,
           case when lower(c.name) = lower(term) then 0 when c.name ilike starts then 1 else 2 end as rk
      from clients c
     where c.name ilike pat or c.email ilike pat or c.address ilike pat
        or (length(digits) >= 3 and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') like '%' || digits || '%')
  ),
  pr as (
    select 'project'::text, p.id, p.name,
           concat_ws(' · ', nullif(c.name, ''), nullif(p.address, '')),
           p.status::text, jsonb_build_object('id', p.id), p.updated_at,
           case when lower(p.name) = lower(term) then 0 when p.name ilike starts then 1 else 2 end
      from projects p
      left join clients c on c.id = p.client_id
     where (p.name ilike pat or p.address ilike pat or c.name ilike pat)
       -- Same rule as the job lists: a project behind a not-yet-won
       -- opportunity is still a sale, not a job.
       and not exists (select 1 from opportunities o where o.project_id = p.id and o.stage <> 'won')
  ),
  op as (
    select 'opportunity'::text, o.id, o.title,
           concat_ws(' · ', nullif(c.name, ''), nullif(o.address, '')),
           o.stage::text, jsonb_build_object('id', o.id), o.updated_at,
           case when lower(o.title) = lower(term) then 0 when o.title ilike starts then 1 else 2 end
      from opportunities o
      left join clients c on c.id = o.client_id
     where o.archived_at is null
       and (o.title ilike pat or o.address ilike pat or c.name ilike pat)
  ),
  qu as (
    select 'quote'::text, x.id, x.title, x.subtitle, x.status, x.href_params, x.updated_at,
           case when lower(x.title) = lower(term) then 0 when x.title ilike starts then 1 else 2 end
      from (
        select qq.id,
               case when qq.kind = 'addon' then 'Add-on quote #' || addon_quote_number(qq.id) || coalesce(' · ' || p.name, '')
                    else coalesce(p.name, 'Standalone quote') end as title,
               concat_ws(' · ', nullif(c.name, ''), to_char(qq.created_at, 'Mon FMDD, YYYY')) as subtitle,
               qq.status::text as status,
               jsonb_build_object('id', qq.id, 'project_id', qq.project_id) as href_params,
               qq.updated_at,
               c.name as client_name,
               p.name as project_name,
               qq.kind
          from quotes qq
          left join projects p on p.id = qq.project_id
          left join clients c on c.id = coalesce(qq.client_id, p.client_id)
      ) x
     where x.project_name ilike pat or x.client_name ilike pat or x.title ilike pat
        or (x.project_name is null and 'standalone quote' ilike pat)
  ),
  iv as (
    select 'invoice'::text, i.id, coalesce(nullif(i.invoice_number, ''), 'Invoice'),
           concat_ws(' · ', nullif(c.name, ''), to_char(i.amount, 'FM$999,999,990.00'),
                     case when i.due_date is not null then 'due ' || to_char(i.due_date, 'Mon FMDD') end),
           i.status::text, jsonb_build_object('id', i.id, 'project_id', i.project_id), i.updated_at,
           case when lower(i.invoice_number) = lower(term) then 0
                when num is not null and nullif(ltrim(regexp_replace(coalesce(i.invoice_number, ''), '[^0-9]', '', 'g'), '0'), '') = num then 0
                when i.invoice_number ilike starts then 1 else 2 end
      from invoices i
      left join projects p on p.id = i.project_id
      left join quotes qq on qq.id = i.quote_id
      left join clients c on c.id = coalesce(p.client_id, qq.client_id)
     where i.invoice_number ilike pat or c.name ilike pat or p.name ilike pat
        or (num is not null and nullif(ltrim(regexp_replace(coalesce(i.invoice_number, ''), '[^0-9]', '', 'g'), '0'), '') = num)
  ),
  co as (
    select 'change_order'::text, x.id, x.title, x.subtitle, x.status, x.href_params, x.updated_at,
           case when lower(x.title) = lower(term) then 0 when x.title ilike starts then 1 else 2 end
      from (
        select k.id,
               'CO #' || change_order_number(k.id) || ' · ' || k.title as title,
               concat_ws(' · ', nullif(p.name, ''), to_char(k.amount, 'FM$999,999,990.00')) as subtitle,
               k.status::text as status,
               jsonb_build_object('id', k.id, 'project_id', k.project_id) as href_params,
               k.created_at as updated_at,
               k.title as raw_title,
               p.name as project_name
          from change_orders k
          join projects p on p.id = k.project_id
      ) x
     where x.raw_title ilike pat or x.project_name ilike pat or x.title ilike pat
  ),
  everything as (
    select * from cl union all select * from pr union all select * from op
    union all select * from qu union all select * from iv union all select * from co
  ),
  ranked as (
    select e.*,
           row_number() over (partition by e.type order by e.rk, e.updated_at desc nulls last) as n,
           count(*) over (partition by e.type)::int as cnt
      from everything e
  )
  select r.type, r.id, r.title, nullif(r.subtitle, ''), r.status, r.href_params, r.updated_at, r.cnt
    from ranked r
   where r.n <= greatest(1, least(max_per_type, 50))
   order by r.type, r.n;
end $$;

grant execute on function public.global_search(text, int) to authenticated;
