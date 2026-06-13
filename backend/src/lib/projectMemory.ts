/**
 * Matter Memory — persistent per-project memory entries.
 *
 * Entries (decisions, facts, preferences) are saved by the assistant via
 * the save_memory tool or curated by users through the project Memory
 * routes, then injected into every project chat's system prompt so the
 * assistant retains matter context across sessions.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const MEMORY_KINDS = ["decision", "fact", "preference"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_CONTENT_MAX_CHARS = 2000;
/** Most recent entries injected into the chat system prompt. */
const MEMORY_PROMPT_LIMIT = 100;

export type ProjectMemoryRow = {
  id: string;
  project_id: string;
  user_id: string;
  kind: MemoryKind;
  content: string;
  source: "assistant" | "user";
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeMemoryKind(raw: unknown): MemoryKind {
  return MEMORY_KINDS.includes(raw as MemoryKind)
    ? (raw as MemoryKind)
    : "fact";
}

export function normalizeMemoryContent(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, MEMORY_CONTENT_MAX_CHARS);
}

export async function listProjectMemories(
  projectId: string,
  db: Db,
): Promise<ProjectMemoryRow[]> {
  const { data } = await db
    .from("project_memories")
    .select(
      "id, project_id, user_id, kind, content, source, source_chat_id, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ProjectMemoryRow[];
}

export async function saveProjectMemory(args: {
  projectId: string;
  userId: string;
  kind: MemoryKind;
  content: string;
  source: "assistant" | "user";
  sourceChatId?: string | null;
  db: Db;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const content = normalizeMemoryContent(args.content);
  if (!content) return { ok: false, error: "Memory content is required." };
  const { data, error } = await args.db
    .from("project_memories")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      kind: args.kind,
      content,
      source: args.source,
      source_chat_id: args.sourceChatId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Failed to save memory." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Render the matter's memory as a system-prompt block. Returns "" when the
 * project has no memory so callers can append unconditionally.
 */
export async function buildMemoryPromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const memories = await listProjectMemories(projectId, db);
  if (memories.length === 0) return "";
  const lines = memories
    .slice(0, MEMORY_PROMPT_LIMIT)
    .reverse() // chronological order reads naturally in the prompt
    .map((m) => {
      const date = m.created_at.slice(0, 10);
      return `- [${m.kind}] (${date}) ${m.content}`;
    });
  return `MATTER MEMORY (persistent, saved in earlier sessions):
Treat these entries as established context for this matter. Do not ask the user to re-explain them, and do not contradict them unless the user explicitly changes course. Do not re-save entries that are already listed here.
${lines.join("\n")}`;
}
