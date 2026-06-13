-- Court hearings / cause-list tracker (India litigation).
-- The assistant records hearings via the save_hearing tool; users manage
-- them in the project's Hearings tab. Upcoming hearings are injected into
-- every project chat's system prompt so the assistant stays hearing-aware.

create table if not exists public.project_hearings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  purpose text not null,
  court text,
  case_number text,
  hearing_date date not null,
  notes text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'adjourned', 'done')),
  source text not null default 'user'
    check (source in ('assistant', 'user')),
  source_chat_id uuid references public.chats(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_hearings_project
  on public.project_hearings(project_id, hearing_date);

revoke all on public.project_hearings from anon, authenticated;
