/**
 * Matter court / forum metadata (India litigation).
 *
 * The cause-title basics recorded on a matter (matter type, court, case
 * number, jurisdiction, filing date) are injected into every project chat
 * so the assistant knows the forum it is operating before.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

type CourtMetaRow = {
  matter_type: string | null;
  court: string | null;
  case_number: string | null;
  jurisdiction: string | null;
  filing_date: string | null;
};

/**
 * Render the matter's court/forum metadata as a system-prompt block.
 * Returns "" when no fields are set so callers can append unconditionally.
 */
export async function buildMatterDetailsPromptBlock(
  projectId: string,
  db: Db,
): Promise<string> {
  const { data } = await db
    .from("projects")
    .select("matter_type, court, case_number, jurisdiction, filing_date")
    .eq("id", projectId)
    .single();
  if (!data) return "";
  const meta = data as CourtMetaRow;
  const lines: string[] = [];
  if (meta.matter_type) lines.push(`- Matter type: ${meta.matter_type}`);
  if (meta.court) lines.push(`- Court / forum: ${meta.court}`);
  if (meta.case_number) lines.push(`- Case number: ${meta.case_number}`);
  if (meta.jurisdiction) lines.push(`- Jurisdiction: ${meta.jurisdiction}`);
  if (meta.filing_date) lines.push(`- Filing date: ${meta.filing_date}`);
  if (lines.length === 0) return "";
  return `MATTER DETAILS:
${lines.join("\n")}`;
}
