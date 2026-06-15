/**
 * Agent Builder (v2 Phase 3b): user-defined agent workflows.
 *
 * Firms codify their own multi-step playbooks; steps seed the agent's plan
 * the same deterministic way the built-in India library does. Steps are
 * validated against the tool registry so a workflow can only name real
 * tools. `resolveAgentWorkflow` unifies built-in and custom lookups for the
 * planner.
 */

import type { createServerSupabase } from "./supabase";
import { getToolEntry } from "./agent/registry";
import {
  AGENT_WORKFLOWS,
  getAgentWorkflow,
  type AgentWorkflow,
  type AgentWorkflowStep,
} from "./agentWorkflows";

type Db = ReturnType<typeof createServerSupabase>;

export const WF_NAME_MAX = 200;
export const WF_DESC_MAX = 2000;
export const WF_INTENT_MAX = 300;
export const WF_MAX_STEPS = 20;

const COLUMNS =
  "id, user_id, name, description, practice, steps, is_shared, created_at, updated_at";

export type CustomAgentWorkflowRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  practice: string | null;
  steps: AgentWorkflowStep[];
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

export function normalizeName(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, WF_NAME_MAX);
}

/**
 * Sanitize builder steps: trim intents, keep only tool names that exist in
 * the registry (unknown tools become reason steps), cap the step count.
 */
export function normalizeSteps(raw: unknown): AgentWorkflowStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: AgentWorkflowStep[] = [];
  for (const item of raw.slice(0, WF_MAX_STEPS)) {
    const intent = String((item as { intent?: unknown })?.intent ?? "")
      .trim()
      .slice(0, WF_INTENT_MAX);
    if (!intent) continue;
    const toolRaw = (item as { tool?: unknown })?.tool;
    const tool =
      typeof toolRaw === "string" && getToolEntry(toolRaw) ? toolRaw : null;
    steps.push({ intent, tool });
  }
  return steps;
}

function rowToWorkflow(
  r: CustomAgentWorkflowRow,
): AgentWorkflow & { is_custom: true; is_shared: boolean } {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    practice: r.practice ?? "Custom",
    steps: Array.isArray(r.steps) ? r.steps : [],
    is_custom: true,
    is_shared: r.is_shared,
  };
}

export async function listCustomWorkflows(
  userId: string,
  db: Db,
): Promise<(AgentWorkflow & { is_custom: true; is_shared: boolean })[]> {
  const { data } = await db
    .from("agent_workflows")
    .select(COLUMNS)
    .or(`user_id.eq.${userId},is_shared.eq.true`)
    .order("created_at", { ascending: false });
  return ((data ?? []) as CustomAgentWorkflowRow[]).map(rowToWorkflow);
}

export async function createCustomWorkflow(args: {
  userId: string;
  name: string;
  description?: string;
  practice?: string;
  steps: unknown;
  isShared?: boolean;
  db: Db;
}): Promise<{ ok: true; row: CustomAgentWorkflowRow } | { ok: false; error: string }> {
  const name = normalizeName(args.name);
  if (!name) return { ok: false, error: "Workflow name is required." };
  const steps = normalizeSteps(args.steps);
  if (steps.length === 0)
    return { ok: false, error: "Add at least one step." };
  const { data, error } = await args.db
    .from("agent_workflows")
    .insert({
      user_id: args.userId,
      name,
      description: args.description?.trim().slice(0, WF_DESC_MAX) || null,
      practice: args.practice?.trim().slice(0, 100) || null,
      steps,
      is_shared: !!args.isShared,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: "Failed to save workflow." };
  return { ok: true, row: data as CustomAgentWorkflowRow };
}

export async function updateCustomWorkflow(args: {
  id: string;
  userId: string;
  name?: string;
  description?: string | null;
  practice?: string | null;
  steps?: unknown;
  isShared?: boolean;
  db: Db;
}): Promise<CustomAgentWorkflowRow | null> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (args.name !== undefined) {
    const n = normalizeName(args.name);
    if (!n) return null;
    updates.name = n;
  }
  if (args.description !== undefined)
    updates.description =
      args.description?.trim().slice(0, WF_DESC_MAX) || null;
  if (args.practice !== undefined)
    updates.practice = args.practice?.trim().slice(0, 100) || null;
  if (args.steps !== undefined) updates.steps = normalizeSteps(args.steps);
  if (args.isShared !== undefined) updates.is_shared = !!args.isShared;

  const { data } = await args.db
    .from("agent_workflows")
    .update(updates)
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .select(COLUMNS)
    .single();
  return (data as CustomAgentWorkflowRow | null) ?? null;
}

export async function deleteCustomWorkflow(
  id: string,
  userId: string,
  db: Db,
): Promise<void> {
  await db
    .from("agent_workflows")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
}

/**
 * Resolve a workflow id to its definition for the planner: built-in library
 * first, then a custom workflow the user owns or that is firm-shared.
 */
export async function resolveAgentWorkflow(
  id: string,
  userId: string,
  db: Db,
): Promise<AgentWorkflow | undefined> {
  const builtin = getAgentWorkflow(id);
  if (builtin) return builtin;
  const { data } = await db
    .from("agent_workflows")
    .select(COLUMNS)
    .eq("id", id)
    .or(`user_id.eq.${userId},is_shared.eq.true`)
    .maybeSingle();
  return data ? rowToWorkflow(data as CustomAgentWorkflowRow) : undefined;
}

/** Built-in library shaped for listing alongside custom workflows. */
export function builtinWorkflowsForListing() {
  return AGENT_WORKFLOWS.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    practice: w.practice,
    step_count: w.steps.length,
    steps: w.steps,
    is_custom: false as const,
    is_shared: false,
  }));
}
