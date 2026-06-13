import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import {
    listProjectHearings,
    normalizeHearingDate,
    normalizeHearingField,
    normalizeHearingNotes,
    normalizeHearingPurpose,
    normalizeHearingStatus,
    saveProjectHearing,
} from "../lib/projectHearings";

const HEARING_COLUMNS =
    "id, project_id, user_id, purpose, court, case_number, hearing_date, notes, status, source, source_chat_id, created_at, updated_at";

export const projectHearingsRouter = Router({ mergeParams: true });

// GET /projects/:projectId/hearings — list all hearings for the matter
projectHearingsRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const hearings = await listProjectHearings(projectId, db);
    res.json(hearings);
});

// POST /projects/:projectId/hearings — add a hearing manually
projectHearingsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params;
    const { purpose, hearing_date, court, case_number, notes } = req.body as {
        purpose?: string;
        hearing_date?: string;
        court?: string;
        case_number?: string;
        notes?: string;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const saved = await saveProjectHearing({
        projectId,
        userId,
        purpose: purpose ?? "",
        hearingDate: hearing_date ?? "",
        court: court ?? null,
        caseNumber: case_number ?? null,
        notes: notes ?? null,
        source: "user",
        db,
    });
    if (!saved.ok) return void res.status(400).json({ detail: saved.error });

    const { data } = await db
        .from("project_hearings")
        .select(HEARING_COLUMNS)
        .eq("id", saved.id)
        .single();
    res.status(201).json(data);
});

// PATCH /projects/:projectId/hearings/:hearingId — edit / adjourn / complete
projectHearingsRouter.patch("/:hearingId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, hearingId } = req.params;
    const { purpose, hearing_date, court, case_number, notes, status } =
        req.body as {
            purpose?: string;
            hearing_date?: string;
            court?: string | null;
            case_number?: string | null;
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
    if (purpose !== undefined) {
        const normalized = normalizeHearingPurpose(purpose);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "Hearing purpose is required" });
        updates.purpose = normalized;
    }
    if (hearing_date !== undefined) {
        const normalized = normalizeHearingDate(hearing_date);
        if (!normalized)
            return void res
                .status(400)
                .json({ detail: "hearing_date must be a valid YYYY-MM-DD date" });
        updates.hearing_date = normalized;
    }
    if (court !== undefined) updates.court = normalizeHearingField(court);
    if (case_number !== undefined)
        updates.case_number = normalizeHearingField(case_number);
    if (notes !== undefined) updates.notes = normalizeHearingNotes(notes);
    if (status !== undefined) {
        const normalized = normalizeHearingStatus(status);
        if (!normalized)
            return void res.status(400).json({ detail: "Invalid status" });
        updates.status = normalized;
    }

    const { data, error } = await db
        .from("project_hearings")
        .update(updates)
        .eq("id", hearingId)
        .eq("project_id", projectId)
        .select(HEARING_COLUMNS)
        .single();
    if (error || !data)
        return void res.status(404).json({ detail: "Hearing not found" });
    res.json(data);
});

// DELETE /projects/:projectId/hearings/:hearingId — remove an entry
projectHearingsRouter.delete("/:hearingId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, hearingId } = req.params;
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });

    const { error } = await db
        .from("project_hearings")
        .delete()
        .eq("id", hearingId)
        .eq("project_id", projectId);
    if (error)
        return void res
            .status(500)
            .json({ detail: "Failed to delete hearing" });
    res.status(204).end();
});
