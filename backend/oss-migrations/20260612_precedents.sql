-- Precedent Library (PRD FM-02): mark documents as firm precedents.
-- Precedent documents are loaded into every project chat's document
-- context (under "Precedent Library") so the assistant can read, cite,
-- and replicate them as drafting templates across matters.

alter table public.documents
  add column if not exists is_precedent boolean not null default false;

create index if not exists idx_documents_precedent
  on public.documents(user_id)
  where is_precedent;
