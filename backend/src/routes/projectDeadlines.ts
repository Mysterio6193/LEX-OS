import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import {
    listProjectDeadlines,
    normalizeDeadlineDueDate,
    normalizeDeadlineNotes,
    normalizeDeadlineTitle,
    saveProjectDeadline,
} from "../lib/projectDeadlines";

const DEADLINE_COLUMNS =
    "id, project_id, user_id, title, due_date, notes, status, source, source_chat_id, created_at, updated_at";

export const projectDeadlinesRouter = Router({ mergeParams: true });

// GET /projects/:projectId/deadlines — list all deadlines for the matter
projectDeadlinesRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const deadlines = await listProjectDeadlines(projectId, db);
    res.json(deadlines);
});

// POST /projects/:projectId/deadlines — add a manual deadline
projectDeadlinesRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { title, due_date, notes } = req.body as {
        title?: string;
        due_date?: string;
        notes?: string;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const saved = await saveProjectDeadline({
        projectId,
        userId,
        title: title ?? "",
        dueDate: due_date ?? "",
        notes: notes ?? null,
        source: "user",
        db,
    });
    if (!saved.ok) return void res.status(400).json({ detail: saved.error });

    const { data } = await db
        .from("project_deadlines")
        .select(DEADLINE_COLUMNS)
        .eq("id", saved.id)
        .single();
    res.status(201).json(data);
});

// PATCH /projects/:projectId/deadlines/:deadlineId — edit / complete an entry
projectDeadlinesRouter.patch("/:deadlineId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, deadlineId } = req.params;
    const { title, due_date, notes, status } = req.body as {
        title?: string;
        due_date?: string;
        notes?: string | null;
        status?: string;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (title !== undefined) {
        const normalized = normalizeDeadlineTitle(title);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "Deadline title is required" });
        updates.title = normalized;
    }
    if (due_date !== undefined) {
        const normalized = normalizeDeadlineDueDate(due_date);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "due_date must be a valid YYYY-MM-DD date" });
        updates.due_date = normalized;
    }
    if (notes !== undefined) updates.notes = normalizeDeadlineNotes(notes);
    if (status !== undefined) {
        if (status !== "pending" && status !== "done")
            return void res.status(400).json({ detail: "Invalid status" });
        updates.status = status;
    }

    const { data, error } = await db
        .from("project_deadlines")
        .update(updates)
        .eq("id", deadlineId)
        .eq("project_id", projectId)
        .select(DEADLINE_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Deadline not found" });
    res.json(data);
});

// DELETE /projects/:projectId/deadlines/:deadlineId — remove an entry
projectDeadlinesRouter.delete(
    "/:deadlineId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const { projectId, deadlineId } = req.params;
        const db = createServerSupabase();

        const access = await checkProjectAccess(
            projectId,
            userId,
            userEmail,
            db,
        );
        if (!access.ok)
            return void res.status(404).json({ detail: "Project not found" });

        const { error } = await db
            .from("project_deadlines")
            .delete()
            .eq("id", deadlineId)
            .eq("project_id", projectId);
        if (error)
            return void res
                .status(500)
                .json({ detail: "Failed to delete deadline" });
        res.status(204).end();
    },
);
