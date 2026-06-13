"use client";

import { useEffect, useState } from "react";
import { Gavel, Loader2, Plus } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    createProjectHearing,
    deleteProjectHearing,
    listProjectHearings,
    updateProjectHearing,
} from "@/app/lib/mikeApi";
import type { ProjectHearing } from "@/app/components/shared/types";
import { formatDate, NAME_COL_W } from "./ProjectPageParts";

export function ProjectHearingsTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const stickyCellBg = "bg-[#fafbfc]";
    const [hearings, setHearings] = useState<ProjectHearing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newPurpose, setNewPurpose] = useState("");
    const [newDate, setNewDate] = useState("");
    const [newCourt, setNewCourt] = useState("");
    const [newCaseNumber, setNewCaseNumber] = useState("");
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPurpose, setEditPurpose] = useState("");
    const [editDate, setEditDate] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        listProjectHearings(projectId)
            .then((rows) => {
                if (!cancelled) setHearings(rows);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load hearings.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const sorted = [...hearings].sort((a, b) => {
        const aDone = a.status === "done";
        const bDone = b.status === "done";
        if (aDone !== bDone) return aDone ? 1 : -1;
        return a.hearing_date.localeCompare(b.hearing_date);
    });
    const filtered = search
        ? sorted.filter(
              (h) =>
                  h.purpose.toLowerCase().includes(search.toLowerCase()) ||
                  (h.court ?? "")
                      .toLowerCase()
                      .includes(search.toLowerCase()) ||
                  (h.case_number ?? "")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
          )
        : sorted;

    async function submitNew() {
        const purpose = newPurpose.trim();
        if (!purpose || !newDate || saving) return;
        setSaving(true);
        try {
            const created = await createProjectHearing(projectId, {
                purpose,
                hearing_date: newDate,
                court: newCourt.trim() || undefined,
                case_number: newCaseNumber.trim() || undefined,
            });
            setHearings((prev) => [...prev, created]);
            setNewPurpose("");
            setNewDate("");
            setNewCourt("");
            setNewCaseNumber("");
            setAdding(false);
        } catch {
            setError("Failed to save hearing.");
        } finally {
            setSaving(false);
        }
    }

    async function submitEdit(hearingId: string) {
        const purpose = editPurpose.trim();
        setEditingId(null);
        if (!purpose || !editDate) return;
        const existing = hearings.find((h) => h.id === hearingId);
        if (
            !existing ||
            (existing.purpose === purpose && existing.hearing_date === editDate)
        )
            return;
        try {
            const updated = await updateProjectHearing(projectId, hearingId, {
                purpose,
                hearing_date: editDate,
            });
            setHearings((prev) =>
                prev.map((h) => (h.id === hearingId ? updated : h)),
            );
        } catch {
            setError("Failed to update hearing.");
        }
    }

    async function setStatus(
        hearing: ProjectHearing,
        status: ProjectHearing["status"],
    ) {
        setHearings((prev) =>
            prev.map((h) => (h.id === hearing.id ? { ...h, status } : h)),
        );
        try {
            await updateProjectHearing(projectId, hearing.id, { status });
        } catch {
            setError("Failed to update hearing.");
            setHearings((prev) =>
                prev.map((h) =>
                    h.id === hearing.id
                        ? { ...h, status: hearing.status }
                        : h,
                ),
            );
        }
    }

    async function handleDelete(hearingId: string) {
        setHearings((prev) => prev.filter((h) => h.id !== hearingId));
        try {
            await deleteProjectHearing(projectId, hearingId);
        } catch {
            setError("Failed to delete hearing.");
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading hearings…
            </div>
        );
    }

    return (
        <>
            <div className="flex items-center h-8 pr-8 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                <div
                    className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} flex items-center gap-4 self-stretch pl-4 pr-2 text-left`}
                >
                    <span>Purpose / Stage</span>
                </div>
                <div className="ml-auto w-44 shrink-0 text-left">Court</div>
                <div className="w-28 shrink-0 text-left">Case No.</div>
                <div className="w-28 shrink-0 text-left">Date</div>
                <div className="w-24 shrink-0 text-left">Status</div>
                <div className="w-8 shrink-0" />
            </div>

            {error && (
                <div className="px-4 py-2 text-xs text-red-600">{error}</div>
            )}

            {adding ? (
                <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
                    <input
                        autoFocus
                        value={newPurpose}
                        onChange={(e) => setNewPurpose(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void submitNew();
                            if (e.key === "Escape") setAdding(false);
                        }}
                        maxLength={300}
                        placeholder="e.g. Arguments on interim application"
                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <input
                        value={newCourt}
                        onChange={(e) => setNewCourt(e.target.value)}
                        maxLength={200}
                        placeholder="Court"
                        className="w-44 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <input
                        value={newCaseNumber}
                        onChange={(e) => setNewCaseNumber(e.target.value)}
                        maxLength={200}
                        placeholder="Case no."
                        className="w-32 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                    />
                    <button
                        onClick={() => void submitNew()}
                        disabled={saving || !newPurpose.trim() || !newDate}
                        className="inline-flex h-7 items-center gap-1 rounded-full bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
                    >
                        {saving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        Save
                    </button>
                    <button
                        onClick={() => setAdding(false)}
                        className="h-7 rounded-full px-3 text-xs text-gray-500 transition-colors hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <div className="border-b border-gray-50 px-4 py-2">
                    <button
                        onClick={() => setAdding(true)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-800"
                    >
                        <Plus className="h-3 w-3" />
                        Add hearing
                    </button>
                </div>
            )}

            {hearings.length === 0 && !adding ? (
                <div className="flex flex-col items-start py-24 w-full max-w-xs mx-auto">
                    <Gavel className="h-8 w-8 text-gray-300 mb-4" />
                    <p className="text-2xl font-medium font-serif text-gray-900">
                        Court Hearings
                    </p>
                    <p className="mt-1 text-xs text-gray-400 max-w-xs">
                        Track this matter&apos;s cause list — court, case
                        number, next date, and stage. The assistant records
                        hearings automatically when you mention a listing, and
                        upcoming dates stay visible to it in every chat.
                    </p>
                </div>
            ) : (
                <div>
                    {filtered.map((hearing) => (
                        <div
                            key={hearing.id}
                            className="group flex items-center min-h-10 pr-8 border-b border-gray-50 hover:bg-gray-100 transition-colors"
                        >
                            <div
                                className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} py-2 pl-4 pr-2 transition-colors group-hover:bg-gray-100`}
                            >
                                {editingId === hearing.id ? (
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <input
                                            autoFocus
                                            value={editPurpose}
                                            onChange={(e) =>
                                                setEditPurpose(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter")
                                                    void submitEdit(hearing.id);
                                                if (e.key === "Escape")
                                                    setEditingId(null);
                                            }}
                                            maxLength={300}
                                            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none"
                                        />
                                        <input
                                            type="date"
                                            value={editDate}
                                            onChange={(e) =>
                                                setEditDate(e.target.value)
                                            }
                                            className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                                        />
                                        <button
                                            onClick={() =>
                                                void submitEdit(hearing.id)
                                            }
                                            className="h-7 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-700"
                                        >
                                            Save
                                        </button>
                                    </div>
                                ) : (
                                    <span
                                        className={`min-w-0 flex-1 whitespace-normal break-words text-sm ${hearing.status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}
                                    >
                                        {hearing.purpose}
                                    </span>
                                )}
                            </div>
                            <div className="ml-auto w-44 shrink-0 truncate text-sm text-gray-500">
                                {hearing.court ?? "—"}
                            </div>
                            <div className="w-28 shrink-0 truncate text-sm text-gray-500">
                                {hearing.case_number ?? "—"}
                            </div>
                            <div className="w-28 shrink-0 text-sm text-gray-500">
                                {formatDate(hearing.hearing_date)}
                            </div>
                            <div className="w-24 shrink-0">
                                <select
                                    value={hearing.status}
                                    onChange={(e) =>
                                        void setStatus(
                                            hearing,
                                            e.target
                                                .value as ProjectHearing["status"],
                                        )
                                    }
                                    title="Change status"
                                    className="rounded border border-transparent bg-transparent py-0.5 text-xs text-gray-600 outline-none hover:border-gray-200 focus:border-gray-300"
                                >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="adjourned">Adjourned</option>
                                    <option value="done">Done</option>
                                </select>
                            </div>
                            <div className="w-8 shrink-0 flex justify-end">
                                <RowActions
                                    renameLabel="Edit"
                                    onRename={() => {
                                        setEditPurpose(hearing.purpose);
                                        setEditDate(hearing.hearing_date);
                                        setEditingId(hearing.id);
                                    }}
                                    onDelete={() =>
                                        void handleDelete(hearing.id)
                                    }
                                />
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && hearings.length > 0 && (
                        <div className="px-4 py-8 text-sm text-gray-400">
                            No hearings match your search.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
