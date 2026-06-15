/**
 * Agent run/step persistence (v2 Phase 1d). Best-effort — failures never
 * break the chat turn; the run record is for the trace, history, and audit.
 */

import type { createServerSupabase } from "../supabase";
import type { AgentPlan, AgentVerification } from "./types";

type Db = ReturnType<typeof createServerSupabase>;

export async function createAgentRun(args: {
  projectId: string;
  userId: string;
  chatId: string | null;
  goal: string;
  plan: AgentPlan;
  model: string;
  db: Db;
}): Promise<string | null> {
  try {
    const { data } = await args.db
      .from("agent_runs")
      .insert({
        project_id: args.projectId,
        user_id: args.userId,
        chat_id: args.chatId,
        goal: args.goal.slice(0, 4000),
        plan: args.plan.steps,
        status: "executing",
        model: args.model,
      })
      .select("id")
      .single();
    const runId = (data as { id: string } | null)?.id ?? null;
    if (runId) {
      await args.db.from("agent_steps").insert(
        args.plan.steps.map((s) => ({
          run_id: runId,
          idx: s.idx,
          type: s.type,
          tool: s.tool ?? null,
          intent: s.intent,
          status: "pending",
        })),
      );
    }
    return runId;
  } catch {
    return null;
  }
}

export async function finalizeAgentRun(args: {
  runId: string | null;
  verification: AgentVerification;
  status: "done" | "error";
  db: Db;
}): Promise<void> {
  if (!args.runId) return;
  try {
    await args.db
      .from("agent_runs")
      .update({
        status: args.status,
        confidence: args.verification.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.runId);
  } catch {
    /* best-effort */
  }
}
