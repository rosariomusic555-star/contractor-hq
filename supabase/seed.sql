-- ContractorHQ seed data — mirrors the former hardcoded mock data.
-- Safe to re-run: each section clears its table first.

-- Clients -------------------------------------------------------------------
delete from public.clients;
insert into public.clients (name, email, phone, address) values
  ('Thompson Residence',   'thompson@email.com',    '(555) 123-4567', '123 Oak Street, Springfield'),
  ('Oak Street Renovation','oakstreet@email.com',   '(555) 234-5678', '456 Main Ave, Riverside'),
  ('Martinez Family',      'martinez@email.com',    '(555) 345-6789', '789 Pine Road, Lakewood'),
  ('Downtown Office',      'downtown@business.com', '(555) 456-7890', '100 Business Center, Metro City'),
  ('Green Valley HOA',     'hoa@greenvalley.org',   '(555) 567-8901', 'Green Valley Community Center');

-- Quotes ------------------------------------------------------------------- -
delete from public.quotes;
insert into public.quotes (number, client, project, amount, status, issue_date, valid_until) values
  ('QT-001', 'Thompson Residence',    'Kitchen Remodel',       8500,  'approved', '2024-01-15', '2024-02-15'),
  ('QT-002', 'Oak Street Renovation', 'Full Home Renovation',  45000, 'sent',     '2024-01-18', '2024-02-18'),
  ('QT-003', 'Martinez Family',       'Bathroom Addition',     12800, 'draft',    '2024-01-20', '2024-02-20'),
  ('QT-004', 'Downtown Office',       'Commercial Build-out',  78500, 'sent',     '2024-01-22', '2024-02-22');

-- Invoices ----------------------------------------------------------------- -
delete from public.invoices;
insert into public.invoices (number, client, project, amount, status, project_type, issue_date, due_date) values
  ('INV-001', 'Thompson Residence',    'Kitchen Remodel',      8500,  'paid',    'renovation',       '2024-01-10', '2024-01-25'),
  ('INV-002', 'Oak Street Renovation', 'Full Home Renovation', 15000, 'sent',    'renovation',       '2024-01-15', '2024-01-30'),
  ('INV-003', 'Downtown Office',       'Commercial Build-out', 24000, 'overdue', 'new_construction', '2024-01-01', '2024-01-15'),
  ('INV-004', 'Martinez Family',       'Bathroom Addition',    6400,  'draft',   'renovation',       '2024-01-22', '2024-02-06');

-- Expenses ----------------------------------------------------------------- -
-- Line items totalling the former RevenueView monthly figures (Jan–Jul 2024).
delete from public.expenses;
insert into public.expenses (description, category, project, amount, expense_date) values
  ('Cabinetry & countertops',   'materials',     'Kitchen Remodel',      5000,  '2024-01-08'),
  ('Framing crew',              'labor',         'Kitchen Remodel',      3200,  '2024-01-20'),
  ('Lumber & drywall',          'materials',     'Full Home Renovation', 6500,  '2024-02-10'),
  ('Electrical subcontractor',  'subcontractor', 'Full Home Renovation', 4000,  '2024-02-18'),
  ('Tile & fixtures',           'materials',     'Bathroom Addition',    5600,  '2024-03-05'),
  ('Finish carpentry',          'labor',         'Bathroom Addition',    3500,  '2024-03-22'),
  ('Structural steel',          'materials',     'Commercial Build-out', 9000,  '2024-04-12'),
  ('Excavator rental',          'equipment',     'Commercial Build-out', 5200,  '2024-04-25'),
  ('HVAC materials',            'materials',     'Commercial Build-out', 7800,  '2024-05-09'),
  ('Install labor',             'labor',         'Commercial Build-out', 5000,  '2024-05-20'),
  ('Plumbing subcontractor',    'subcontractor', 'Full Home Renovation', 9600,  '2024-06-11'),
  ('Roofing materials',         'materials',     'Full Home Renovation', 6000,  '2024-06-24'),
  ('Windows & doors',           'materials',     'Full Home Renovation', 11900, '2024-07-15'),
  ('City permits & inspection', 'permits',       'Full Home Renovation', 7000,  '2024-07-28');
