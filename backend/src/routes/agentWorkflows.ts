import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { AGENT_WORKFLOWS } from "../lib/agentWorkflows";

export const agentWorkflowsRouter = Router();

// GET /agent-workflows — the built-in India agent-workflow library.
agentWorkflowsRouter.get("/", requireAuth, (_req, res) => {
    res.json(
        AGENT_WORKFLOWS.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            practice: w.practice,
            step_count: w.steps.length,
            steps: w.steps,
        })),
    );
});
