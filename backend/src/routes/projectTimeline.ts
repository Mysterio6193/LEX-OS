import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import { loadProjectTimeline } from "../lib/projectTimeline";

export const projectTimelineRouter = Router({ mergeParams: true });

// GET /projects/:projectId/timeline — chronological matter activity,
// newest first. ?before=<ISO timestamp> pages further back.
projectTimelineRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
    const before = typeof req.query.before === "string" ? req.query.before : null;

    const result = await loadProjectTimeline({
        projectId,
        db,
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
        before,
    });
    res.json(result);
});
