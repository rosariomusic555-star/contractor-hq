-- ContractorHQ seed — per user, project-centric schema.
--
-- After 0003/0004: sign up in the app, copy your id from
-- Authentication → Users, paste it below, run this in the SQL editor.
-- Re-running clears only THIS user's data first.

do $$
declare
  owner       uuid := 'PASTE-YOUR-AUTH-USER-ID';
  v_client    uuid;
  v_project   uuid;
  v_quote     uuid;
  v_sec_base  uuid;
  v_sec_opt   uuid;
  v_mat_sec   uuid;
begin
  delete from public.invoices where user_id = owner;
  delete from public.quotes   where user_id = owner;
  delete from public.projects where user_id = owner;
  delete from public.clients  where user_id = owner;

  insert into public.clients (user_id, name, email, phone, address)
    values (owner, 'Thompson Residence', 'thompson@email.com', '(555) 123-4567',
            '123 Oak Street, Springfield')
    returning id into v_client;

  insert into public.projects (user_id, client_id, name, status)
    values (owner, v_client, 'Kitchen Remodel', 'active')
    returning id into v_project;

  -- Quote with a base section and an optional section
  insert into public.quotes (project_id, user_id, status, deposit_percentage, notes, terms)
    values (v_project, owner, 'sent', 25,
            'Timeline: 3–4 weeks from deposit.',
            'Balance due on completion. 1-year workmanship warranty.')
    returning id into v_quote;

  insert into public.quote_sections (quote_id, name, is_optional, sort_order)
    values (v_quote, 'Scope of Work', false, 0) returning id into v_sec_base;
  insert into public.quote_sections (quote_id, name, is_optional, sort_order)
    values (v_quote, 'Optional Upgrades', true, 1) returning id into v_sec_opt;

  insert into public.quote_items (section_id, name, description, price, is_optional, client_selected, sort_order) values
    (v_sec_base, 'Demolition & disposal', 'Remove existing cabinets, counters, flooring', 2400, false, true, 0),
    (v_sec_base, 'Cabinetry',             'Shaker cabinets, soft-close', 9800, false, true, 1),
    (v_sec_base, 'Quartz countertops',    '42 sq ft installed', 4200, false, true, 2),
    (v_sec_opt,  'Under-cabinet lighting', 'LED strips, dimmable', 650, true, false, 0),
    (v_sec_opt,  'Pot filler faucet',      'Wall-mounted', 480, true, false, 1);

  -- Materials sheet
  insert into public.materials_sections (project_id, name, sort_order)
    values (v_project, 'Cabinets & Hardware', 0) returning id into v_mat_sec;
  insert into public.materials_items (section_id, name, quantity, unit_cost, sort_order) values
    (v_mat_sec, 'Base cabinet 24"', 6, 210, 0),
    (v_mat_sec, 'Wall cabinet 30"', 4, 180, 1),
    (v_mat_sec, 'Cabinet pulls',    28, 4.5, 2);

  -- A deposit invoice
  insert into public.invoices (project_id, quote_id, user_id, amount, status, due_date, notes)
    values (v_project, v_quote, owner, 4100, 'sent', current_date + 14, 'Deposit — 25% of accepted scope');
end $$;
