/**
 * Embeddings abstraction (v2 Phase 1b).
 *
 * Provider-agnostic text embedding for RAG. Best-effort: returns null when
 * no provider key is available so ingestion/retrieval degrade gracefully to
 * sparse (tsvector) only. The output dimension is fixed (EMBEDDING_DIM) to
 * match the `document_chunks.embedding vector(1536)` column — both OpenAI
 * (`dimensions`) and Gemini (`outputDimensionality`) are asked to emit it.
 */

import type { UserApiKeys } from "./types";

export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || "1536") || 1536;

export type EmbedResult = { embeddings: number[][]; model: string } | null;

function resolveKey(
  override: string | null | undefined,
  envName: string,
): string | null {
  return override?.trim() || process.env[envName]?.trim() || null;
}

/**
 * Embed a batch of texts. Prefers OpenAI, falls back to Gemini, then null.
 * Throwing is avoided — network/credential failures resolve to null so the
 * caller can proceed with sparse-only indexing/retrieval.
 */
export async function embedTexts(
  texts: string[],
  apiKeys?: UserApiKeys,
): Promise<EmbedResult> {
  if (texts.length === 0) return { embeddings: [], model: EMBEDDING_MODEL };

  const openaiKey = resolveKey(apiKeys?.openai, "OPENAI_API_KEY");
  if (openaiKey) {
    try {
      return await embedOpenAI(texts, openaiKey);
    } catch {
      /* fall through */
    }
  }
  const geminiKey = resolveKey(apiKeys?.gemini, "GEMINI_API_KEY");
  if (geminiKey) {
    try {
      return await embedGemini(texts, geminiKey);
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function embedOpenAI(
  texts: string[],
  key: string,
): Promise<EmbedResult> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}`);
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  const ordered = [...json.data].sort((a, b) => a.index - b.index);
  return { embeddings: ordered.map((d) => d.embedding), model: EMBEDDING_MODEL };
}

async function embedGemini(
  texts: string[],
  key: string,
): Promise<EmbedResult> {
  const model = "text-embedding-004";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${model}`,
          content: { parts: [{ text: t }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini embeddings ${res.status}`);
  const json = (await res.json()) as {
    embeddings: { values: number[] }[];
  };
  return {
    embeddings: json.embeddings.map((e) => e.values),
    model,
  };
}

/** pgvector literal for a Postgres `vector` column (PostgREST accepts the string form). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
