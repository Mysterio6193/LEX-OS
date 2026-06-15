-- Agentic core (v2 Phase 1d): persisted plan/execute/verify runs.
-- An agent_run is one autonomous task (a goal decomposed into a plan and
-- executed with verification); agent_steps capture the plan steps and their
-- outcomes for the streaming trace and later audit.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id text not null,
  chat_id uuid references public.chats(id) on delete set null,
  goal text not null,
  plan jsonb not null default '[]'::jsonb,
  status text not null default 'planning'
    check (status in ('planning', 'executing', 'verifying', 'done', 'error')),
  model text,
  tokens integer,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_project
  on public.agent_runs(project_id, created_at desc);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  idx integer not null,
  type text not null default 'tool'
    check (type in ('tool', 'reason')),
  tool text,
  intent text,
  input jsonb,
  output jsonb,
  citations jsonb,
  confidence numeric,
  verified boolean,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'error')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_steps_run
  on public.agent_steps(run_id, idx);

revoke all on public.agent_runs from anon, authenticated;
revoke all on public.agent_steps from anon, authenticated;
