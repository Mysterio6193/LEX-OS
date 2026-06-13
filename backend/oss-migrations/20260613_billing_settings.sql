-- Firm billing settings (India GST invoicing).
-- The firm's GSTIN and home state determine CGST/SGST (intra-state) vs IGST
-- (inter-state) on invoices; the default hourly rate seeds time entries.

alter table public.user_profiles
  add column if not exists firm_gstin text;

alter table public.user_profiles
  add column if not exists firm_state text;

alter table public.user_profiles
  add column if not exists default_hourly_rate numeric;
