import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import { listProjectParties } from "../lib/projectParties";
import {
    CONFLICT_CHECK_MAX_NAMES,
    CONFLICT_CHECK_NAME_MAX_CHARS,
    runConflictCheck,
} from "../lib/conflicts";

export const conflictsRouter = Router();

// POST /conflicts/check — run a conflict check against the caller's
// accessible matters, parties, and clients. Accepts either an explicit
// list of names (pre-engagement check) or a project_id whose parties and
// linked client become the queried names (matter-wide check).
conflictsRouter.post("/check", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { names, project_id: projectId } = req.body as {
        names?: unknown;
        project_id?: string;
    };
    const db = createServerSupabase();

    let queryNames: string[] = [];
    let excludeProjectId: string | null = null;

    if (projectId) {
        const access = await checkProjectAccess(
            projectId,
            userId,
            userEmail,
            db,
        );
        if (!access.ok)
            return void res.status(404).json({ detail: "Project not found" });
        excludeProjectId = projectId;
        const parties = await listProjectParties(projectId, db);
        queryNames = parties.map((p) => p.name);
        const { data: project } = await db
            .from("projects")
            .select("client_id")
            .eq("id", projectId)
            .single();
        const clientId = (project as { client_id: string | null } | null)
            ?.client_id;
        if (clientId) {
            const { data: client } = await db
                .from("clients")
                .select("name")
                .eq("id", clientId)
                .single();
            const clientName = (client as { name: string } | null)?.name;
            if (clientName) queryNames.push(clientName);
        }
    } else if (Array.isArray(names)) {
        queryNames = names
            .map((n) => String(n ?? "").trim())
            .filter(Boolean);
    }

    if (queryNames.length === 0)
        return void res.status(400).json({
            detail: "Provide names to check, or a project_id with recorded parties.",
        });
    if (queryNames.length > CONFLICT_CHECK_MAX_NAMES)
        return void res.status(400).json({
            detail: `At most ${CONFLICT_CHECK_MAX_NAMES} names per check.`,
        });
    if (queryNames.some((n) => n.length > CONFLICT_CHECK_NAME_MAX_CHARS))
        return void res.status(400).json({
            detail: `Names must be at most ${CONFLICT_CHECK_NAME_MAX_CHARS} characters.`,
        });

    const result = await runConflictCheck({
        names: queryNames,
        userId,
        userEmail,
        excludeProjectId,
        db,
    });
    res.json({ ...result, checked_at: new Date().toISOString() });
});
