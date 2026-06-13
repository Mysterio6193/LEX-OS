/**
 * Firm knowledge search (PRD RA-03/FM-07/RA-06).
 *
 * Lets the assistant answer "how do we usually handle X" by keyword-
 * searching the caller's whole accessible universe — matter memories,
 * deadlines, checklist tasks, parties, clients, and document filenames
 * (with precedents flagged) — and returning snippets labeled with the
 * matter they came from. Read-only; respects project access via
 * listAccessibleProjectIds.
 */

import type { createServerSupabase } from "./supabase";
import { listAccessibleProjectIds } from "./access";

type Db = ReturnType<typeof createServerSupabase>;

const QUERY_MAX_CHARS = 200;
const PER_SOURCE_LIMIT = 10;
const TOTAL_LIMIT = 40;

export type FirmKnowledgeHit = {
  type: "memory" | "deadline" | "task" | "party" | "client" | "document";
  snippet: string;
  detail?: string;
  matter: { id: string; name: string } | null;
};

function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function clip(text: string, max = 240): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function searchFirmKnowledge(args: {
  query: string;
  userId: string;
  userEmail?: string | null;
  db: Db;
}): Promise<{ query: string; hits: FirmKnowledgeHit[] }> {
  const query = args.query.trim().slice(0, QUERY_MAX_CHARS);
  if (!query) return { query, hits: [] };
  const pattern = `%${escapeIlike(query)}%`;
  const { db } = args;

  const projectIds = await listAccessibleProjectIds(
    args.userId,
    args.userEmail,
    db,
  );

  const [
    { data: projects },
    { data: memories },
    { data: deadlines },
    { data: tasks },
    { data: parties },
    { data: clients },
    { data: versions },
  ] = await Promise.all([
    projectIds.length
      ? db.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db
          .from("project_memories")
          .select("project_id, kind, content")
          .in("project_id", projectIds)
          .ilike("content", pattern)
          .limit(PER_SOURCE_LIMIT)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db
          .from("project_deadlines")
          .select("project_id, title, due_date, status")
          .in("project_id", projectIds)
          .ilike("title", pattern)
          .limit(PER_SOURCE_LIMIT)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db
          .from("project_tasks")
          .select("project_id, title, status")
          .in("project_id", projectIds)
          .ilike("title", pattern)
          .limit(PER_SOURCE_LIMIT)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? db
          .from("project_parties")
          .select("project_id, name, role")
          .in("project_id", projectIds)
          .ilike("name", pattern)
          .limit(PER_SOURCE_LIMIT)
      : Promise.resolve({ data: [] }),
    db
      .from("clients")
      .select("name, notes")
      .eq("user_id", args.userId)
      .ilike("name", pattern)
      .limit(PER_SOURCE_LIMIT),
    db
      .from("document_versions")
      .select("document_id, filename")
      .ilike("filename", pattern)
      .is("deleted_at", null)
      .limit(PER_SOURCE_LIMIT * 5),
  ]);

  const projectById = new Map(
    ((projects ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  const matterOf = (projectId: string | null) => {
    if (!projectId) return null;
    const p = projectById.get(projectId);
    return p ? { id: p.id, name: p.name } : null;
  };

  const hits: FirmKnowledgeHit[] = [];

  for (const m of (memories ?? []) as {
    project_id: string;
    kind: string;
    content: string;
  }[]) {
    hits.push({
      type: "memory",
      snippet: clip(m.content),
      detail: m.kind,
      matter: matterOf(m.project_id),
    });
  }

  for (const d of (deadlines ?? []) as {
    project_id: string;
    title: string;
    due_date: string;
    status: string;
  }[]) {
    hits.push({
      type: "deadline",
      snippet: clip(d.title),
      detail: `due ${d.due_date}${d.status === "done" ? " (done)" : ""}`,
      matter: matterOf(d.project_id),
    });
  }

  for (const t of (tasks ?? []) as {
    project_id: string;
    title: string;
    status: string;
  }[]) {
    hits.push({
      type: "task",
      snippet: clip(t.title),
      detail: t.status,
      matter: matterOf(t.project_id),
    });
  }

  for (const p of (parties ?? []) as {
    project_id: string;
    name: string;
    role: string;
  }[]) {
    hits.push({
      type: "party",
      snippet: p.name,
      detail: p.role.replace(/_/g, " "),
      matter: matterOf(p.project_id),
    });
  }

  for (const c of (clients ?? []) as {
    name: string;
    notes: string | null;
  }[]) {
    hits.push({
      type: "client",
      snippet: c.name,
      detail: c.notes ? clip(c.notes, 160) : undefined,
      matter: null,
    });
  }

  // Filename matches come back unscoped; keep only documents in accessible
  // projects (or the caller's own standalone docs) and dedupe per document.
  const versionRows = (versions ?? []) as {
    document_id: string;
    filename: string | null;
  }[];
  const docIds = [...new Set(versionRows.map((v) => v.document_id))];
  if (docIds.length) {
    const { data: docs } = await db
      .from("documents")
      .select("id, project_id, user_id, is_precedent")
      .in("id", docIds);
    const accessible = new Set(projectIds);
    const filenameByDoc = new Map<string, string>();
    for (const v of versionRows) {
      if (v.filename && !filenameByDoc.has(v.document_id)) {
        filenameByDoc.set(v.document_id, v.filename);
      }
    }
    let docHits = 0;
    for (const doc of (docs ?? []) as {
      id: string;
      project_id: string | null;
      user_id: string;
      is_precedent: boolean;
    }[]) {
      if (docHits >= PER_SOURCE_LIMIT) break;
      const ok =
        doc.user_id === args.userId ||
        (doc.project_id && accessible.has(doc.project_id));
      if (!ok) continue;
      const filename = filenameByDoc.get(doc.id);
      if (!filename) continue;
      hits.push({
        type: "document",
        snippet: filename,
        detail: doc.is_precedent ? "precedent" : undefined,
        matter: matterOf(doc.project_id),
      });
      docHits += 1;
    }
  }

  return { query, hits: hits.slice(0, TOTAL_LIMIT) };
}
