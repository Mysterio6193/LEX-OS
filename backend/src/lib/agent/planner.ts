/**
 * Planner (v2 Phase 1d). Decomposes a legal goal into an ordered, typed
 * plan of tool/reason steps the executor (the existing runLLMStream tool
 * loop) then carries out. One model call; output is parsed defensively and
 * falls back to a single-step plan so agent mode never hard-fails.
 */

import { completeText } from "../llm";
import type { UserApiKeys } from "../llm/types";
import { toolCatalogue } from "./registry";
import type { AgentPlan, AgentStep } from "./types";

const PLANNER_SYSTEM = `You are the planner for an Indian legal AI agent. Given a user's goal and the available tools, produce a short ordered plan (2-6 steps) to accomplish it accurately. Prefer retrieving and reading sources before drafting or concluding, and verifying citations and computed dates. Respond with ONLY a JSON array, each item {"type":"tool"|"reason","tool":"<tool name or null>","intent":"<one line>"}. No prose.`;

function parsePlan(raw: string, goal: string): AgentPlan {
  const fallback: AgentPlan = {
    goal,
    steps: [
      { idx: 0, type: "reason", tool: null, intent: "Answer the request." },
    ],
  };
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return fallback;
  try {
    const arr = JSON.parse(match[0]) as {
      type?: string;
      tool?: string | null;
      intent?: string;
    }[];
    const steps: AgentStep[] = arr
      .filter((s) => s && typeof s.intent === "string" && s.intent.trim())
      .slice(0, 8)
      .map((s, idx) => ({
        idx,
        type: s.type === "tool" ? "tool" : "reason",
        tool: s.tool ?? null,
        intent: String(s.intent).trim().slice(0, 300),
      }));
    return steps.length ? { goal, steps } : fallback;
  } catch {
    return fallback;
  }
}

export async function planTask(args: {
  goal: string;
  model: string;
  apiKeys?: UserApiKeys;
  /** Scopes available in this context (e.g. project + global + research). */
  scopes?: ("global" | "project" | "workflow" | "tabular" | "research")[];
}): Promise<AgentPlan> {
  const tools = toolCatalogue(args.scopes)
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  try {
    const raw = await completeText({
      model: args.model,
      systemPrompt: PLANNER_SYSTEM,
      user: `GOAL:\n${args.goal}\n\nAVAILABLE TOOLS:\n${tools}\n\nReturn the JSON plan.`,
      maxTokens: 700,
      apiKeys: args.apiKeys,
    });
    return parsePlan(raw, args.goal);
  } catch {
    return {
      goal: args.goal,
      steps: [
        { idx: 0, type: "reason", tool: null, intent: "Answer the request." },
      ],
    };
  }
}

/** Render a plan for injection into the executor's system prompt. */
export function planToPromptBlock(plan: AgentPlan): string {
  const lines = plan.steps.map(
    (s) => `${s.idx + 1}. ${s.intent}${s.tool ? ` (tool: ${s.tool})` : ""}`,
  );
  return `EXECUTION PLAN (you proposed this; follow it, adapting as needed, and use the named tools):
${lines.join("\n")}`;
}

/**
 * Build a deterministic plan from a library agent-workflow — no LLM call, so
 * a firm's repeatable matters execute the same vetted steps every time.
 */
export function planFromWorkflow(
  workflow: { name: string; steps: { intent: string; tool?: string | null }[] },
  goal: string,
): AgentPlan {
  return {
    goal: `${workflow.name}: ${goal}`.trim(),
    steps: workflow.steps.map((s, idx) => ({
      idx,
      type: s.tool ? "tool" : "reason",
      tool: s.tool ?? null,
      intent: s.intent,
    })),
  };
}

