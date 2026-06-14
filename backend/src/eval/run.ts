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

console.log(`\neval: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
