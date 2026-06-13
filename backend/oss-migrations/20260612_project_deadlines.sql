-- Matter Deadlines (PRD WA-02): per-project deadline tracking.
-- The assistant saves date-bound obligations via the save_deadline tool;
-- users manage entries from the project's Deadlines tab. Upcoming
-- deadlines are injected into every project chat's system prompt so the
-- assistant stays deadline-aware.

create table if not exists public.project_deadlines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  title text not null,
  due_date date not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'done')),
  source text not null default 'user'
    check (source in ('assistant', 'user')),
  source_chat_id uuid references public.chats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_deadlines_project
  on public.project_deadlines(project_id, due_date);

revoke all on public.project_deadlines from anon, authenticated;
