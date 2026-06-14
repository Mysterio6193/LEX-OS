import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import { getUserModelSettings } from "../lib/userSettings";
import { ingestDocumentById } from "../lib/rag/ingest";
import {
    getVaultInProject,
    listVaultDocumentIds,
    listVaults,
    normalizeVaultDescription,
    normalizeVaultName,
} from "../lib/vaults";

const VAULT_COLUMNS =
    "id, project_id, user_id, name, description, created_at, updated_at";

export const vaultsRouter = Router({ mergeParams: true });

// GET /projects/:projectId/vaults
vaultsRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    res.json(await listVaults(projectId, db));
});

// POST /projects/:projectId/vaults
vaultsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { name, description } = req.body as {
        name?: string;
        description?: string;
    };
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const cleanName = normalizeVaultName(name);
    if (!cleanName)
        return void res.status(400).json({ detail: "Vault name is required" });

    const { data, error } = await db
        .from("vaults")
        .insert({
            project_id: projectId,
            user_id: userId,
            name: cleanName,
            description: normalizeVaultDescription(description),
        })
        .select(VAULT_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(500).json({ detail: "Failed to create vault" });
    res.status(201).json({ ...data, document_count: 0 });
});

// PATCH /projects/:projectId/vaults/:vaultId
vaultsRouter.patch("/:vaultId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, vaultId } = req.params;
    const { name, description } = req.body as {
        name?: string;
        description?: string | null;
    };
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (name !== undefined) {
        const clean = normalizeVaultName(name);
        if (!clean)
            return void res.status(400).json({ detail: "Vault name is required" });
        updates.name = clean;
    }
    if (description !== undefined)
        updates.description = normalizeVaultDescription(description);

    const { data, error } = await db
        .from("vaults")
        .update(updates)
        .eq("id", vaultId)
        .eq("project_id", projectId)
        .select(VAULT_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Vault not found" });
    res.json(data);
});

// DELETE /projects/:projectId/vaults/:vaultId
vaultsRouter.delete("/:vaultId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, vaultId } = req.params;
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    const { error } = await db
        .from("vaults")
        .delete()
        .eq("id", vaultId)
        .eq("project_id", projectId);
    if (error)
        return void res.status(500).json({ detail: "Failed to delete vault" });
    res.status(204).end();
});

// GET /projects/:projectId/vaults/:vaultId/documents — member document ids
vaultsRouter.get("/:vaultId/documents", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, vaultId } = req.params;
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    const vault = await getVaultInProject(vaultId, projectId, db);
    if (!vault) return void res.status(404).json({ detail: "Vault not found" });
    res.json({ document_ids: await listVaultDocumentIds(vaultId, db) });
});

// PUT /projects/:projectId/vaults/:vaultId/documents — set membership
vaultsRouter.put("/:vaultId/documents", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, vaultId } = req.params;
    const { document_ids } = req.body as { document_ids?: string[] };
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    const vault = await getVaultInProject(vaultId, projectId, db);
    if (!vault) return void res.status(404).json({ detail: "Vault not found" });

    // Only documents that belong to this project may be added.
    const requested = Array.isArray(document_ids) ? document_ids : [];
    const { data: validDocs } = requested.length
        ? await db
              .from("documents")
              .select("id")
              .eq("project_id", projectId)
              .in("id", requested)
        : { data: [] as { id: string }[] };
    const validIds = ((validDocs ?? []) as { id: string }[]).map((d) => d.id);

    await db.from("vault_documents").delete().eq("vault_id", vaultId);
    if (validIds.length) {
        await db.from("vault_documents").insert(
            validIds.map((document_id) => ({ vault_id: vaultId, document_id })),
        );
    }
    res.json({ document_ids: validIds });
});

// POST /projects/:projectId/vaults/:vaultId/reindex — index member docs
vaultsRouter.post("/:vaultId/reindex", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, vaultId } = req.params;
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    const vault = await getVaultInProject(vaultId, projectId, db);
    if (!vault) return void res.status(404).json({ detail: "Vault not found" });

    const { api_keys: apiKeys } = await getUserModelSettings(userId, db);
    const docIds = await listVaultDocumentIds(vaultId, db);
    let chunks = 0;
    let indexed = 0;
    for (const id of docIds) {
        const r = await ingestDocumentById({ documentId: id, apiKeys, db });
        if (r.ok && r.chunks > 0) {
            indexed += 1;
            chunks += r.chunks;
        }
    }
    res.json({ ok: true, documents: docIds.length, indexed, chunks });
});
