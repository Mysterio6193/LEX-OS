"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Plus } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    createProjectDeadline,
    deleteProjectDeadline,
    listProjectDeadlines,
    updateProjectDeadline,
} from "@/app/lib/mikeApi";
import type { ProjectDeadline } from "@/app/components/shared/types";
import { formatDate, NAME_COL_W } from "./ProjectPageParts";

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function DueBadge({ deadline }: { deadline: ProjectDeadline }) {
    if (deadline.status === "done") {
        return (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                Done
            </span>
        );
    }
    const overdue = deadline.due_date < todayIso();
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
        >
            {overdue ? "Overdue" : "Pending"}
        </span>
    );
}

export function ProjectDeadlinesTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const stickyCellBg = "bg-[#fafbfc]";
    const [deadlines, setDeadlines] = useState<ProjectDeadline[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDueDate, setNewDueDate] = useState("");
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDueDate, setEditDueDate] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        listProjectDeadlines(projectId)
            .then((rows) => {
                if (!cancelled) setDeadlines(rows);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load deadlines.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const sorted = [...deadlines].sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        return a.due_date.localeCompare(b.due_date);
    });
    const filtered = search
        ? sorted.filter((d) =>
              d.title.toLowerCase().includes(search.toLowerCase()),
          )
        : sorted;

    async function submitNewDeadline() {
        const title = newTitle.trim();
        if (!title || !newDueDate || saving) return;
        setSaving(true);
        try {
            const created = await createProjectDeadline(projectId, {
                title,
                due_date: newDueDate,
            });
            setDeadlines((prev) => [...prev, created]);
            setNewTitle("");
            setNewDueDate("");
            setAdding(false);
        } catch {
            setError("Failed to save deadline.");
        } finally {
            setSaving(false);
        }
    }

    async function submitEdit(deadlineId: string) {
        const title = editTitle.trim();
        setEditingId(null);
        if (!title || !editDueDate) return;
        const existing = deadlines.find((d) => d.id === deadlineId);
        if (
            !existing ||
            (existing.title === title && existing.due_date === editDueDate)
        )
            return;
        try {
            const updated = await updateProjectDeadline(projectId, deadlineId, {
                title,
                due_date: editDueDate,
            });
            setDeadlines((prev) =>
                prev.map((d) => (d.id === deadlineId ? updated : d)),
            );
        } catch {
            setError("Failed to update deadline.");
        }
    }

    async function toggleStatus(deadline: ProjectDeadline) {
        const status = deadline.status === "pending" ? "done" : "pending";
        setDeadlines((prev) =>
            prev.map((d) => (d.id === deadline.id ? { ...d, status } : d)),
        );
        try {
            await updateProjectDeadline(projectId, deadline.id, { status });
        } catch {
            setError("Failed to update deadline.");
            setDeadlines((prev) =>
                prev.map((d) =>
                    d.id === deadline.id
                        ? { ...d, status: deadline.status }
                        : d,
                ),
            );
        }
    }

    async function handleDelete(deadlineId: string) {
        setDeadlines((prev) => prev.filter((d) => d.id !== deadlineId));
        try {
            await deleteProjectDeadline(projectId, deadlineId);
        } catch {
            setError("Failed to delete deadline.");
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading deadlines…
            </div>
        );
    }

    return (
        <>
            <div className="flex items-center h-8 pr-8 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                <div
                    className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} flex items-center gap-4 self-stretch pl-4 pr-2 text-left`}
                >
                    <span>Deadline</span>
                </div>
                <div className="ml-auto w-28 shrink-0 text-left">Due</div>
                <div className="w-24 shrink-0 text-left">Status</div>
                <div className="w-24 shrink-0 text-left">Source</div>
                <div className="w-8 shrink-0" />
            </div>

            {error && (
                <div className="px-4 py-2 text-xs text-red-600">{error}</div>
            )}

            {adding ? (
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                    <input
                        autoFocus
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void submitNewDeadline();
                            if (e.key === "Escape") setAdding(false);
                        }}
                        maxLength={300}
                        placeholder="e.g. File statement of defence"
                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                    />
                    <button
                        onClick={() => void submitNewDeadline()}
                        disabled={saving || !newTitle.trim() || !newDueDate}
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
                        Add deadline
                    </button>
                </div>
            )}

            {deadlines.length === 0 && !adding ? (
                <div className="flex flex-col items-start py-24 w-full max-w-xs mx-auto">
                    <CalendarClock className="h-8 w-8 text-gray-300 mb-4" />
                    <p className="text-2xl font-medium font-serif text-gray-900">
                        Matter Deadlines
                    </p>
                    <p className="mt-1 text-xs text-gray-400 max-w-xs">
                        Date-bound obligations tracked here are visible to the
                        assistant in every chat. The assistant saves deadlines
                        automatically when you mention them, and you can add
                        your own.
                    </p>
                </div>
            ) : (
                <div>
                    {filtered.map((deadline) => (
                        <div
                            key={deadline.id}
                            className="group flex items-center min-h-10 pr-8 border-b border-gray-50 hover:bg-gray-100 transition-colors"
                        >
                            <div
                                className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} py-2 pl-4 pr-2 transition-colors group-hover:bg-gray-100`}
                            >
                                <div className="flex items-center gap-4">
                                    <input
                                        type="checkbox"
                                        checked={deadline.status === "done"}
                                        onChange={() =>
                                            void toggleStatus(deadline)
                                        }
                                        title={
                                            deadline.status === "done"
                                                ? "Mark as pending"
                                                : "Mark as done"
                                        }
                                        className="h-2.5 w-2.5 shrink-0 rounded border-gray-200 cursor-pointer accent-black"
                                    />
                                    {editingId === deadline.id ? (
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <input
                                                autoFocus
                                                value={editTitle}
                                                onChange={(e) =>
                                                    setEditTitle(
                                                        e.target.value,
                                                    )
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter")
                                                        void submitEdit(
                                                            deadline.id,
                                                        );
                                                    if (e.key === "Escape")
                                                        setEditingId(null);
                                                }}
                                                maxLength={300}
                                                className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none"
                                            />
                                            <input
                                                type="date"
                                                value={editDueDate}
                                                onChange={(e) =>
                                                    setEditDueDate(
                                                        e.target.value,
                                                    )
                                                }
                                                className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                                            />
                                            <button
                                                onClick={() =>
                                                    void submitEdit(
                                                        deadline.id,
                                                    )
                                                }
                                                className="h-7 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-700"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    ) : (
                                        <span
                                            className={`min-w-0 flex-1 whitespace-normal break-words text-sm ${deadline.status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}
                                        >
                                            {deadline.title}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="ml-auto w-28 shrink-0 text-sm text-gray-500 truncate">
                                {formatDate(deadline.due_date)}
                            </div>
                            <div className="w-24 shrink-0">
                                <DueBadge deadline={deadline} />
                            </div>
                            <div className="w-24 shrink-0 text-sm text-gray-500 capitalize">
                                {deadline.source}
                            </div>
                            <div className="w-8 shrink-0 flex justify-end">
                                <RowActions
                                    renameLabel="Edit"
                                    onRename={() => {
                                        setEditTitle(deadline.title);
                                        setEditDueDate(deadline.due_date);
                                        setEditingId(deadline.id);
                                    }}
                                    onDelete={() =>
                                        void handleDelete(deadline.id)
                                    }
                                />
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && deadlines.length > 0 && (
                        <div className="px-4 py-8 text-sm text-gray-400">
                            No deadlines match your search.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
