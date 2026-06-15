/**
 * Typed tool registry (lexOS Agent, v2 Phase 1a).
 *
 * Single source of truth describing every tool the assistant can call,
 * derived from the existing tool arrays so it never drifts. The agentic
 * core (planner / executor / verifier) and future tools (retrieval, court
 * data) introspect this registry; the legacy runToolCalls / runLLMStream
 * paths are unchanged — this is purely additive metadata.
 */

import {
  TOOLS,
  PROJECT_EXTRA_TOOLS,
  WORKFLOW_TOOLS,
  TABULAR_TOOLS,
} from "../chatTools";
import { INDIANKANOON_TOOLS } from "../legalSourcesTools/indiankanoonTools";

export type ToolScope =
  | "global"
  | "project"
  | "workflow"
  | "tabular"
  | "research";

/** OpenAI-style function tool schema (the shape every tool array uses). */
export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};

export type ToolRegistryEntry = {
  name: string;
  scope: ToolScope;
  /**
   * Tools whose output is a legal fact a lawyer may rely on (computed
   * dates, verified citations, conflict results). The verifier and the
   * eval harness treat these as gated surfaces — they must be checked,
   * never emitted on trust alone.
   */
  accuracyCritical: boolean;
  schema: ToolSchema;
};

/**
 * Tools that produce reliance-grade legal output. Matched by name so the
 * set stays correct as the underlying arrays evolve.
 */
const ACCURACY_CRITICAL_TOOLS = new Set<string>([
  "compute_limitation",
  "check_conflicts",
  "indiankanoon_verify_citations",
  "indiankanoon_read_case",
  "indiankanoon_find_in_case",
]);

function entriesFrom(
  tools: readonly unknown[],
  scope: ToolScope,
): ToolRegistryEntry[] {
  return (tools as ToolSchema[]).map((schema) => ({
    name: schema.function.name,
    scope,
    accuracyCritical: ACCURACY_CRITICAL_TOOLS.has(schema.function.name),
    schema,
  }));
}

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  ...entriesFrom(TOOLS, "global"),
  ...entriesFrom(PROJECT_EXTRA_TOOLS, "project"),
  ...entriesFrom(WORKFLOW_TOOLS, "workflow"),
  ...entriesFrom(TABULAR_TOOLS, "tabular"),
  ...entriesFrom(INDIANKANOON_TOOLS, "research"),
];

const REGISTRY_BY_NAME = new Map<string, ToolRegistryEntry>(
  TOOL_REGISTRY.map((entry) => [entry.name, entry]),
);

export function getToolEntry(name: string): ToolRegistryEntry | undefined {
  return REGISTRY_BY_NAME.get(name);
}

export function isAccuracyCriticalTool(name: string): boolean {
  return REGISTRY_BY_NAME.get(name)?.accuracyCritical ?? false;
}

/** Tool schemas for the given scopes, in registry order. */
export function toolSchemasForScopes(scopes: ToolScope[]): ToolSchema[] {
  const wanted = new Set(scopes);
  return TOOL_REGISTRY.filter((e) => wanted.has(e.scope)).map((e) => e.schema);
}

/** Compact catalogue (name + scope + one-line description) for the planner. */
export function toolCatalogue(scopes?: ToolScope[]): {
  name: string;
  scope: ToolScope;
  accuracy_critical: boolean;
  description: string;
}[] {
  const wanted = scopes ? new Set(scopes) : null;
  return TOOL_REGISTRY.filter((e) => !wanted || wanted.has(e.scope)).map(
    (e) => ({
      name: e.name,
      scope: e.scope,
      accuracy_critical: e.accuracyCritical,
      description: e.schema.function.description ?? "",
    }),
  );
}
