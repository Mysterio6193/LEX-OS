-- GST-compliant time tracking and invoicing (India).
-- time_entries capture billable work per matter; invoices are generated
-- from selected entries (or ad-hoc lines) with GST computed for legal
-- services (SAC 9982) at 18% — CGST+SGST intra-state, IGST inter-state.

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  entry_date date not null,
  description text not null,
  minutes integer not null default 0,
  rate numeric not null default 0,
  amount numeric not null default 0,
  billed boolean not null default false,
  source text not null default 'user'
    check (source in ('assistant', 'user')),
  source_chat_id uuid references public.chats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_time_entries_project
  on public.time_entries(project_id, entry_date);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  invoice_number text not null,
  invoice_date date not null,
  client_name text,
  client_gstin text,
  place_of_supply text,
  sac_code text not null default '9982',
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_project
  on public.invoices(project_id, invoice_date);

revoke all on public.time_entries from anon, authenticated;
revoke all on public.invoices from anon, authenticated;
