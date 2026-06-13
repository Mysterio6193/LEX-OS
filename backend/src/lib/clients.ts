/**
 * Client Memory — per-client profiles (PRD CLM-01/CLM-02).
 *
 * Each user maintains clients with free-form preference notes. Projects
 * link to a client via projects.client_id; the client's profile (notes plus
 * preference memories aggregated across all of that client's matters) is
 * injected into every linked project chat's system prompt so the assistant
 * applies known client preferences without being re-told.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const CLIENT_NAME_MAX_CHARS = 200;
export const CLIENT_NOTES_MAX_CHARS = 4000;
/** Preference memories pulled across the client's matters for the prompt. */
const CLIENT_PREFERENCE_PROMPT_LIMIT = 50;

export type ClientRow = {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeClientName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, CLIENT_NAME_MAX_CHARS);
}

export function normalizeClientNotes(raw: unknown): string | null {
  const notes = String(raw ?? "")
    .trim()
    .slice(0, CLIENT_NOTES_MAX_CHARS);
  return notes || null;
}

/**
 * Render the linked client's profile as a system-prompt block for a project
 * chat. Returns "" when the project has no client so callers can append
 * unconditionally.
 */
export async function buildClientPromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const { data: project } = await db
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single();
  const clientId = (project as { client_id?: string | null } | null)
    ?.client_id;
  if (!clientId) return "";

  const { data: client } = await db
    .from("clients")
    .select("id, name, notes")
    .eq("id", clientId)
    .single();
  if (!client) return "";
  const row = client as Pick<ClientRow, "id" | "name" | "notes">;

  // Preference memories saved in ANY of this client's matters apply to all
  // of them — that is what makes the profile cumulative across deals.
  const { data: clientProjects } = await db
    .from("projects")
    .select("id")
    .eq("client_id", clientId);
  const projectIds = ((clientProjects ?? []) as { id: string }[]).map(
    (p) => p.id,
  );
  let preferenceLines: string[] = [];
  if (projectIds.length > 0) {
    const { data: prefs } = await db
      .from("project_memories")
      .select("content, created_at")
      .in("project_id", projectIds)
      .eq("kind", "preference")
      .order("created_at", { ascending: true })
      .limit(CLIENT_PREFERENCE_PROMPT_LIMIT);
    preferenceLines = (
      (prefs ?? []) as { content: string; created_at: string }[]
    ).map((m) => `- (${m.created_at.slice(0, 10)}) ${m.content}`);
  }

  const parts = [
    `CLIENT PROFILE (this matter is for the client "${row.name}"):`,
    "Apply this client's known preferences without being re-told. Do not contradict them unless the user explicitly changes course.",
  ];
  if (row.notes) parts.push(`Notes:\n${row.notes}`);
  if (preferenceLines.length > 0) {
    parts.push(
      `Known preferences (saved across this client's matters):\n${preferenceLines.join("\n")}`,
    );
  }
  return parts.join("\n");
}
