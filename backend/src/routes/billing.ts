import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import {
    createInvoice,
    getBillingSettings,
    listInvoices,
    listTimeEntries,
    normalizeDescription,
    saveTimeEntry,
} from "../lib/billing";

const TIME_ENTRY_COLUMNS =
    "id, project_id, user_id, entry_date, description, minutes, rate, amount, billed, source, source_chat_id, created_at, updated_at";

// ---------------------------------------------------------------------------
// Firm billing settings (user-scoped): GET/PATCH /billing/settings
// ---------------------------------------------------------------------------

export const billingRouter = Router();

billingRouter.get("/settings", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    res.json(await getBillingSettings(userId, db));
});

billingRouter.patch("/settings", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { firm_gstin, firm_state, default_hourly_rate } = req.body as {
        firm_gstin?: string | null;
        firm_state?: string | null;
        default_hourly_rate?: number | string | null;
    };
    const db = createServerSupabase();

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (firm_gstin !== undefined)
        updates.firm_gstin = String(firm_gstin ?? "").trim() || null;
    if (firm_state !== undefined)
        updates.firm_state = String(firm_state ?? "").trim() || null;
    if (default_hourly_rate !== undefined) {
        const n = Number(default_hourly_rate);
        updates.default_hourly_rate =
            default_hourly_rate === null ||
            default_hourly_rate === "" ||
            !Number.isFinite(n)
                ? null
                : n;
    }

    const { error } = await db
        .from("user_profiles")
        .update(updates)
        .eq("user_id", userId);
    if (error)
        return void res
            .status(500)
            .json({ detail: "Failed to update billing settings" });
    res.json(await getBillingSettings(userId, db));
});

// ---------------------------------------------------------------------------
// Project billing: /projects/:projectId/billing/{time-entries,invoices}
// ---------------------------------------------------------------------------

export const projectBillingRouter = Router({ mergeParams: true });

// GET time entries
projectBillingRouter.get("/time-entries", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    res.json(await listTimeEntries(projectId, db));
});

// POST time entry
projectBillingRouter.post("/time-entries", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { description, minutes, entry_date, rate } = req.body as {
        description?: string;
        minutes?: number;
        entry_date?: string;
        rate?: number;
    };
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const saved = await saveTimeEntry({
        projectId,
        userId,
        description: description ?? "",
        minutes: minutes ?? 0,
        entryDate: entry_date,
        rate: rate ?? null,
        source: "user",
        db,
    });
    if (!saved.ok) return void res.status(400).json({ detail: saved.error });

    const { data } = await db
        .from("time_entries")
        .select(TIME_ENTRY_COLUMNS)
        .eq("id", saved.id)
        .single();
    res.status(201).json(data);
});

// PATCH time entry (edit description / billed flag)
projectBillingRouter.patch(
    "/time-entries/:entryId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const { projectId, entryId } = req.params;
        const { description, billed } = req.body as {
            description?: string;
            billed?: boolean;
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

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (description !== undefined) {
            const normalized = normalizeDescription(description);
            if (!normalized)
                return void res
                    .status(400)
                    .json({ detail: "Description is required" });
            updates.description = normalized;
        }
        if (typeof billed === "boolean") updates.billed = billed;

        const { data, error } = await db
            .from("time_entries")
            .update(updates)
            .eq("id", entryId)
            .eq("project_id", projectId)
            .select(TIME_ENTRY_COLUMNS)
            .single();
        if (error || !data)
            return void res.status(404).json({ detail: "Time entry not found" });
        res.json(data);
    },
);

// DELETE time entry
projectBillingRouter.delete(
    "/time-entries/:entryId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const { projectId, entryId } = req.params;
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
            .from("time_entries")
            .delete()
            .eq("id", entryId)
            .eq("project_id", projectId);
        if (error)
            return void res
                .status(500)
                .json({ detail: "Failed to delete time entry" });
        res.status(204).end();
    },
);

// GET invoices
projectBillingRouter.get("/invoices", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    res.json(await listInvoices(projectId, db));
});

// POST invoice (from selected time entries and/or ad-hoc line items)
projectBillingRouter.post("/invoices", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const {
        invoice_date,
        client_name,
        client_gstin,
        place_of_supply,
        time_entry_ids,
        line_items,
        notes,
    } = req.body as {
        invoice_date?: string;
        client_name?: string;
        client_gstin?: string;
        place_of_supply?: string;
        time_entry_ids?: string[];
        line_items?: { description: string; amount: number }[];
        notes?: string;
    };
    const db = createServerSupabase();
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const result = await createInvoice({
        projectId,
        userId,
        invoiceDate: invoice_date,
        clientName: client_name ?? null,
        clientGstin: client_gstin ?? null,
        placeOfSupply: place_of_supply ?? null,
        timeEntryIds: time_entry_ids,
        lineItems: line_items,
        notes: notes ?? null,
        db,
    });
    if (!result.ok) return void res.status(400).json({ detail: result.error });
    res.status(201).json(result.invoice);
});

// PATCH invoice status
projectBillingRouter.patch(
    "/invoices/:invoiceId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const { projectId, invoiceId } = req.params;
        const { status } = req.body as { status?: string };
        const db = createServerSupabase();
        const access = await checkProjectAccess(
            projectId,
            userId,
            userEmail,
            db,
        );
        if (!access.ok)
            return void res.status(404).json({ detail: "Project not found" });
        if (status !== "draft" && status !== "sent" && status !== "paid")
            return void res.status(400).json({ detail: "Invalid status" });

        const { data, error } = await db
            .from("invoices")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", invoiceId)
            .eq("project_id", projectId)
            .select(
                "id, project_id, user_id, invoice_number, invoice_date, client_name, client_gstin, place_of_supply, sac_code, line_items, subtotal, cgst, sgst, igst, total, status, notes, created_at, updated_at",
            )
            .single();
        if (error || !data)
            return void res.status(404).json({ detail: "Invoice not found" });
        res.json(data);
    },
);
