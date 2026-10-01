-- 0158 — Measurement cards: Pergola and Irrigation get their own cards;
-- Seating wall backrest gets a "full wall length" toggle.
--
-- Pergola and Irrigation used the area card (sq ft / L × W / L-shape …).
--   Pergola:    a rectangle's L × W carries over to the new length / width;
--               anything else (total sq ft, L/U, irregular) keeps its area
--               as a custom measurement "Footprint (old measurement)".
--   Irrigation: the new card counts zones and heads — the old area is kept
--               as a custom measurement "Area covered (old measurement)".
-- Seating wall: a blank backrest length meant "the whole wall" → the new
--   backrest_full toggle on; a typed length → off.
--
-- Rows already in the new shape are left alone, so re-running is safe. The
-- app also upgrades any old row it reads (normalizeData), but only this
-- migration keeps the irrigation area — run it before editing those cards.

-- 1. Old areas → custom measurements (before the data is replaced).
insert into public.project_measurements (project_id, build_type, field_key, label, value, unit, sort_order)
select m.project_id,
       m.build_type,
       'custom_' || replace(gen_random_uuid()::text, '-', ''),
       case when m.build_type = 'pergola' then 'Footprint (old measurement)' else 'Area covered (old measurement)' end,
       round((m.totals->>'area_sqft')::numeric, 2),
       'sq_ft',
       100 + coalesce((select max(sort_order) from public.project_measurements x where x.project_id = m.project_id), 0)
from public.project_feature_measurements m
where m.build_type in ('pergola', 'irrigation')
  and (m.data ? 'rect' or m.data ? 'method' or m.data ? 'areas')
  and coalesce((m.totals->>'area_sqft')::numeric, 0) > 0
  -- A pergola rectangle carries over as length × width instead.
  and not (m.build_type = 'pergola'
           and coalesce(m.data->>'method', 'dimensions') <> 'total'
           and coalesce(m.data->>'shape', 'rectangle') = 'rectangle');

-- 2. Pergola rows → the new shape.
update public.project_feature_measurements m
set data = case
             when coalesce(m.data->>'method', 'dimensions') <> 'total' and coalesce(m.data->>'shape', 'rectangle') = 'rectangle'
               then jsonb_build_object(
                      'length_ft', m.data->'rect'->'length_ft',
                      'width_ft',  m.data->'rect'->'width_ft')
             else '{}'::jsonb
           end,
    totals = case
               when coalesce(m.data->>'method', 'dimensions') <> 'total' and coalesce(m.data->>'shape', 'rectangle') = 'rectangle'
                    and coalesce((m.data->'rect'->>'length_ft')::numeric, 0) > 0
                    and coalesce((m.data->'rect'->>'width_ft')::numeric, 0) > 0
                 then jsonb_build_object(
                        'footprint_sqft', round((m.data->'rect'->>'length_ft')::numeric * (m.data->'rect'->>'width_ft')::numeric, 2),
                        'perimeter_ft', round(2 * ((m.data->'rect'->>'length_ft')::numeric + (m.data->'rect'->>'width_ft')::numeric), 2))
               else '{}'::jsonb
             end
where m.build_type = 'pergola'
  and (m.data ? 'rect' or m.data ? 'method' or m.data ? 'areas');

-- 3. Irrigation rows → a blank zone card (the area moved in step 1).
update public.project_feature_measurements
set data = '{}'::jsonb, totals = '{}'::jsonb
where build_type = 'irrigation'
  and (data ? 'rect' or data ? 'method' or data ? 'areas');

-- 4. Seating wall backrest toggle.
update public.project_feature_measurements
set data = data || jsonb_build_object(
             'backrest_full',
             not (jsonb_typeof(data->'backrest_length_ft') = 'number' and (data->>'backrest_length_ft')::numeric > 0))
where build_type = 'seating_wall'
  and not (data ? 'backrest_full');

-- Check: no pergola / irrigation rows left in the old shape.
select build_type, count(*) as old_shape_rows
from public.project_feature_measurements
where build_type in ('pergola', 'irrigation') and (data ? 'rect' or data ? 'method' or data ? 'areas')
group by build_type;
