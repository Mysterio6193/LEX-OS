import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import {
    listProjectParties,
    normalizePartyName,
    normalizePartyNotes,
    normalizePartyRole,
    saveProjectParty,
} from "../lib/projectParties";

const PARTY_COLUMNS =
    "id, project_id, user_id, name, role, notes, source, source_chat_id, created_at, updated_at";

export const projectPartiesRouter = Router({ mergeParams: true });

// GET /projects/:projectId/parties — list all parties for the matter
projectPartiesRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const parties = await listProjectParties(projectId, db);
    res.json(parties);
});

// POST /projects/:projectId/parties — add a party manually
projectPartiesRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { name, role, notes } = req.body as {
        name?: string;
        role?: string;
        notes?: string;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const saved = await saveProjectParty({
        projectId,
        userId,
        name: name ?? "",
        role: role ?? "other",
        notes: notes ?? null,
        source: "user",
        db,
    });
    if (!saved.ok) return void res.status(400).json({ detail: saved.error });

    const { data } = await db
        .from("project_parties")
        .select(PARTY_COLUMNS)
        .eq("id", saved.id)
        .single();
    res.status(201).json(data);
});

// PATCH /projects/:projectId/parties/:partyId — edit an entry
projectPartiesRouter.patch("/:partyId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, partyId } = req.params;
    const { name, role, notes } = req.body as {
        name?: string;
        role?: string;
        notes?: string | null;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (name !== undefined) {
        const normalized = normalizePartyName(name);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "Party name is required" });
        updates.name = normalized;
    }
    if (role !== undefined) updates.role = normalizePartyRole(role);
    if (notes !== undefined) updates.notes = normalizePartyNotes(notes);

    const { data, error } = await db
        .from("project_parties")
        .update(updates)
        .eq("id", partyId)
        .eq("project_id", projectId)
        .select(PARTY_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Party not found" });
    res.json(data);
});

// DELETE /projects/:projectId/parties/:partyId — remove an entry
projectPartiesRouter.delete("/:partyId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, partyId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const { error } = await db
        .from("project_parties")
        .delete()
        .eq("id", partyId)
        .eq("project_id", projectId);
    if (error)
        return void res.status(500).json({ detail: "Failed to delete party" });
    res.status(204).end();
});
