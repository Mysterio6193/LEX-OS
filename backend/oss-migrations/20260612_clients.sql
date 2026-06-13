-- Client Memory (PRD CLM-01 / CLM-02): per-client profiles.
-- Each user maintains a list of clients with free-form preference notes.
-- Projects can be linked to a client; the client's profile (notes plus
-- preference memories aggregated across all of that client's matters) is
-- injected into every linked project chat's system prompt.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_user
  on public.clients(user_id);

alter table public.projects
  add column if not exists client_id uuid
  references public.clients(id) on delete set null;

create index if not exists idx_projects_client
  on public.projects(client_id);

revoke all on public.clients from anon, authenticated;
