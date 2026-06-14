/**
 * Document ingestion for RAG (v2 Phase 1b).
 *
 * Extracts a document's current-version text (reusing the existing pdfjs /
 * docx extractors), chunks it structure-aware, embeds the chunks (best
 * effort), and upserts them into `document_chunks` for hybrid retrieval.
 * Embedding is optional — when no provider key is available, chunks are
 * still stored with their sparse (tsvector) representation so keyword
 * retrieval works.
 */

import type { createServerSupabase } from "../supabase";
import { downloadFile } from "../storage";
import { extractPdfText } from "../chatTools";
import { extractDocxBodyText } from "../docxTrackedChanges";
import { chunkDocument } from "./chunker";
import { embedTexts, toVectorLiteral } from "../llm/embeddings";
import type { UserApiKeys } from "../llm/types";

type Db = ReturnType<typeof createServerSupabase>;

const INSERT_BATCH = 200;

export async function ingestDocumentText(args: {
  documentId: string;
  projectId: string | null;
  userId: string;
  filename: string;
  text: string;
  apiKeys?: UserApiKeys;
  db: Db;
}): Promise<{ ok: boolean; chunks: number }> {
  const chunks = chunkDocument({ text: args.text, filename: args.filename });
  if (chunks.length === 0) return { ok: true, chunks: 0 };

  const embedRes = await embedTexts(
    chunks.map((c) => c.text),
    args.apiKeys,
  );
  const vectors = embedRes?.embeddings ?? null;

  // Replace any prior chunks for this document (re-ingest is idempotent).
  await args.db
    .from("document_chunks")
    .delete()
    .eq("document_id", args.documentId);

  const rows = chunks.map((c, i) => ({
    document_id: args.documentId,
    project_id: args.projectId,
    user_id: args.userId,
    chunk_index: c.chunkIndex,
    parent_index: c.parentIndex,
    text: c.text,
    summary: null,
    embedding: vectors && vectors[i] ? toVectorLiteral(vectors[i]) : null,
    doc_type: c.docType,
    section_no: c.sectionNo,
    para_no: c.paraNo,
    page: c.page,
    metadata: c.metadata,
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await args.db
      .from("document_chunks")
      .insert(rows.slice(i, i + INSERT_BATCH));
    if (error) return { ok: false, chunks: 0 };
  }
  return { ok: true, chunks: rows.length };
}

/**
 * Load a document's current version from R2, extract its text, and ingest.
 * Best-effort and self-contained so callers can fire-and-forget after an
 * upload without blocking the response.
 */
export async function ingestDocumentById(args: {
  documentId: string;
  apiKeys?: UserApiKeys;
  db: Db;
}): Promise<{ ok: boolean; chunks: number }> {
  const { db, documentId } = args;
  const { data: doc } = await db
    .from("documents")
    .select("id, project_id, user_id, current_version_id")
    .eq("id", documentId)
    .single();
  const document = doc as {
    id: string;
    project_id: string | null;
    user_id: string;
    current_version_id: string | null;
  } | null;
  if (!document?.current_version_id) return { ok: false, chunks: 0 };

  const { data: ver } = await db
    .from("document_versions")
    .select("storage_path, file_type, filename")
    .eq("id", document.current_version_id)
    .single();
  const version = ver as {
    storage_path: string | null;
    file_type: string | null;
    filename: string | null;
  } | null;
  if (!version?.storage_path) return { ok: false, chunks: 0 };

  const buf = await downloadFile(version.storage_path);
  if (!buf) return { ok: false, chunks: 0 };

  const isPdf =
    (version.file_type ?? "").toLowerCase().includes("pdf") ||
    version.storage_path.toLowerCase().endsWith(".pdf");
  let text = "";
  try {
    text = isPdf
      ? await extractPdfText(buf)
      : await extractDocxBodyText(Buffer.from(buf));
  } catch {
    return { ok: false, chunks: 0 };
  }
  if (!text.trim()) return { ok: true, chunks: 0 };

  return ingestDocumentText({
    documentId: document.id,
    projectId: document.project_id,
    userId: document.user_id,
    filename: version.filename ?? "document",
    text,
    apiKeys: args.apiKeys,
    db,
  });
}
