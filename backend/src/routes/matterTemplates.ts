import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { MATTER_TEMPLATES } from "../lib/matterTemplates";

export const matterTemplatesRouter = Router();

// GET /matter-templates — built-in matter-type checklists
matterTemplatesRouter.get("/", requireAuth, (_req, res) => {
    res.json(
        MATTER_TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            task_count: t.tasks.length,
            tasks: t.tasks,
        })),
    );
});
