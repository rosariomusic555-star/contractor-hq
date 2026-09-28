-- ContractorHQ — Group feature sections by type. Run AFTER 0134.
--
-- A second instance of a feature (Seating Wall 2, Fire Pit 2) used to get
-- its Cost plan section appended at the very bottom (just above General),
-- away from the first one. The app now inserts it right after the last
-- section of its type (src/lib/sectionGrouping.ts); this regroups what's
-- already there, the same way:
--
--   · Cost plan sections and draft / sent quote sections: each feature type's
--     sections move up to sit directly under the first one of that type.
--     Custom sections keep their place; General stays last.
--   · Only where the out-of-place sections are all feature sections at the
--     end — the old append behaviour. Anything else (a custom section after
--     them, types interleaved in the middle) was arranged by hand and is left
--     exactly as it is.
--   · Approved / declined quotes aren't touched (approved ones are locked, 0033).
--   · project_features: same grouping, always (their order isn't
--     user-editable) — a new quote's starting sections follow it.
--
-- Idempotent: a second run finds everything grouped and changes nothing.

-- p_keys: the section's feature type (null = not a feature section);
-- p_pinned: General. Returns the new order, or null = leave as is.
create or replace function public._regroup_if_auto_appended(p_ids uuid[], p_keys text[], p_pinned boolean[])
returns uuid[] language plpgsql immutable as $$
declare
  n int := coalesce(array_length(p_ids, 1), 0);
  body_ids uuid[] := '{}';
  body_keys text[] := '{}';
  pinned_ids uuid[] := '{}';
  seen text[] := '{}';
  done text[] := '{}';
  break_at int := 0;
  out_ids uuid[] := '{}';
  i int;
  j int;
begin
  for i in 1..n loop
    if p_pinned[i] then pinned_ids := pinned_ids || p_ids[i];
    else
      body_ids := body_ids || p_ids[i];
      body_keys := body_keys || p_keys[i];
    end if;
  end loop;

  for i in 1..coalesce(array_length(body_ids, 1), 0) loop
    continue when body_keys[i] is null;
    if body_keys[i] = any(seen) and body_keys[i - 1] is distinct from body_keys[i] then
      break_at := i;
      exit;
    end if;
    seen := seen || body_keys[i];
  end loop;
  if break_at = 0 then return null; end if;                        -- already grouped
  for i in break_at..array_length(body_ids, 1) loop
    if body_keys[i] is null then return null; end if;              -- arranged by hand
  end loop;

  for i in 1..array_length(body_ids, 1) loop
    if body_keys[i] is null then
      out_ids := out_ids || body_ids[i];
    elsif not (body_keys[i] = any(done)) then
      done := done || body_keys[i];
      for j in i..array_length(body_ids, 1) loop
        if body_keys[j] = body_keys[i] then out_ids := out_ids || body_ids[j]; end if;
      end loop;
    end if;
  end loop;
  return out_ids || pinned_ids;
end;
$$;

do $$
declare
  r record;
  v_ids uuid[];
  v_keys text[];
  v_pins boolean[];
  v_new uuid[];
begin
  -- Cost plans
  for r in select distinct sheet_id from public.materials_sections where feature_id is not null and sheet_id is not null loop
    select array_agg(ms.id order by ms.sort_order, ms.id),
           array_agg(pf.category_id::text order by ms.sort_order, ms.id),
           array_agg(coalesce(ms.is_general, false) order by ms.sort_order, ms.id)
      into v_ids, v_keys, v_pins
      from public.materials_sections ms
      left join public.project_features pf on pf.id = ms.feature_id
     where ms.sheet_id = r.sheet_id;
    v_new := public._regroup_if_auto_appended(v_ids, v_keys, v_pins);
    if v_new is not null then
      update public.materials_sections m set sort_order = x.ord - 1
        from unnest(v_new) with ordinality as x(id, ord)
       where m.id = x.id and m.sort_order is distinct from (x.ord - 1)::int;
    end if;
  end loop;

  -- Quotes still being edited / out with the client
  for r in select distinct qs.quote_id from public.quote_sections qs join public.quotes q on q.id = qs.quote_id
            where qs.feature_id is not null and q.status in ('draft', 'sent') loop
    select array_agg(qs.id order by qs.sort_order, qs.id),
           array_agg(pf.category_id::text order by qs.sort_order, qs.id),
           array_agg(false order by qs.sort_order, qs.id)
      into v_ids, v_keys, v_pins
      from public.quote_sections qs
      left join public.project_features pf on pf.id = qs.feature_id
     where qs.quote_id = r.quote_id;
    v_new := public._regroup_if_auto_appended(v_ids, v_keys, v_pins);
    if v_new is not null then
      update public.quote_sections s set sort_order = x.ord - 1
        from unnest(v_new) with ordinality as x(id, ord)
       where s.id = x.id and s.sort_order is distinct from (x.ord - 1)::int;
    end if;
  end loop;
end $$;

-- Features: stable group by type (first appearance), renumbered 0..n.
with ordered as (
  select id, project_id, category_id,
         row_number() over (partition by project_id order by sort_order, created_at) as pos
    from public.project_features
), keyed as (
  select *, min(pos) over (partition by project_id, coalesce(category_id::text, id::text)) as grp_pos
    from ordered
), renum as (
  select id, (row_number() over (partition by project_id order by grp_pos, pos) - 1)::int as new_order from keyed
)
update public.project_features f set sort_order = r.new_order
  from renum r
 where f.id = r.id and f.sort_order is distinct from r.new_order;

drop function public._regroup_if_auto_appended(uuid[], text[], boolean[]);
