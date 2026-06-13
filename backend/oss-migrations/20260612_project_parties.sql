-- Conflict Checking (PRD CLM-07/WA-09): parties per matter.
-- Each matter records the entities connected to it (client, counterparty,
-- opposing counsel, witnesses). Conflict checks match candidate names
-- against the caller's whole accessible universe of matters, parties, and
-- clients so a prospective client who is adverse elsewhere is surfaced.

create table if not exists public.project_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  name text not null,
  role text not null default 'other'
    check (role in ('client', 'counterparty', 'opposing_counsel', 'witness', 'other')),
  notes text,
  source text not null default 'user'
    check (source in ('assistant', 'user')),
  source_chat_id uuid references public.chats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_parties_project
  on public.project_parties(project_id);

revoke all on public.project_parties from anon, authenticated;
