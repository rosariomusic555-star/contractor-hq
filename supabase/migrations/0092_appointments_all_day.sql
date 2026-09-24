-- ContractorHQ — date-only appointments. Run AFTER 0091.
--
-- The New appointment modal no longer asks for a time, duration or
-- address: appointments are now date-only. New ones are stored with
-- all_day = true and date_time at local noon of the picked date (noon so
-- the date can't shift a day in either direction across time zones);
-- duration_minutes keeps its 60 default for anything that needs a length.
-- The address is filled automatically from the opportunity/client.
--
-- Existing appointments are left exactly as they were (all_day = false),
-- keeping their stored time, duration and address.
alter table public.appointments
  add column if not exists all_day boolean not null default false;
