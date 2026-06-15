-- Agent Builder (v2 Phase 3b): user-defined agent workflows.
-- Firms codify their own multi-step playbooks (beyond the built-in India
-- library). A workflow's steps seed the agent's plan deterministically.
-- Distinct from the tabular `workflows` table (review column templates).

create table if not exists public.agent_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text,
  practice text,
  steps jsonb not null default '[]'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_workflows_user
  on public.agent_workflows(user_id);

revoke all on public.agent_workflows from anon, authenticated;
