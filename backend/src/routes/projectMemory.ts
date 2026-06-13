import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import {
    listProjectMemories,
    normalizeMemoryContent,
    normalizeMemoryKind,
    saveProjectMemory,
    MEMORY_KINDS,
} from "../lib/projectMemory";

export const projectMemoryRouter = Router({ mergeParams: true });

// GET /projects/:projectId/memory — list all memory entries for the matter
projectMemoryRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const memories = await listProjectMemories(projectId, db);
    res.json(memories);
});

// POST /projects/:projectId/memory — add a manual memory entry
projectMemoryRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { kind, content } = req.body as { kind?: string; content?: string };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const saved = await saveProjectMemory({
        projectId,
        userId,
        kind: normalizeMemoryKind(kind),
        content: content ?? "",
        source: "user",
        db,
    });
    if (!saved.ok) return void res.status(400).json({ detail: saved.error });

    const { data } = await db
        .from("project_memories")
        .select(
            "id, project_id, user_id, kind, content, source, source_chat_id, created_at, updated_at",
        )
        .eq("id", saved.id)
        .single();
    res.status(201).json(data);
});

// PATCH /projects/:projectId/memory/:memoryId — edit an entry
projectMemoryRouter.patch("/:memoryId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, memoryId } = req.params;
    const { kind, content } = req.body as { kind?: string; content?: string };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (kind !== undefined) {
        if (!MEMORY_KINDS.includes(kind as (typeof MEMORY_KINDS)[number]))
            return void res.status(400).json({ detail: "Invalid memory kind" });
        updates.kind = kind;
    }
    if (content !== undefined) {
        const normalized = normalizeMemoryContent(content);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "Memory content is required" });
        updates.content = normalized;
    }

    const { data, error } = await db
        .from("project_memories")
        .update(updates)
        .eq("id", memoryId)
        .eq("project_id", projectId)
        .select(
            "id, project_id, user_id, kind, content, source, source_chat_id, created_at, updated_at",
        )
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Memory not found" });
    res.json(data);
});

// DELETE /projects/:projectId/memory/:memoryId — remove an entry
projectMemoryRouter.delete("/:memoryId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, memoryId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const { error } = await db
        .from("project_memories")
        .delete()
        .eq("id", memoryId)
        .eq("project_id", projectId);
    if (error)
        return void res.status(500).json({ detail: "Failed to delete memory" });
    res.status(204).end();
});
