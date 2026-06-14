/** Agentic core shared types (v2 Phase 1d). */

export type AgentStep = {
  idx: number;
  type: "tool" | "reason";
  /** Tool name when type === "tool". */
  tool?: string | null;
  /** One-line description of what this step accomplishes. */
  intent: string;
};

export type AgentPlan = {
  goal: string;
  steps: AgentStep[];
};

export type AgentVerification = {
  confidence: number;
  /** Citations that could not be resolved to a retrieved source. */
  unverified_count: number;
  notes: string;
};
