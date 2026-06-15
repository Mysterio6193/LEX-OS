/**
 * Live smoke test (v2 Phase 1) — run locally with real credentials to
 * validate the agent loop and RAG retrieval end-to-end against real models
 * and a live database (these cannot run in the build container).
 *
 *   Required env: SUPABASE_URL, SUPABASE_SECRET_KEY, an LLM key
 *   (OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY), and for
 *   retrieval an embedding-capable key (OPENAI/GEMINI). Optional:
 *   RERANK_API_KEY. R2_* to read document bytes for reindex.
 *
 *   Usage: npm run smoke:agent -- <projectId> [model]
 *   Steps: reindex the project's docs → hybrid retrieve → plan a goal.
 */

import "dotenv/config";
import { createServerSupabase } from "../src/lib/supabase";
import { ingestDocumentById } from "../src/lib/rag/ingest";
import { hybridRetrieve } from "../src/lib/rag/retrieve";
import { planTask, planToPromptBlock } from "../src/lib/agent/planner";

async function main() {
  const projectId = process.argv[2];
  const model = process.argv[3] || "gemini-3-flash-preview";
  if (!projectId) {
    console.error("Usage: npm run smoke:agent -- <projectId> [model]");
    process.exit(2);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first.");
    process.exit(2);
  }
  const db = createServerSupabase();

  console.log("1) Reindexing project documents…");
  const { data: docs } = await db
    .from("documents")
    .select("id")
    .eq("project_id", projectId);
  let chunks = 0;
  for (const d of (docs ?? []) as { id: string }[]) {
    const r = await ingestDocumentById({ documentId: d.id, db });
    chunks += r.chunks;
  }
  console.log(`   indexed ${chunks} chunks across ${(docs ?? []).length} docs`);

  console.log("2) Hybrid retrieval…");
  const hits = await hybridRetrieve({
    query: "What are the key obligations and deadlines?",
    projectIds: [projectId],
    db,
  });
  console.log(`   ${hits.length} hits`);
  for (const h of hits.slice(0, 3)) {
    console.log(
      `   - [${h.document_id} p${h.page ?? "?"}] ${h.text.slice(0, 120)}…`,
    );
  }

  console.log("3) Planning a goal…");
  const plan = await planTask({
    goal: "Prepare a Section 138 NI Act complaint kit for this matter.",
    model,
    scopes: ["project", "global", "research"],
  });
  console.log(planToPromptBlock(plan));

  console.log("\nSmoke test complete.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
