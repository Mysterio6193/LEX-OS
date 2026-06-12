"use client";

import { useEffect, useState } from "react";
import { Brain, Loader2, Plus } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    createProjectMemory,
    deleteProjectMemory,
    listProjectMemories,
    updateProjectMemory,
} from "@/app/lib/mikeApi";
import type {
    ProjectMemory,
    ProjectMemoryKind,
} from "@/app/components/shared/types";
import { formatDate, NAME_COL_W } from "./ProjectPageParts";

const KIND_OPTIONS: { value: ProjectMemoryKind; label: string }[] = [
    { value: "decision", label: "Decision" },
    { value: "fact", label: "Fact" },
    { value: "preference", label: "Preference" },
];

const KIND_BADGE_CLASSES: Record<ProjectMemoryKind, string> = {
    decision: "bg-green-50 text-green-700",
    fact: "bg-blue-50 text-blue-700",
    preference: "bg-violet-50 text-violet-700",
};

function KindBadge({ kind }: { kind: ProjectMemoryKind }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${KIND_BADGE_CLASSES[kind] ?? "bg-gray-50 text-gray-600"}`}
        >
            {kind}
        </span>
    );
}

export function ProjectMemoryTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const stickyCellBg = "bg-[#fafbfc]";
    const [memories, setMemories] = useState<ProjectMemory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newKind, setNewKind] = useState<ProjectMemoryKind>("fact");
    const [newContent, setNewContent] = useState("");
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        listProjectMemories(projectId)
            .then((rows) => {
                if (!cancelled) setMemories(rows);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load matter memory.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const filtered = search
        ? memories.filter((m) =>
              m.content.toLowerCase().includes(search.toLowerCase()),
          )
        : memories;

    async function submitNewMemory() {
        const content = newContent.trim();
        if (!content || saving) return;
        setSaving(true);
        try {
            const created = await createProjectMemory(projectId, {
                kind: newKind,
                content,
            });
            setMemories((prev) => [created, ...prev]);
            setNewContent("");
            setNewKind("fact");
            setAdding(false);
        } catch {
            setError("Failed to save memory.");
        } finally {
            setSaving(false);
        }
    }

    async function submitEdit(memoryId: string) {
        const content = editContent.trim();
        setEditingId(null);
        if (!content) return;
        const existing = memories.find((m) => m.id === memoryId);
        if (!existing || existing.content === content) return;
        try {
            const updated = await updateProjectMemory(projectId, memoryId, {
                content,
            });
            setMemories((prev) =>
                prev.map((m) => (m.id === memoryId ? updated : m)),
            );
        } catch {
            setError("Failed to update memory.");
        }
    }

    async function handleDelete(memoryId: string) {
        setMemories((prev) => prev.filter((m) => m.id !== memoryId));
        try {
            await deleteProjectMemory(projectId, memoryId);
        } catch {
            setError("Failed to delete memory.");
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading matter memory…
            </div>
        );
    }

    return (
        <>
            <div className="flex items-center h-8 pr-8 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                <div
                    className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} flex items-center gap-4 self-stretch pl-4 pr-2 text-left`}
                >
                    <span>Memory</span>
                </div>
                <div className="ml-auto w-24 shrink-0 text-left">Kind</div>
                <div className="w-24 shrink-0 text-left">Source</div>
                <div className="w-32 shrink-0 text-left">Created</div>
                <div className="w-8 shrink-0" />
            </div>

            {error && (
                <div className="px-4 py-2 text-xs text-red-600">{error}</div>
            )}

            {adding ? (
                <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3">
                    <select
                        value={newKind}
                        onChange={(e) =>
                            setNewKind(e.target.value as ProjectMemoryKind)
                        }
                        className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                    >
                        {KIND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <textarea
                        autoFocus
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void submitNewMemory();
                            }
                            if (e.key === "Escape") setAdding(false);
                        }}
                        rows={2}
                        maxLength={2000}
                        placeholder="e.g. Client accepted the 12-month liability cap on 12 June."
                        className="min-w-0 flex-1 resize-none rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <button
                        onClick={() => void submitNewMemory()}
                        disabled={saving || !newContent.trim()}
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
                        Add memory
                    </button>
                </div>
            )}

            {memories.length === 0 && !adding ? (
                <div className="flex flex-col items-start py-24 w-full max-w-xs mx-auto">
                    <Brain className="h-8 w-8 text-gray-300 mb-4" />
                    <p className="text-2xl font-medium font-serif text-gray-900">
                        Matter Memory
                    </p>
                    <p className="mt-1 text-xs text-gray-400 max-w-xs">
                        Decisions, facts, and preferences saved here persist
                        across every chat in this project. The assistant saves
                        key items automatically as you work, and you can add
                        your own.
                    </p>
                </div>
            ) : (
                <div>
                    {filtered.map((memory) => (
                        <div
                            key={memory.id}
                            className="group flex items-center min-h-10 pr-8 border-b border-gray-50 hover:bg-gray-100 transition-colors"
                        >
                            <div
                                className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} py-2 pl-4 pr-2 transition-colors group-hover:bg-gray-100`}
                            >
                                {editingId === memory.id ? (
                                    <textarea
                                        autoFocus
                                        value={editContent}
                                        onChange={(e) =>
                                            setEditContent(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                !e.shiftKey
                                            ) {
                                                e.preventDefault();
                                                void submitEdit(memory.id);
                                            }
                                            if (e.key === "Escape")
                                                setEditingId(null);
                                        }}
                                        onBlur={() =>
                                            void submitEdit(memory.id)
                                        }
                                        rows={2}
                                        maxLength={2000}
                                        className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none"
                                    />
                                ) : (
                                    <p className="whitespace-normal break-words text-sm text-gray-800">
                                        {memory.content}
                                    </p>
                                )}
                            </div>
                            <div className="ml-auto w-24 shrink-0">
                                <KindBadge kind={memory.kind} />
                            </div>
                            <div className="w-24 shrink-0 text-sm text-gray-500 capitalize">
                                {memory.source}
                            </div>
                            <div className="w-32 shrink-0 text-sm text-gray-500 truncate">
                                {formatDate(memory.created_at)}
                            </div>
                            <div className="w-8 shrink-0 flex justify-end">
                                <RowActions
                                    renameLabel="Edit"
                                    onRename={() => {
                                        setEditContent(memory.content);
                                        setEditingId(memory.id);
                                    }}
                                    onDelete={() =>
                                        void handleDelete(memory.id)
                                    }
                                />
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && memories.length > 0 && (
                        <div className="px-4 py-8 text-sm text-gray-400">
                            No memory entries match your search.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
