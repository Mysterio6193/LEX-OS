/**
 * Matter Parties — entities connected to a matter (PRD CLM-07/WA-09).
 *
 * Parties are recorded by the assistant via the save_party tool or managed
 * by users through the project Parties routes. Known parties are injected
 * into every project chat's system prompt, and conflict checks match
 * candidate names against parties across all the user's matters.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const PARTY_NAME_MAX_CHARS = 200;
export const PARTY_NOTES_MAX_CHARS = 2000;
/** Parties injected into the chat system prompt. */
const PARTY_PROMPT_LIMIT = 50;

export const PARTY_ROLES = [
  "client",
  "counterparty",
  "opposing_counsel",
  "witness",
  "other",
] as const;

export type PartyRole = (typeof PARTY_ROLES)[number];

export type ProjectPartyRow = {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  role: PartyRole;
  notes: string | null;
  source: "assistant" | "user";
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizePartyName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, PARTY_NAME_MAX_CHARS);
}

export function normalizePartyRole(raw: unknown): PartyRole {
  const value = String(raw ?? "").trim().toLowerCase();
  return (PARTY_ROLES as readonly string[]).includes(value)
    ? (value as PartyRole)
    : "other";
}

export function normalizePartyNotes(raw: unknown): string | null {
  const notes = String(raw ?? "")
    .trim()
    .slice(0, PARTY_NOTES_MAX_CHARS);
  return notes || null;
}

export function partyRoleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

export async function listProjectParties(
  projectId: string,
  db: Db,
): Promise<ProjectPartyRow[]> {
  const { data } = await db
    .from("project_parties")
    .select(
      "id, project_id, user_id, name, role, notes, source, source_chat_id, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ProjectPartyRow[];
}

export async function saveProjectParty(args: {
  projectId: string;
  userId: string;
  name: string;
  role: string;
  notes?: string | null;
  source: "assistant" | "user";
  sourceChatId?: string | null;
  db: Db;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = normalizePartyName(args.name);
  if (!name) return { ok: false, error: "Party name is required." };
  const { data, error } = await args.db
    .from("project_parties")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      name,
      role: normalizePartyRole(args.role),
      notes: normalizePartyNotes(args.notes),
      source: args.source,
      source_chat_id: args.sourceChatId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Failed to save party." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Render the matter's known parties as a system-prompt block. Returns ""
 * when the project has no parties so callers can append unconditionally.
 */
export async function buildPartyPromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const parties = await listProjectParties(projectId, db);
  if (parties.length === 0) return "";
  const lines = parties.slice(0, PARTY_PROMPT_LIMIT).map((p) => {
    const notes = p.notes ? ` — ${p.notes}` : "";
    return `- ${p.name} (${partyRoleLabel(p.role)})${notes}`;
  });
  return `MATTER PARTIES (entities connected to this matter):
${lines.join("\n")}`;
}
