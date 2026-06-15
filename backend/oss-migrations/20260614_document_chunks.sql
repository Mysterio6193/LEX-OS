-- RAG foundation (v2 Phase 1b): structure-aware document chunks with dense
-- (pgvector) + sparse (tsvector) representations for hybrid retrieval.
--
-- The embedding dimension is fixed at 1536 (OpenAI text-embedding-3-small,
-- the default). If you switch embedding providers/models, the model's
-- output dimensionality MUST match this column (set EMBEDDING_DIM and the
-- provider's outputDimensionality accordingly), or re-create the column.

create extension if not exists vector;

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id text not null,
  chunk_index integer not null,
  parent_index integer,
  text text not null,
  summary text,
  embedding vector(1536),
  tsv tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored,
  doc_type text,
  section_no text,
  para_no text,
  page integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_chunks_document
  on public.document_chunks(document_id);

create index if not exists idx_document_chunks_project
  on public.document_chunks(project_id);

create index if not exists idx_document_chunks_tsv
  on public.document_chunks using gin (tsv);

-- Approximate-nearest-neighbour index for cosine similarity. HNSW is
-- preferred where available; ivfflat is the fallback.
do $$
begin
  begin
    create index if not exists idx_document_chunks_embedding_hnsw
      on public.document_chunks using hnsw (embedding vector_cosine_ops);
  exception when others then
    create index if not exists idx_document_chunks_embedding_ivf
      on public.document_chunks using ivfflat (embedding vector_cosine_ops)
      with (lists = 100);
  end;
end;
$$;

revoke all on public.document_chunks from anon, authenticated;
