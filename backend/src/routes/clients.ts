import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { normalizeClientName, normalizeClientNotes } from "../lib/clients";

const CLIENT_COLUMNS = "id, user_id, name, notes, created_at, updated_at";

export const clientsRouter = Router();

// GET /clients — list the caller's clients with matter counts
clientsRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data, error } = await db
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("user_id", userId)
        .order("name", { ascending: true });
    if (error) return void res.status(500).json({ detail: error.message });

    const clients = data ?? [];
    const withCounts = await Promise.all(
        clients.map(async (c) => {
            const { count } = await db
                .from("projects")
                .select("id", { count: "exact", head: true })
                .eq("client_id", (c as { id: string }).id);
            return { ...c, project_count: count ?? 0 };
        }),
    );
    res.json(withCounts);
});

// POST /clients — create a client
clientsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { name, notes } = req.body as { name?: string; notes?: string };
    const normalized = normalizeClientName(name);
    if (!normalized)
        return void res.status(400).json({ detail: "name is required" });

    const db = createServerSupabase();
    const { data, error } = await db
        .from("clients")
        .insert({
            user_id: userId,
            name: normalized,
            notes: normalizeClientNotes(notes),
        })
        .select(CLIENT_COLUMNS)
        .single();
    if (error) return void res.status(500).json({ detail: error.message });
    res.status(201).json({ ...data, project_count: 0 });
});

// PATCH /clients/:clientId — edit name/notes
clientsRouter.patch("/:clientId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { clientId } = req.params;
    const { name, notes } = req.body as {
        name?: string;
        notes?: string | null;
    };

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (name !== undefined) {
        const normalized = normalizeClientName(name);
        if (!normalized)
            return void res.status(400).json({ detail: "name is required" });
        updates.name = normalized;
    }
    if (notes !== undefined) updates.notes = normalizeClientNotes(notes);

    const db = createServerSupabase();
    const { data, error } = await db
        .from("clients")
        .update(updates)
        .eq("id", clientId)
        .eq("user_id", userId)
        .select(CLIENT_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Client not found" });
    res.json(data);
});

// DELETE /clients/:clientId — remove a client (matters keep their data;
// projects.client_id is set null by the FK)
clientsRouter.delete("/:clientId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { clientId } = req.params;
    const db = createServerSupabase();

    const { error } = await db
        .from("clients")
        .delete()
        .eq("id", clientId)
        .eq("user_id", userId);
    if (error)
        return void res.status(500).json({ detail: "Failed to delete client" });
    res.status(204).end();
});
