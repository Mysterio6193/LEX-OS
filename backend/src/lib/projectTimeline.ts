/**
 * Matter Timeline (PRD CM-06/MW-06) — chronological view of all matter
 * activity, aggregated on the fly from the existing domain tables (no
 * dedicated activity log). Each source is queried independently with the
 * same `before` cursor and limit, merged in memory, and trimmed, so a page
 * is complete even when one source dominates the window.
 */

import type { createServerSupabase } from "./supabase";
import { partyRoleLabel } from "./projectParties";

type Db = ReturnType<typeof createServerSupabase>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type TimelineEventType =
  | "document_created"
  | "document_version"
  | "chat_created"
  | "memory_saved"
  | "deadline_created"
  | "party_added";

export type TimelineEvent = {
  /** `${type}:${rowId}` — stable across pages. */
  id: string;
  type: TimelineEventType;
  /** ISO timestamp. */
  at: string;
  title: string;
  detail?: string;
  refs?: { document_id?: string; chat_id?: string; version_id?: string };
};

const VERSION_SOURCE_LABELS: Record<string, string> = {
  user_upload: "New version uploaded",
  assistant_edit: "Assistant edits proposed",
  user_accept: "Edits accepted",
  user_reject: "Edits rejected",
};

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function loadProjectTimeline(args: {
  projectId: string;
  db: Db;
  limit?: number;
  before?: string | null;
}): Promise<{ events: TimelineEvent[]; next_before: string | null }> {
  const { projectId, db } = args;
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const before = args.before ?? null;

  const applyWindow = <
    T extends {
      lt: (col: string, v: string) => T;
      order: (col: string, opts: { ascending: boolean }) => T;
      limit: (n: number) => T;
    },
  >(
    query: T,
  ): T => {
    const windowed = before ? query.lt("created_at", before) : query;
    return windowed
      .order("created_at", { ascending: false })
      .limit(limit);
  };

  // Documents are fetched without the cursor: version rows (needed for
  // filenames) hang off documents that may themselves be older than the
  // page window.
  const [
    { data: documents },
    { data: chats },
    { data: memories },
    { data: deadlines },
    { data: parties },
  ] = await Promise.all([
    db
      .from("documents")
      .select("id, created_at")
      .eq("project_id", projectId),
    applyWindow(
      db.from("chats").select("id, title, created_at").eq("project_id", projectId),
    ),
    applyWindow(
      db
        .from("project_memories")
        .select("id, kind, content, created_at")
        .eq("project_id", projectId),
    ),
    applyWindow(
      db
        .from("project_deadlines")
        .select("id, title, due_date, created_at")
        .eq("project_id", projectId),
    ),
    applyWindow(
      db
        .from("project_parties")
        .select("id, name, role, created_at")
        .eq("project_id", projectId),
    ),
  ]);

  const docRows = (documents ?? []) as { id: string; created_at: string }[];
  const docIds = docRows.map((d) => d.id);
  const { data: versions } = docIds.length
    ? await db
        .from("document_versions")
        .select("id, document_id, filename, source, created_at")
        .in("document_id", docIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
    : { data: [] };
  const versionRows = (versions ?? []) as {
    id: string;
    document_id: string;
    filename: string | null;
    source: string;
    created_at: string;
  }[];

  const firstFilenameByDoc = new Map<string, string>();
  for (const v of versionRows) {
    if (!firstFilenameByDoc.has(v.document_id) && v.filename) {
      firstFilenameByDoc.set(v.document_id, v.filename);
    }
  }

  const events: TimelineEvent[] = [];

  for (const doc of docRows) {
    if (before && doc.created_at >= before) continue;
    events.push({
      id: `document_created:${doc.id}`,
      type: "document_created",
      at: doc.created_at,
      title: firstFilenameByDoc.get(doc.id) ?? "Untitled document",
      detail: "Document added",
      refs: { document_id: doc.id },
    });
  }

  for (const v of versionRows) {
    const label = VERSION_SOURCE_LABELS[v.source];
    // Initial 'upload' / 'generated' rows duplicate document_created.
    if (!label) continue;
    if (before && v.created_at >= before) continue;
    events.push({
      id: `document_version:${v.id}`,
      type: "document_version",
      at: v.created_at,
      title:
        v.filename ??
        firstFilenameByDoc.get(v.document_id) ??
        "Untitled document",
      detail: label,
      refs: { document_id: v.document_id, version_id: v.id },
    });
  }

  for (const chat of (chats ?? []) as {
    id: string;
    title: string | null;
    created_at: string;
  }[]) {
    events.push({
      id: `chat_created:${chat.id}`,
      type: "chat_created",
      at: chat.created_at,
      title: chat.title?.trim() || "New chat",
      detail: "Chat started",
      refs: { chat_id: chat.id },
    });
  }

  for (const memory of (memories ?? []) as {
    id: string;
    kind: string;
    content: string;
    created_at: string;
  }[]) {
    events.push({
      id: `memory_saved:${memory.id}`,
      type: "memory_saved",
      at: memory.created_at,
      title: truncate(memory.content, 140),
      detail: `Saved to memory (${memory.kind})`,
    });
  }

  for (const deadline of (deadlines ?? []) as {
    id: string;
    title: string;
    due_date: string;
    created_at: string;
  }[]) {
    events.push({
      id: `deadline_created:${deadline.id}`,
      type: "deadline_created",
      at: deadline.created_at,
      title: deadline.title,
      detail: `Deadline — due ${deadline.due_date}`,
    });
  }

  for (const party of (parties ?? []) as {
    id: string;
    name: string;
    role: string;
    created_at: string;
  }[]) {
    events.push({
      id: `party_added:${party.id}`,
      type: "party_added",
      at: party.created_at,
      title: party.name,
      detail: `Party recorded (${partyRoleLabel(party.role)})`,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const hasMore = events.length > limit;
  const page = events.slice(0, limit);
  return {
    events: page,
    next_before: hasMore && page.length ? page[page.length - 1].at : null,
  };
}
