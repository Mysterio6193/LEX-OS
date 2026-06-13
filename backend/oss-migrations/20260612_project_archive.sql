-- Matter archival (PRD CM-10): closed matters can be archived. Archived
-- matters are hidden from the default project list but stay fully
-- accessible (documents, chats, memory) and can be unarchived any time.

alter table public.projects
  add column if not exists archived_at timestamptz;
