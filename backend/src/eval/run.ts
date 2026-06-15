/**
 * Offline eval harness (v2 Phase 1f). Runs with zero external calls
 * (`npm test` → tsx) and exits non-zero on any failure, so CI can gate
 * accuracy-critical surfaces: limitation arithmetic, citation-guard
 * resolution, RRF fusion, and structure-aware chunking.
 */

import { computeLimitation } from "../lib/limitation";
import {
  quoteAppears,
  verifyCitations,
  type CitationToCheck,
} from "../lib/agent/citationGuard";
import { reciprocalRankFusion } from "../lib/rag/retrieve";
import { chunkDocument } from "../lib/rag/chunker";
import {
  parseInlineCitations,
  verifyCellCitations,
} from "../lib/tabularCitations";
import { formatLog, shouldLog } from "../lib/logger";
import { planFromWorkflow } from "../lib/agent/planner";
import { getAgentWorkflow } from "../lib/agentWorkflows";
import { normalizeSteps } from "../lib/customAgentWorkflows";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(
    `${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    actual === expected,
  );
}

// --- Limitation arithmetic (accuracy-critical) ---
function dueDate(key: string, trigger: string): string {
  const r = computeLimitation({ key, triggerDate: trigger });
  return r.ok ? r.due_date : `ERR:${r.error}`;
}
eq("limitation: contract 3y", dueDate("contract_money", "2021-06-14"), "2024-06-14");
eq("limitation: HC appeal 90d (leap)", dueDate("first_appeal_hc", "2024-01-01"), "2024-03-31");
eq("limitation: cheque 30d (leap Feb)", dueDate("cheque_138_complaint", "2024-02-15"), "2024-03-16");
eq("limitation: consumer 2y", dueDate("consumer_complaint", "2022-03-31"), "2024-03-31");
check("limitation: unknown key errors", !computeLimitation({ key: "nope", triggerDate: "2024-01-01" }).ok);
check("limitation: bad date errors", !computeLimitation({ key: "contract_money", triggerDate: "2024-13-40" }).ok);

// --- Citation guard ---
check(
  "guard: normalized substring matches",
  quoteAppears(
    "the liability cap shall be twelve months",
    "Clause 9. The Liability Cap shall be TWELVE months of fees paid.",
  ),
);
check(
  "guard: unrelated quote rejected",
  !quoteAppears("entirely unrelated sentence here", "some other document content"),
);
check("guard: too-short quote rejected", !quoteAppears("yes", "yes it is so"));
{
  const cites: CitationToCheck[] = [
    { ref: 1, kind: "document", sourceId: "doc-a", quotes: ["the parties agree to arbitrate disputes"] },
    { ref: 2, kind: "document", sourceId: "doc-missing", quotes: ["whatever was claimed here"] },
  ];
  const src = new Map<string, string>([
    ["doc-a", "Section 12. The Parties agree to arbitrate disputes under the Act."],
  ]);
  const verdicts = verifyCitations(cites, src);
  check("guard: present quote verified", verdicts[0].verified === true);
  check("guard: missing source unverified", verdicts[1].verified === false);
}

// --- Reciprocal Rank Fusion ---
{
  const fused = reciprocalRankFusion([
    ["a", "b", "c"],
    ["b", "d", "a"],
  ]);
  const top = [...fused.entries()].sort((x, y) => y[1] - x[1])[0][0];
  eq("rrf: item in both lists ranks top", top, "b");
}

// --- Structure-aware chunking ---
{
  const chunks = chunkDocument({
    text: "[Page 1]\nFirst paragraph of text here.\n\nSecond paragraph follows.\n[Page 2]\nThird paragraph on page two.",
    filename: "sample.txt",
  });
  check("chunker: produced chunks", chunks.length >= 2);
  check("chunker: has a parent", chunks.some((c) => c.parentIndex === null));
  check("chunker: has children", chunks.some((c) => c.parentIndex !== null));
  check("chunker: captured page 2", chunks.some((c) => c.page === 2));
}

// --- Tabular cell citations ---
{
  const summary =
    "Liability is capped at 12 months' fees [[page:9||quote:the Liability Cap shall be twelve months of fees]]. Governing law is Delhi [[page:14||quote:governed by the laws of Delhi]].";
  const marks = parseInlineCitations(summary);
  eq("tabular: parsed two citations", marks.length, 2);
  eq("tabular: first page parsed", marks[0].page, 9);
  const doc =
    "Clause 9. The Liability Cap shall be TWELVE months of fees paid in the prior year. Clause 14. This agreement is governed by the laws of Delhi.";
  const verified = verifyCellCitations(marks, doc);
  check("tabular: present quotes verified", verified.every((v) => v.verified));
  const fabricated = verifyCellCitations(
    parseInlineCitations("Total is ₹5 crore [[page:2||quote:the price is five hundred crore rupees]]."),
    doc,
  );
  check("tabular: fabricated quote unverified", fabricated[0].verified === false);
}

// --- Structured logger ---
{
  const line = formatLog("info", "request", { status: 200, ms: 5 });
  const parsed = JSON.parse(line) as Record<string, unknown>;
  eq("logger: level serialized", parsed.level, "info");
  eq("logger: meta merged", parsed.status, 200);
  check("logger: timestamp present", typeof parsed.t === "string");
  check("logger: warn passes info threshold", shouldLog("warn", "info"));
  check("logger: debug filtered at info", !shouldLog("debug", "info"));
  // Circular meta must not throw.
  const circ: Record<string, unknown> = {};
  circ.self = circ;
  check(
    "logger: circular meta falls back",
    typeof formatLog("error", "x", circ) === "string",
  );
}

// --- Agent workflows → deterministic plan ---
{
  const wf = getAgentWorkflow("wf-s138-kit");
  check("workflow: S.138 kit exists", !!wf);
  if (wf) {
    const plan = planFromWorkflow(wf, "for the Sharma matter");
    eq("workflow: plan step count matches", plan.steps.length, wf.steps.length);
    eq("workflow: step indices sequential", plan.steps[0].idx, 0);
    check(
      "workflow: tool steps preserved",
      plan.steps[0].tool === wf.steps[0].tool,
    );
    check("workflow: goal carries workflow name", plan.goal.includes(wf.name));
  }
  check("workflow: unknown id resolves undefined", !getAgentWorkflow("nope"));
}

// --- Agent Builder step normalization ---
{
  const steps = normalizeSteps([
    { intent: "  Find the liability clause  ", tool: "retrieve_context" },
    { intent: "Guess at it", tool: "not_a_real_tool" },
    { intent: "", tool: "save_task" },
    { intent: "Summarise" },
  ]);
  eq("builder: drops empty-intent step", steps.length, 3);
  eq("builder: trims intent", steps[0].intent, "Find the liability clause");
  check("builder: keeps valid tool", steps[0].tool === "retrieve_context");
  check("builder: nulls unknown tool", steps[1].tool === null);
  check("builder: missing tool → null", steps[2].tool === null);
  check("builder: non-array → empty", normalizeSteps("nope").length === 0);
}

console.log(`\neval: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
