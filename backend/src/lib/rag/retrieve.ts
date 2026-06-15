/**
 * Hybrid retrieval (v2 Phase 1c).
 *
 * Dense (pgvector cosine via the match_document_chunks RPC) + sparse
 * (tsvector websearch) retrieval, fused with Reciprocal Rank Fusion, then
 * optionally reranked by a cross-encoder. Returns span-grounded hits so the
 * model can cite to a document + page/section/para. Degrades gracefully:
 * with no embedding key it is sparse-only; with no rerank key it keeps RRF
 * order.
 */

import type { createServerSupabase } from "../supabase";
import { embedTexts, toVectorLiteral } from "../llm/embeddings";
import { rerank } from "../llm/rerank";
import type { UserApiKeys } from "../llm/types";

type Db = ReturnType<typeof createServerSupabase>;

export type RetrievalHit = {
  chunk_id: string;
  document_id: string;
  project_id: string | null;
  parent_index: number | null;
  text: string;
  doc_type: string | null;
  section_no: string | null;
  para_no: string | null;
  page: number | null;
  score: number;
};

const CANDIDATES = 50;
const DEFAULT_TOP_K = 8;

/**
 * Reciprocal Rank Fusion. Pure — given ranked id lists, returns a fused
 * score per id (higher = better). k dampens the contribution of low ranks.
 */
export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

type ChunkRow = {
  id: string;
  document_id: string;
  project_id: string | null;
  parent_index: number | null;
  text: string;
  doc_type: string | null;
  section_no: string | null;
  para_no: string | null;
  page: number | null;
};

const SELECT_COLS =
  "id, document_id, project_id, parent_index, text, doc_type, section_no, para_no, page";

export async function hybridRetrieve(args: {
  query: string;
  projectIds: string[];
  /** When set, restrict retrieval to these documents (e.g. a vault). */
  documentIds?: string[];
  db: Db;
  apiKeys?: UserApiKeys;
  limit?: number;
}): Promise<RetrievalHit[]> {
  const { db, query } = args;
  const topK = args.limit ?? DEFAULT_TOP_K;
  const scopeByDocs = !!args.documentIds && args.documentIds.length > 0;
  if (!query.trim()) return [];
  if (!scopeByDocs && args.projectIds.length === 0) return [];

  // --- Dense (best-effort; skipped when no embedding key) ---
  const embed = await embedTexts([query], args.apiKeys);
  const denseRows: ChunkRow[] = [];
  if (embed?.embeddings?.[0]) {
    const { data } = scopeByDocs
      ? await db.rpc("match_chunks_in_documents", {
          query_embedding: toVectorLiteral(embed.embeddings[0]),
          match_document_ids: args.documentIds,
          match_count: CANDIDATES,
        })
      : await db.rpc("match_document_chunks", {
          query_embedding: toVectorLiteral(embed.embeddings[0]),
          match_project_ids: args.projectIds,
          match_count: CANDIDATES,
        });
    for (const r of (data ?? []) as ChunkRow[]) denseRows.push(r);
  }

  // --- Sparse (tsvector websearch) ---
  const sparseBase = db
    .from("document_chunks")
    .select(SELECT_COLS)
    .textSearch("tsv", query, { type: "websearch" })
    .limit(CANDIDATES);
  const { data: sparseData } = scopeByDocs
    ? await sparseBase.in("document_id", args.documentIds as string[])
    : await sparseBase.in("project_id", args.projectIds);
  const sparseRows = (sparseData ?? []) as ChunkRow[];

  // Index rows by id and fuse the two rankings.
  const byId = new Map<string, ChunkRow>();
  for (const r of denseRows) byId.set(r.id, r);
  for (const r of sparseRows) if (!byId.has(r.id)) byId.set(r.id, r);
  if (byId.size === 0) return [];

  const fused = reciprocalRankFusion([
    denseRows.map((r) => r.id),
    sparseRows.map((r) => r.id),
  ]);
  let orderedIds = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  // --- Optional cross-encoder rerank over the fused candidates ---
  const candidates = orderedIds
    .slice(0, CANDIDATES)
    .map((id) => ({ id, text: byId.get(id)?.text ?? "" }));
  const reranked = await rerank(query, candidates, topK);
  if (reranked) {
    orderedIds = reranked.map((r) => r.id).filter(Boolean);
  }

  return orderedIds
    .slice(0, topK)
    .map((id) => {
      const r = byId.get(id);
      if (!r) return null;
      return {
        chunk_id: r.id,
        document_id: r.document_id,
        project_id: r.project_id,
        parent_index: r.parent_index,
        text: r.text,
        doc_type: r.doc_type,
        section_no: r.section_no,
        para_no: r.para_no,
        page: r.page,
        score: fused.get(id) ?? 0,
      } satisfies RetrievalHit;
    })
    .filter((h): h is RetrievalHit => h !== null);
}
