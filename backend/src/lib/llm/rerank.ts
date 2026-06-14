/**
 * Cross-encoder reranking (v2 Phase 1c).
 *
 * Optional precision boost over hybrid retrieval. Uses a Cohere-style rerank
 * endpoint configured via env (RERANK_API_KEY, optional RERANK_URL/RERANK_MODEL).
 * Best-effort: returns null when no key is configured (or on error) so the
 * caller keeps the RRF order. Keeping this behind an env key avoids a schema
 * change and lets the reranker be self-hosted later for cost/residency.
 */

const RERANK_URL =
  process.env.RERANK_URL?.trim() || "https://api.cohere.com/v2/rerank";
const RERANK_MODEL = process.env.RERANK_MODEL?.trim() || "rerank-v3.5";

export type RerankInput = { id: string; text: string };

/**
 * Returns ids with relevance scores, highest first, limited to topN.
 * Null when reranking is unavailable.
 */
export async function rerank(
  query: string,
  docs: RerankInput[],
  topN: number,
): Promise<{ id: string; score: number }[] | null> {
  const key = process.env.RERANK_API_KEY?.trim();
  if (!key || docs.length === 0) return null;
  try {
    const res = await fetch(RERANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: docs.map((d) => d.text),
        top_n: Math.min(topN, docs.length),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results: { index: number; relevance_score: number }[];
    };
    return json.results.map((r) => ({
      id: docs[r.index]?.id,
      score: r.relevance_score,
    }));
  } catch {
    return null;
  }
}
