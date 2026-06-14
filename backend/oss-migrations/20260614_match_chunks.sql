-- Dense retrieval RPC (v2 Phase 1c). Cosine similarity over document_chunks,
-- scoped to a set of accessible project ids. Called from the backend via
-- supabase.rpc('match_document_chunks', ...). Sparse (tsvector) retrieval is
-- done with PostgREST .textSearch; results are fused (RRF) in the app.

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_project_ids uuid[],
  match_count int default 50
)
returns table (
  id uuid,
  document_id uuid,
  project_id uuid,
  chunk_index int,
  parent_index int,
  text text,
  doc_type text,
  section_no text,
  para_no text,
  page int,
  score double precision
)
language sql
stable
as $$
  select
    c.id, c.document_id, c.project_id, c.chunk_index, c.parent_index,
    c.text, c.doc_type, c.section_no, c.para_no, c.page,
    1 - (c.embedding <=> query_embedding) as score
  from public.document_chunks c
  where c.embedding is not null
    and (match_project_ids is null or c.project_id = any (match_project_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_document_chunks(vector, uuid[], int)
  from anon, authenticated;
