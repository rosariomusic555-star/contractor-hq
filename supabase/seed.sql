-- ContractorHQ seed data — per user.
--
-- After 0002_auth.sql every row needs an owner. Sign up in the app, find your
-- id in the Supabase dashboard (Authentication → Users), paste it below, and
-- run this in the SQL editor. Optional — you can also just create data in the UI.
-- Re-running clears only THIS user's rows first.

do $$
declare
  owner uuid := 'PASTE-YOUR-AUTH-USER-ID';
begin
  delete from public.expenses where user_id = owner;
  delete from public.invoices where user_id = owner;
  delete from public.quotes   where user_id = owner;
  delete from public.clients  where user_id = owner;

  insert into public.clients (user_id, name, email, phone, address) values
    (owner, 'Thompson Residence',   'thompson@email.com',    '(555) 123-4567', '123 Oak Street, Springfield'),
    (owner, 'Oak Street Renovation','oakstreet@email.com',   '(555) 234-5678', '456 Main Ave, Riverside'),
    (owner, 'Martinez Family',      'martinez@email.com',    '(555) 345-6789', '789 Pine Road, Lakewood'),
    (owner, 'Downtown Office',      'downtown@business.com', '(555) 456-7890', '100 Business Center, Metro City'),
    (owner, 'Green Valley HOA',     'hoa@greenvalley.org',   '(555) 567-8901', 'Green Valley Community Center');

  insert into public.quotes (user_id, number, client, project, amount, status, issue_date, valid_until) values
    (owner, 'QT-001', 'Thompson Residence',    'Kitchen Remodel',      8500,  'approved', '2024-01-15', '2024-02-15'),
    (owner, 'QT-002', 'Oak Street Renovation', 'Full Home Renovation', 45000, 'sent',     '2024-01-18', '2024-02-18'),
    (owner, 'QT-003', 'Martinez Family',       'Bathroom Addition',    12800, 'draft',    '2024-01-20', '2024-02-20'),
    (owner, 'QT-004', 'Downtown Office',       'Commercial Build-out', 78500, 'sent',     '2024-01-22', '2024-02-22');

  insert into public.invoices (user_id, number, client, project, amount, status, project_type, issue_date, due_date) values
    (owner, 'INV-001', 'Thompson Residence',    'Kitchen Remodel',      8500,  'paid',    'renovation',       '2024-01-10', '2024-01-25'),
    (owner, 'INV-002', 'Oak Street Renovation', 'Full Home Renovation', 15000, 'sent',    'renovation',       '2024-01-15', '2024-01-30'),
    (owner, 'INV-003', 'Downtown Office',       'Commercial Build-out', 24000, 'overdue', 'new_construction', '2024-01-01', '2024-01-15'),
    (owner, 'INV-004', 'Martinez Family',       'Bathroom Addition',    6400,  'draft',   'renovation',       '2024-01-22', '2024-02-06');

  insert into public.expenses (user_id, description, category, project, amount, expense_date) values
    (owner, 'Cabinetry & countertops',   'materials',     'Kitchen Remodel',      5000,  '2024-01-08'),
    (owner, 'Framing crew',              'labor',         'Kitchen Remodel',      3200,  '2024-01-20'),
    (owner, 'Lumber & drywall',          'materials',     'Full Home Renovation', 6500,  '2024-02-10'),
    (owner, 'Electrical subcontractor',  'subcontractor', 'Full Home Renovation', 4000,  '2024-02-18'),
    (owner, 'Tile & fixtures',           'materials',     'Bathroom Addition',    5600,  '2024-03-05'),
    (owner, 'Finish carpentry',          'labor',         'Bathroom Addition',    3500,  '2024-03-22'),
    (owner, 'Structural steel',          'materials',     'Commercial Build-out', 9000,  '2024-04-12'),
    (owner, 'Excavator rental',          'equipment',     'Commercial Build-out', 5200,  '2024-04-25'),
    (owner, 'HVAC materials',            'materials',     'Commercial Build-out', 7800,  '2024-05-09'),
    (owner, 'Install labor',             'labor',         'Commercial Build-out', 5000,  '2024-05-20'),
    (owner, 'Plumbing subcontractor',    'subcontractor', 'Full Home Renovation', 9600,  '2024-06-11'),
    (owner, 'Roofing materials',         'materials',     'Full Home Renovation', 6000,  '2024-06-24'),
    (owner, 'Windows & doors',           'materials',     'Full Home Renovation', 11900, '2024-07-15'),
    (owner, 'City permits & inspection', 'permits',       'Full Home Renovation', 7000,  '2024-07-28');
end $$;
