-- Matter Vault (v2 Phase 2): named document sets (data rooms / case bundles)
-- within a matter, for retrieval and review at scale. A vault groups existing
-- project documents; chunks are reused from document_chunks, so a vault is a
-- scoping layer over the Phase-1 RAG index.

create table if not exists public.vaults (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vaults_project on public.vaults(project_id);

create table if not exists public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (vault_id, document_id)
);

create index if not exists idx_vault_documents_vault
  on public.vault_documents(vault_id);

revoke all on public.vaults from anon, authenticated;
revoke all on public.vault_documents from anon, authenticated;

-- Dense retrieval scoped to an explicit set of documents (a vault).
create or replace function public.match_chunks_in_documents(
  query_embedding vector(1536),
  match_document_ids uuid[],
  match_count int default 50
)
returns table (
  id uuid, document_id uuid, project_id uuid, chunk_index int,
  parent_index int, text text, doc_type text, section_no text,
  para_no text, page int, score double precision
)
language sql stable as $$
  select
    c.id, c.document_id, c.project_id, c.chunk_index, c.parent_index,
    c.text, c.doc_type, c.section_no, c.para_no, c.page,
    1 - (c.embedding <=> query_embedding) as score
  from public.document_chunks c
  where c.embedding is not null
    and c.document_id = any (match_document_ids)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_chunks_in_documents(vector, uuid[], int)
  from anon, authenticated;
