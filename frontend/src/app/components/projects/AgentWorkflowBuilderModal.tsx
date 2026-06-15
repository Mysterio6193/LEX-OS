"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import {
    createAgentWorkflow,
    deleteAgentWorkflow,
    listAgentWorkflows,
    listAgentWorkflowTools,
    updateAgentWorkflow,
} from "@/app/lib/mikeApi";
import type {
    AgentWorkflow,
    AgentWorkflowStep,
    AgentWorkflowToolOption,
} from "@/app/components/shared/types";

type Draft = {
    id: string | null;
    name: string;
    practice: string;
    description: string;
    steps: AgentWorkflowStep[];
};

const EMPTY: Draft = {
    id: null,
    name: "",
    practice: "",
    description: "",
    steps: [{ intent: "", tool: null }],
};

export function AgentWorkflowBuilderModal({
    open,
    onClose,
    onChanged,
}: {
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [custom, setCustom] = useState<AgentWorkflow[]>([]);
    const [tools, setTools] = useState<AgentWorkflowToolOption[]>([]);
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(EMPTY);
        setError(null);
        Promise.allSettled([listAgentWorkflows(), listAgentWorkflowTools()]).then(
            ([w, t]) => {
                if (w.status === "fulfilled")
                    setCustom(w.value.filter((x) => x.is_custom));
                if (t.status === "fulfilled") setTools(t.value);
            },
        );
    }, [open]);

    if (!open) return null;

    function refresh() {
        listAgentWorkflows()
            .then((w) => setCustom(w.filter((x) => x.is_custom)))
            .catch(() => {});
        onChanged();
    }

    async function save() {
        const name = draft.name.trim();
        const steps = draft.steps
            .map((s) => ({ intent: s.intent.trim(), tool: s.tool || null }))
            .filter((s) => s.intent);
        if (!name || steps.length === 0) {
            setError("Add a name and at least one step.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (draft.id) {
                await updateAgentWorkflow(draft.id, {
                    name,
                    practice: draft.practice.trim() || null,
                    description: draft.description.trim() || null,
                    steps,
                });
            } else {
                await createAgentWorkflow({
                    name,
                    practice: draft.practice.trim() || undefined,
                    description: draft.description.trim() || undefined,
                    steps,
                });
            }
            setDraft(EMPTY);
            refresh();
        } catch {
            setError("Failed to save workflow.");
        } finally {
            setSaving(false);
        }
    }

    async function remove(id: string) {
        setCustom((prev) => prev.filter((w) => w.id !== id));
        try {
            await deleteAgentWorkflow(id);
            onChanged();
        } catch {
            refresh();
        }
    }

    function edit(w: AgentWorkflow) {
        setDraft({
            id: w.id,
            name: w.name,
            practice: w.practice === "Custom" ? "" : w.practice,
            description: w.description,
            steps: w.steps.length ? w.steps : [{ intent: "", tool: null }],
        });
    }

    function setStep(i: number, patch: Partial<AgentWorkflowStep>) {
        setDraft((d) => ({
            ...d,
            steps: d.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
        }));
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">
                        Agent workflows
                    </span>
                    <button
                        onClick={onClose}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {/* Existing custom workflows */}
                    {custom.length > 0 && (
                        <div className="mb-4 space-y-1">
                            {custom.map((w) => (
                                <div
                                    key={w.id}
                                    className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="font-medium text-gray-800">
                                            {w.name}
                                        </span>
                                        <span className="ml-2 text-xs text-gray-400">
                                            {w.steps.length} steps
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => edit(w)}
                                        className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:border-gray-400"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => void remove(w.id)}
                                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Editor */}
                    <div className="rounded-lg border border-gray-200 p-3">
                        <p className="mb-2 text-xs font-medium text-gray-700">
                            {draft.id ? "Edit workflow" : "New workflow"}
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                                value={draft.name}
                                onChange={(e) =>
                                    setDraft({ ...draft, name: e.target.value })
                                }
                                placeholder="Name (e.g. NDA review playbook)"
                                maxLength={200}
                                className="h-9 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-gray-300"
                            />
                            <input
                                value={draft.practice}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        practice: e.target.value,
                                    })
                                }
                                placeholder="Practice area (optional)"
                                className="h-9 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-gray-300"
                            />
                        </div>
                        <input
                            value={draft.description}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    description: e.target.value,
                                })
                            }
                            placeholder="Short description (optional)"
                            className="mt-2 h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-gray-300"
                        />

                        <p className="mb-1 mt-3 text-xs font-medium text-gray-700">
                            Steps
                        </p>
                        <div className="space-y-2">
                            {draft.steps.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="w-5 text-right text-xs text-gray-400">
                                        {i + 1}.
                                    </span>
                                    <input
                                        value={s.intent}
                                        onChange={(e) =>
                                            setStep(i, { intent: e.target.value })
                                        }
                                        placeholder="What this step does"
                                        maxLength={300}
                                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-gray-400"
                                    />
                                    <select
                                        value={s.tool ?? ""}
                                        onChange={(e) =>
                                            setStep(i, {
                                                tool: e.target.value || null,
                                            })
                                        }
                                        className="h-7 w-40 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                                    >
                                        <option value="">No tool</option>
                                        {tools.map((t) => (
                                            <option key={t.name} value={t.name}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() =>
                                            setDraft((d) => ({
                                                ...d,
                                                steps: d.steps.filter(
                                                    (_, idx) => idx !== i,
                                                ),
                                            }))
                                        }
                                        className="rounded p-1 text-gray-400 hover:bg-gray-100"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() =>
                                setDraft((d) => ({
                                    ...d,
                                    steps: [...d.steps, { intent: "", tool: null }],
                                }))
                            }
                            className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                        >
                            <Plus className="h-3 w-3" />
                            Add step
                        </button>

                        {error && (
                            <p className="mt-2 text-xs text-red-600">{error}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                onClick={() => void save()}
                                disabled={saving}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                            >
                                {saving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : null}
                                {draft.id ? "Save changes" : "Create workflow"}
                            </button>
                            {draft.id && (
                                <button
                                    onClick={() => setDraft(EMPTY)}
                                    className="h-8 rounded-full px-3 text-xs text-gray-500 hover:bg-gray-100"
                                >
                                    New
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
