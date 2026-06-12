/**
 * Matter Checklists — per-project task tracking (PRD CM-07/FM-03/WA-04).
 *
 * Tasks are saved by the assistant via the save_task tool, managed by
 * users through the project Tasks routes, or seeded from a matter
 * template. Pending tasks are injected into every project chat's system
 * prompt so the assistant stays aware of open work.
 */

import type { createServerSupabase } from "./supabase";
import { getMatterTemplate } from "./matterTemplates";

type Db = ReturnType<typeof createServerSupabase>;

export const TASK_TITLE_MAX_CHARS = 300;
export const TASK_NOTES_MAX_CHARS = 2000;
/** Pending tasks injected into the chat system prompt. */
const TASK_PROMPT_LIMIT = 30;

export type ProjectTaskRow = {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: "pending" | "done";
  position: number;
  source: "assistant" | "user" | "template";
  template_id: string | null;
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeTaskTitle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, TASK_TITLE_MAX_CHARS);
}

export function normalizeTaskNotes(raw: unknown): string | null {
  const notes = String(raw ?? "")
    .trim()
    .slice(0, TASK_NOTES_MAX_CHARS);
  return notes || null;
}

export async function listProjectTasks(
  projectId: string,
  db: Db,
): Promise<ProjectTaskRow[]> {
  const { data } = await db
    .from("project_tasks")
    .select(
      "id, project_id, user_id, title, notes, status, position, source, template_id, source_chat_id, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as ProjectTaskRow[];
}

async function nextTaskPosition(projectId: string, db: Db): Promise<number> {
  const { data } = await db
    .from("project_tasks")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  const max = (data ?? [])[0]?.position;
  return typeof max === "number" ? max + 1 : 0;
}

export async function saveProjectTask(args: {
  projectId: string;
  userId: string;
  title: string;
  notes?: string | null;
  source: "assistant" | "user";
  sourceChatId?: string | null;
  db: Db;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = normalizeTaskTitle(args.title);
  if (!title) return { ok: false, error: "Task title is required." };
  const position = await nextTaskPosition(args.projectId, args.db);
  const { data, error } = await args.db
    .from("project_tasks")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      title,
      notes: normalizeTaskNotes(args.notes),
      position,
      source: args.source,
      source_chat_id: args.sourceChatId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Failed to save task." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Seed a matter template's tasks into a project. Idempotent: titles that
 * already exist in the project (case-insensitive) are skipped, so applying
 * a template twice doesn't duplicate the checklist.
 */
export async function applyMatterTemplate(args: {
  projectId: string;
  userId: string;
  templateId: string;
  db: Db;
}): Promise<
  | { ok: true; added: number }
  | { ok: false; error: string }
> {
  const template = getMatterTemplate(args.templateId);
  if (!template) return { ok: false, error: "Unknown template." };

  const existing = await listProjectTasks(args.projectId, args.db);
  const existingTitles = new Set(
    existing.map((t) => t.title.trim().toLowerCase()),
  );
  const newTitles = template.tasks.filter(
    (title) => !existingTitles.has(title.trim().toLowerCase()),
  );
  if (newTitles.length === 0) return { ok: true, added: 0 };

  let position = await nextTaskPosition(args.projectId, args.db);
  const rows = newTitles.map((title) => ({
    project_id: args.projectId,
    user_id: args.userId,
    title: normalizeTaskTitle(title),
    position: position++,
    source: "template" as const,
    template_id: template.id,
  }));
  const { error } = await args.db.from("project_tasks").insert(rows);
  if (error) return { ok: false, error: "Failed to apply template." };
  return { ok: true, added: rows.length };
}

/**
 * Render the matter's open checklist items as a system-prompt block.
 * Returns "" when nothing is pending so callers can append unconditionally.
 */
export async function buildTaskPromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const tasks = await listProjectTasks(projectId, db);
  const pending = tasks.filter((t) => t.status === "pending");
  if (pending.length === 0) return "";
  const lines = pending.slice(0, TASK_PROMPT_LIMIT).map((t) => {
    const notes = t.notes ? ` — ${t.notes}` : "";
    return `- ${t.title}${notes}`;
  });
  return `MATTER CHECKLIST (pending tasks):
${lines.join("\n")}`;
}
