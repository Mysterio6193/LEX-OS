/**
 * Verifier (v2 Phase 1d). Self-review pass over an executed agent turn:
 * summarizes citation verification (from the citation guard, wired in 1e)
 * into a confidence score and a human-readable note surfaced in the trace.
 * Accuracy-critical surfaces with unresolved citations are flagged, never
 * presented as settled.
 */

import type { AgentVerification } from "./types";

export function summarizeVerification(args: {
  citationCount: number;
  unverifiedCount: number;
}): AgentVerification {
  const { citationCount, unverifiedCount } = args;
  let confidence = 0.6;
  if (citationCount > 0 && unverifiedCount === 0) confidence = 0.9;
  if (unverifiedCount > 0)
    confidence = Math.max(0.2, 0.6 - 0.15 * unverifiedCount);

  let notes: string;
  if (unverifiedCount > 0) {
    notes = `${unverifiedCount} citation(s) could not be resolved to a retrieved source and are flagged unverified — review before relying on them.`;
  } else if (citationCount > 0) {
    notes = `All ${citationCount} citation(s) resolved to a retrieved source.`;
  } else {
    notes =
      "No sources were cited; treat any legal assertions as unverified and confirm against authority.";
  }
  return {
    confidence: Math.round(confidence * 100) / 100,
    unverified_count: unverifiedCount,
    notes,
  };
}
