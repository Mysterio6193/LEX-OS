-- Matter Checklists (PRD CM-07/FM-03/WA-04): per-matter task lists.
-- Tasks are added by users in the Checklist tab, saved by the assistant
-- via the save_task tool, or seeded from a matter template (M&A due
-- diligence, NDA review, litigation, lease analysis). Pending tasks are
-- injected into every project chat's system prompt.

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  title text not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'done')),
  position integer not null default 0,
  source text not null default 'user'
    check (source in ('assistant', 'user', 'template')),
  template_id text,
  source_chat_id uuid references public.chats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_tasks_project
  on public.project_tasks(project_id, position);

revoke all on public.project_tasks from anon, authenticated;
