/**
 * Matter Deadlines — per-project deadline tracking (PRD WA-02).
 *
 * Deadlines are saved by the assistant via the save_deadline tool or
 * managed by users through the project Deadlines routes. Upcoming pending
 * deadlines are injected into every project chat's system prompt so the
 * assistant stays deadline-aware.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const DEADLINE_TITLE_MAX_CHARS = 300;
export const DEADLINE_NOTES_MAX_CHARS = 2000;
/** Most imminent pending deadlines injected into the chat system prompt. */
const DEADLINE_PROMPT_LIMIT = 25;

export type ProjectDeadlineRow = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  due_date: string;
  notes: string | null;
  status: "pending" | "done";
  source: "assistant" | "user";
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeDeadlineTitle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, DEADLINE_TITLE_MAX_CHARS);
}

export function normalizeDeadlineNotes(raw: unknown): string | null {
  const notes = String(raw ?? "")
    .trim()
    .slice(0, DEADLINE_NOTES_MAX_CHARS);
  return notes || null;
}

/** Accepts only ISO YYYY-MM-DD strings that parse to a real calendar date. */
export function normalizeDeadlineDueDate(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export async function listProjectDeadlines(
  projectId: string,
  db: Db,
): Promise<ProjectDeadlineRow[]> {
  const { data } = await db
    .from("project_deadlines")
    .select(
      "id, project_id, user_id, title, due_date, notes, status, source, source_chat_id, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as ProjectDeadlineRow[];
}

export async function saveProjectDeadline(args: {
  projectId: string;
  userId: string;
  title: string;
  dueDate: string;
  notes?: string | null;
  source: "assistant" | "user";
  sourceChatId?: string | null;
  db: Db;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = normalizeDeadlineTitle(args.title);
  if (!title) return { ok: false, error: "Deadline title is required." };
  const dueDate = normalizeDeadlineDueDate(args.dueDate);
  if (!dueDate) {
    return {
      ok: false,
      error: "due_date must be a valid date in YYYY-MM-DD format.",
    };
  }
  const { data, error } = await args.db
    .from("project_deadlines")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      title,
      due_date: dueDate,
      notes: normalizeDeadlineNotes(args.notes),
      source: args.source,
      source_chat_id: args.sourceChatId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Failed to save deadline." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Render the matter's upcoming deadlines as a system-prompt block. Returns
 * "" when the project has no pending deadlines so callers can append
 * unconditionally.
 */
export async function buildDeadlinePromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const deadlines = await listProjectDeadlines(projectId, db);
  const pending = deadlines.filter((d) => d.status === "pending");
  if (pending.length === 0) return "";
  const today = new Date().toISOString().slice(0, 10);
  const lines = pending.slice(0, DEADLINE_PROMPT_LIMIT).map((d) => {
    const overdue = d.due_date < today ? " (OVERDUE)" : "";
    const notes = d.notes ? ` — ${d.notes}` : "";
    return `- ${d.due_date}${overdue}: ${d.title}${notes}`;
  });
  return `MATTER DEADLINES (pending, soonest first; today is ${today}):
${lines.join("\n")}`;
}
