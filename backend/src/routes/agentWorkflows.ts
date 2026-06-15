import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { toolCatalogue } from "../lib/agent/registry";
import {
    builtinWorkflowsForListing,
    createCustomWorkflow,
    deleteCustomWorkflow,
    listCustomWorkflows,
    updateCustomWorkflow,
} from "../lib/customAgentWorkflows";

export const agentWorkflowsRouter = Router();

// GET /agent-workflows — built-in India library + the user's custom workflows.
agentWorkflowsRouter.get("/", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const custom = await listCustomWorkflows(userId, db);
    res.json([...builtinWorkflowsForListing(), ...custom]);
});

// GET /agent-workflows/tools — tools the builder can choose from.
agentWorkflowsRouter.get("/tools", requireAuth, (_req, res) => {
    res.json(toolCatalogue(["project", "global", "research"]));
});

// POST /agent-workflows — create a custom workflow.
agentWorkflowsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { name, description, practice, steps, is_shared } = req.body as {
        name?: string;
        description?: string;
        practice?: string;
        steps?: unknown;
        is_shared?: boolean;
    };
    const db = createServerSupabase();
    const result = await createCustomWorkflow({
        userId,
        name: name ?? "",
        description,
        practice,
        steps,
        isShared: is_shared,
        db,
    });
    if (!result.ok) return void res.status(400).json({ detail: result.error });
    res.status(201).json(result.row);
});

// PATCH /agent-workflows/:id — edit a custom workflow.
agentWorkflowsRouter.patch("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const { name, description, practice, steps, is_shared } = req.body as {
        name?: string;
        description?: string | null;
        practice?: string | null;
        steps?: unknown;
        is_shared?: boolean;
    };
    const db = createServerSupabase();
    const row = await updateCustomWorkflow({
        id,
        userId,
        name,
        description,
        practice,
        steps,
        isShared: is_shared,
        db,
    });
    if (!row) return void res.status(404).json({ detail: "Workflow not found" });
    res.json(row);
});

// DELETE /agent-workflows/:id — remove a custom workflow.
agentWorkflowsRouter.delete("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { id } = req.params;
    const db = createServerSupabase();
    await deleteCustomWorkflow(id, userId, db);
    res.status(204).end();
});
