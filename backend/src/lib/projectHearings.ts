/**
 * Court hearings / cause-list tracker (India litigation).
 *
 * Hearings are saved by the assistant via the save_hearing tool or managed
 * by users through the project Hearings routes. Upcoming hearings are
 * injected into every project chat's system prompt so the assistant stays
 * hearing-aware. When a hearing omits court / case number, the matter's
 * court metadata is used as the default for the prompt block.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const HEARING_PURPOSE_MAX_CHARS = 300;
export const HEARING_FIELD_MAX_CHARS = 200;
export const HEARING_NOTES_MAX_CHARS = 2000;
/** Most imminent hearings injected into the chat system prompt. */
const HEARING_PROMPT_LIMIT = 25;

export type ProjectHearingRow = {
  id: string;
  project_id: string;
  user_id: string;
  purpose: string;
  court: string | null;
  case_number: string | null;
  hearing_date: string;
  notes: string | null;
  status: "scheduled" | "adjourned" | "done";
  source: "assistant" | "user";
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeHearingPurpose(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, HEARING_PURPOSE_MAX_CHARS);
}

export function normalizeHearingField(raw: unknown): string | null {
  const value = String(raw ?? "")
    .trim()
    .slice(0, HEARING_FIELD_MAX_CHARS);
  return value || null;
}

export function normalizeHearingNotes(raw: unknown): string | null {
  const notes = String(raw ?? "")
    .trim()
    .slice(0, HEARING_NOTES_MAX_CHARS);
  return notes || null;
}

/** Accepts only ISO YYYY-MM-DD strings that parse to a real calendar date. */
export function normalizeHearingDate(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function normalizeHearingStatus(
  raw: unknown,
): "scheduled" | "adjourned" | "done" | null {
  const value = String(raw ?? "").trim();
  return value === "scheduled" || value === "adjourned" || value === "done"
    ? value
    : null;
}

export async function listProjectHearings(
  projectId: string,
  db: Db,
): Promise<ProjectHearingRow[]> {
  const { data } = await db
    .from("project_hearings")
    .select(
      "id, project_id, user_id, purpose, court, case_number, hearing_date, notes, status, source, source_chat_id, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("hearing_date", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as ProjectHearingRow[];
}

export async function saveProjectHearing(args: {
  projectId: string;
  userId: string;
  purpose: string;
  hearingDate: string;
  court?: string | null;
  caseNumber?: string | null;
  notes?: string | null;
  source: "assistant" | "user";
  sourceChatId?: string | null;
  db: Db;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const purpose = normalizeHearingPurpose(args.purpose);
  if (!purpose) return { ok: false, error: "Hearing purpose is required." };
  const hearingDate = normalizeHearingDate(args.hearingDate);
  if (!hearingDate) {
    return {
      ok: false,
      error: "hearing_date must be a valid date in YYYY-MM-DD format.",
    };
  }
  const { data, error } = await args.db
    .from("project_hearings")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      purpose,
      court: normalizeHearingField(args.court),
      case_number: normalizeHearingField(args.caseNumber),
      hearing_date: hearingDate,
      notes: normalizeHearingNotes(args.notes),
      source: args.source,
      source_chat_id: args.sourceChatId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: "Failed to save hearing." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Render the matter's upcoming hearings as a system-prompt block. Returns
 * "" when there are no scheduled/adjourned hearings so callers can append
 * unconditionally. Court / case number fall back to the matter's metadata.
 */
export async function buildHearingsPromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const hearings = await listProjectHearings(projectId, db);
  const pending = hearings.filter((h) => h.status !== "done");
  if (pending.length === 0) return "";

  const { data: project } = await db
    .from("projects")
    .select("court, case_number")
    .eq("id", projectId)
    .single();
  const matter = (project ?? {}) as {
    court?: string | null;
    case_number?: string | null;
  };

  const today = new Date().toISOString().slice(0, 10);
  const lines = pending.slice(0, HEARING_PROMPT_LIMIT).map((h) => {
    const overdue = h.hearing_date < today ? " (PAST)" : "";
    const court = h.court ?? matter.court ?? null;
    const caseNo = h.case_number ?? matter.case_number ?? null;
    const where = [court, caseNo].filter(Boolean).join(", ");
    const suffix = where ? ` — ${where}` : "";
    const adjourned = h.status === "adjourned" ? " [adjourned]" : "";
    return `- ${h.hearing_date}${overdue}: ${h.purpose}${adjourned}${suffix}`;
  });
  return `COURT HEARINGS (upcoming, soonest first; today is ${today}):
${lines.join("\n")}`;
}
