-- Matter Memory (PRD CM-02 / CM-03): persistent per-project memory entries.
-- The assistant saves key decisions, facts, and preferences via the
-- save_memory tool; users can also add and curate entries from the
-- project's Memory tab. Entries are injected into every project chat's
-- system prompt so the assistant never loses matter context.

create table if not exists public.project_memories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  kind text not null default 'fact'
    check (kind in ('decision', 'fact', 'preference')),
  content text not null,
  source text not null default 'assistant'
    check (source in ('assistant', 'user')),
  source_chat_id uuid references public.chats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_memories_project
  on public.project_memories(project_id, created_at desc);

revoke all on public.project_memories from anon, authenticated;
