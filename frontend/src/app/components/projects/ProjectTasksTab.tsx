"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListChecks, Loader2, Plus } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    applyMatterTemplate,
    createProjectTask,
    deleteProjectTask,
    listMatterTemplates,
    listProjectTasks,
    updateProjectTask,
} from "@/app/lib/mikeApi";
import type {
    MatterTemplate,
    ProjectTask,
} from "@/app/components/shared/types";
import { NAME_COL_W } from "./ProjectPageParts";

function sourceLabel(task: ProjectTask): string {
    return task.source === "template" ? "Template" : task.source;
}

export function ProjectTasksTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const stickyCellBg = "bg-[#fafbfc]";
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");

    const [templates, setTemplates] = useState<MatterTemplate[]>([]);
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const templateMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([listProjectTasks(projectId), listMatterTemplates()])
            .then(([taskRows, templateRows]) => {
                if (cancelled) return;
                setTasks(taskRows);
                setTemplates(templateRows);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load checklist.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    useEffect(() => {
        if (!templateMenuOpen) return;
        function onClick(e: MouseEvent) {
            if (
                templateMenuRef.current &&
                !templateMenuRef.current.contains(e.target as Node)
            ) {
                setTemplateMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [templateMenuOpen]);

    const filtered = search
        ? tasks.filter((t) =>
              t.title.toLowerCase().includes(search.toLowerCase()),
          )
        : tasks;

    async function submitNewTask() {
        const title = newTitle.trim();
        if (!title || saving) return;
        setSaving(true);
        try {
            const created = await createProjectTask(projectId, { title });
            setTasks((prev) => [...prev, created]);
            setNewTitle("");
            setAdding(false);
        } catch {
            setError("Failed to save task.");
        } finally {
            setSaving(false);
        }
    }

    async function submitEdit(taskId: string) {
        const title = editTitle.trim();
        setEditingId(null);
        if (!title) return;
        const existing = tasks.find((t) => t.id === taskId);
        if (!existing || existing.title === title) return;
        try {
            const updated = await updateProjectTask(projectId, taskId, {
                title,
            });
            setTasks((prev) =>
                prev.map((t) => (t.id === taskId ? updated : t)),
            );
        } catch {
            setError("Failed to update task.");
        }
    }

    async function toggleStatus(task: ProjectTask) {
        const status = task.status === "pending" ? "done" : "pending";
        setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status } : t)),
        );
        try {
            await updateProjectTask(projectId, task.id, { status });
        } catch {
            setError("Failed to update task.");
            setTasks((prev) =>
                prev.map((t) =>
                    t.id === task.id ? { ...t, status: task.status } : t,
                ),
            );
        }
    }

    async function handleDelete(taskId: string) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        try {
            await deleteProjectTask(projectId, taskId);
        } catch {
            setError("Failed to delete task.");
        }
    }

    async function handleApplyTemplate(templateId: string) {
        setTemplateMenuOpen(false);
        if (applying) return;
        setApplying(true);
        try {
            const result = await applyMatterTemplate(projectId, templateId);
            setTasks(result.tasks);
        } catch {
            setError("Failed to apply template.");
        } finally {
            setApplying(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading checklist…
            </div>
        );
    }

    const pendingCount = tasks.filter((t) => t.status === "pending").length;

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
                <div className="relative" ref={templateMenuRef}>
                    <button
                        onClick={() => setTemplateMenuOpen((open) => !open)}
                        disabled={applying}
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs text-gray-600 transition-colors hover:border-gray-400 disabled:opacity-40"
                    >
                        {applying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        Apply template
                        <ChevronDown className="h-3 w-3" />
                    </button>
                    {templateMenuOpen && (
                        <div className="absolute left-0 top-8 z-[70] w-72 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            {templates.map((template) => (
                                <button
                                    key={template.id}
                                    onClick={() =>
                                        void handleApplyTemplate(template.id)
                                    }
                                    className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                                >
                                    <span className="block text-sm text-gray-800">
                                        {template.name}
                                        <span className="ml-1 text-xs text-gray-400">
                                            {template.task_count} tasks
                                        </span>
                                    </span>
                                    <span className="block text-xs text-gray-400">
                                        {template.description}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {tasks.length > 0 && (
                    <span className="text-xs text-gray-400">
                        {pendingCount} of {tasks.length} pending
                    </span>
                )}
            </div>

            <div className="flex items-center h-8 pr-8 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                <div
                    className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} flex items-center gap-4 self-stretch pl-4 pr-2 text-left`}
                >
                    <span>Task</span>
                </div>
                <div className="ml-auto w-24 shrink-0 text-left">Source</div>
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
                            if (e.key === "Enter") void submitNewTask();
                            if (e.key === "Escape") setAdding(false);
                        }}
                        maxLength={300}
                        placeholder="e.g. Prepare markup of clause 7"
                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <button
                        onClick={() => void submitNewTask()}
                        disabled={saving || !newTitle.trim()}
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
                        Add task
                    </button>
                </div>
            )}

            {tasks.length === 0 && !adding ? (
                <div className="flex flex-col items-start py-24 w-full max-w-xs mx-auto">
                    <ListChecks className="h-8 w-8 text-gray-300 mb-4" />
                    <p className="text-2xl font-medium font-serif text-gray-900">
                        Matter Checklist
                    </p>
                    <p className="mt-1 text-xs text-gray-400 max-w-xs">
                        Track the work this matter needs. Apply a template for
                        common matter types (M&amp;A diligence, NDA review,
                        litigation, lease analysis), add your own tasks, or
                        let the assistant save action items as they come up in
                        chat.
                    </p>
                </div>
            ) : (
                <div>
                    {filtered.map((task) => (
                        <div
                            key={task.id}
                            className="group flex items-center min-h-10 pr-8 border-b border-gray-50 hover:bg-gray-100 transition-colors"
                        >
                            <div
                                className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} py-2 pl-4 pr-2 transition-colors group-hover:bg-gray-100`}
                            >
                                <div className="flex items-center gap-4">
                                    <input
                                        type="checkbox"
                                        checked={task.status === "done"}
                                        onChange={() =>
                                            void toggleStatus(task)
                                        }
                                        title={
                                            task.status === "done"
                                                ? "Mark as pending"
                                                : "Mark as done"
                                        }
                                        className="h-2.5 w-2.5 shrink-0 rounded border-gray-200 cursor-pointer accent-black"
                                    />
                                    {editingId === task.id ? (
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
                                                            task.id,
                                                        );
                                                    if (e.key === "Escape")
                                                        setEditingId(null);
                                                }}
                                                maxLength={300}
                                                className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none"
                                            />
                                            <button
                                                onClick={() =>
                                                    void submitEdit(task.id)
                                                }
                                                className="h-7 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-700"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="min-w-0 flex-1">
                                            <span
                                                className={`block whitespace-normal break-words text-sm ${task.status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}
                                            >
                                                {task.title}
                                            </span>
                                            {task.notes && (
                                                <span className="block text-xs text-gray-400 whitespace-normal break-words">
                                                    {task.notes}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="ml-auto w-24 shrink-0 text-sm text-gray-500 capitalize">
                                {sourceLabel(task)}
                            </div>
                            <div className="w-8 shrink-0 flex justify-end">
                                <RowActions
                                    renameLabel="Edit"
                                    onRename={() => {
                                        setEditTitle(task.title);
                                        setEditingId(task.id);
                                    }}
                                    onDelete={() => void handleDelete(task.id)}
                                />
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && tasks.length > 0 && (
                        <div className="px-4 py-8 text-sm text-gray-400">
                            No tasks match your search.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
