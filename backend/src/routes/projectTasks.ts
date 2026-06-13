import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import {
    applyMatterTemplate,
    listProjectTasks,
    normalizeTaskNotes,
    normalizeTaskTitle,
    saveProjectTask,
} from "../lib/projectTasks";

const TASK_COLUMNS =
    "id, project_id, user_id, title, notes, status, position, source, template_id, source_chat_id, created_at, updated_at";

export const projectTasksRouter = Router({ mergeParams: true });

// GET /projects/:projectId/tasks — list the matter's checklist
projectTasksRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const tasks = await listProjectTasks(projectId, db);
    res.json(tasks);
});

// POST /projects/:projectId/tasks — add a manual task
projectTasksRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { title, notes } = req.body as { title?: string; notes?: string };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const saved = await saveProjectTask({
        projectId,
        userId,
        title: title ?? "",
        notes: notes ?? null,
        source: "user",
        db,
    });
    if (!saved.ok) return void res.status(400).json({ detail: saved.error });

    const { data } = await db
        .from("project_tasks")
        .select(TASK_COLUMNS)
        .eq("id", saved.id)
        .single();
    res.status(201).json(data);
});

// POST /projects/:projectId/tasks/apply-template — seed a matter template
projectTasksRouter.post(
    "/apply-template",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const { projectId } = req.params;
        const { template_id: templateId } = req.body as {
            template_id?: string;
        };
        const db = createServerSupabase();

        const access = await checkProjectAccess(
            projectId,
            userId,
            userEmail,
            db,
        );
        if (!access.ok)
            return void res.status(404).json({ detail: "Project not found" });

        const applied = await applyMatterTemplate({
            projectId,
            userId,
            templateId: templateId ?? "",
            db,
        });
        if (!applied.ok)
            return void res.status(400).json({ detail: applied.error });

        const tasks = await listProjectTasks(projectId, db);
        res.json({ added: applied.added, tasks });
    },
);

// PATCH /projects/:projectId/tasks/:taskId — edit / complete an entry
projectTasksRouter.patch("/:taskId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, taskId } = req.params;
    const { title, notes, status, position } = req.body as {
        title?: string;
        notes?: string | null;
        status?: string;
        position?: number;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (title !== undefined) {
        const normalized = normalizeTaskTitle(title);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "Task title is required" });
        updates.title = normalized;
    }
    if (notes !== undefined) updates.notes = normalizeTaskNotes(notes);
    if (status !== undefined) {
        if (status !== "pending" && status !== "done")
            return void res.status(400).json({ detail: "Invalid status" });
        updates.status = status;
    }
    if (position !== undefined) {
        if (!Number.isInteger(position) || position < 0)
            return void res.status(400).json({ detail: "Invalid position" });
        updates.position = position;
    }

    const { data, error } = await db
        .from("project_tasks")
        .update(updates)
        .eq("id", taskId)
        .eq("project_id", projectId)
        .select(TASK_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Task not found" });
    res.json(data);
});

// DELETE /projects/:projectId/tasks/:taskId — remove an entry
projectTasksRouter.delete("/:taskId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, taskId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const { error } = await db
        .from("project_tasks")
        .delete()
        .eq("id", taskId)
        .eq("project_id", projectId);
    if (error)
        return void res.status(500).json({ detail: "Failed to delete task" });
    res.status(204).end();
});
