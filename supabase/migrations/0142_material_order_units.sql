-- ContractorHQ — More delivery units. Run AFTER 0141.
--
-- material_order_items.unit only allowed pallet / ton / cubic_yard / bag /
-- linear_foot / each (0056). Order Sheet "Mark as ordered" and the alerts
-- bar write each Cost plan line's unit onto the order — so pavers in sq ft,
-- geotextile in rolls, adhesive in tubes all became "each", which the
-- Material Tracker can't match to the line: Ordered / Delivered read 0 and
-- delivered cost counted $0. Adds the units the calculators actually use.

alter table public.material_order_items drop constraint if exists material_order_items_unit_check;
alter table public.material_order_items add constraint material_order_items_unit_check
  check (unit in ('pallet', 'ton', 'cubic_yard', 'bag', 'linear_foot', 'each', 'square_foot', 'roll', 'tube', 'layer'));
