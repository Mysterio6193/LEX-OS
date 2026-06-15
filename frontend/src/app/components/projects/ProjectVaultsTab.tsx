"use client";

import { useEffect, useState } from "react";
import { Boxes, Check, Loader2, Plus } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    createVault,
    deleteVault,
    getProject,
    getVaultDocuments,
    listVaults,
    reindexVault,
    setVaultDocuments,
} from "@/app/lib/mikeApi";
import type { Document, Vault } from "@/app/components/shared/types";

export function ProjectVaultsTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const [vaults, setVaults] = useState<Vault[]>([]);
    const [docs, setDocs] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [saving, setSaving] = useState(false);

    // Membership editor state
    const [editingVault, setEditingVault] = useState<Vault | null>(null);
    const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
    const [reindexing, setReindexing] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.allSettled([listVaults(projectId), getProject(projectId)]).then(
            ([v, p]) => {
                if (cancelled) return;
                if (v.status === "fulfilled") setVaults(v.value);
                if (p.status === "fulfilled") setDocs(p.value.documents ?? []);
                if (v.status === "rejected") setError("Failed to load vaults.");
                setLoading(false);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const filtered = search
        ? vaults.filter((v) =>
              v.name.toLowerCase().includes(search.toLowerCase()),
          )
        : vaults;

    async function submitNew() {
        const name = newName.trim();
        if (!name || saving) return;
        setSaving(true);
        try {
            const created = await createVault(projectId, { name });
            setVaults((prev) => [created, ...prev]);
            setNewName("");
            setAdding(false);
        } catch {
            setError("Failed to create vault.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(vaultId: string) {
        setVaults((prev) => prev.filter((v) => v.id !== vaultId));
        try {
            await deleteVault(projectId, vaultId);
        } catch {
            setError("Failed to delete vault.");
        }
    }

    async function openMembership(vault: Vault) {
        setEditingVault(vault);
        try {
            const ids = await getVaultDocuments(projectId, vault.id);
            setSelectedDocs(new Set(ids));
        } catch {
            setSelectedDocs(new Set());
        }
    }

    async function saveMembership() {
        if (!editingVault) return;
        const vaultId = editingVault.id;
        const ids = [...selectedDocs];
        setEditingVault(null);
        try {
            await setVaultDocuments(projectId, vaultId, ids);
            setVaults((prev) =>
                prev.map((v) =>
                    v.id === vaultId ? { ...v, document_count: ids.length } : v,
                ),
            );
        } catch {
            setError("Failed to update vault documents.");
        }
    }

    async function handleReindex(vaultId: string) {
        setReindexing(vaultId);
        try {
            await reindexVault(projectId, vaultId);
        } catch {
            setError("Failed to reindex vault.");
        } finally {
            setReindexing(null);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading vaults…
            </div>
        );
    }

    return (
        <div className="px-4 py-4">
            {error && (
                <div className="mb-2 text-xs text-red-600">{error}</div>
            )}

            <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                    Group documents into a Vault (data room / case bundle), then
                    ask the assistant to search within it.
                </p>
                <button
                    onClick={() => setAdding((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-800"
                >
                    <Plus className="h-3 w-3" />
                    New vault
                </button>
            </div>

            {adding && (
                <div className="mb-3 flex items-center gap-2">
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void submitNew();
                            if (e.key === "Escape") setAdding(false);
                        }}
                        maxLength={200}
                        placeholder="e.g. Seller data room"
                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                        onClick={() => void submitNew()}
                        disabled={saving || !newName.trim()}
                        className="inline-flex h-7 items-center gap-1 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                    >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Create
                    </button>
                </div>
            )}

            {vaults.length === 0 && !adding ? (
                <div className="flex flex-col items-start py-20 w-full max-w-xs">
                    <Boxes className="h-8 w-8 text-gray-300 mb-3" />
                    <p className="text-lg font-medium font-serif text-gray-900">
                        Matter Vault
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                        Create document sets to reason over large bundles. The
                        assistant&apos;s <code>retrieve_context</code> can be
                        scoped to a vault for fast, cited answers.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-md border border-gray-100">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Vault</th>
                                <th className="px-3 py-2 text-right">
                                    Documents
                                </th>
                                <th className="px-3 py-2 text-left">Actions</th>
                                <th className="w-8 px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((v) => (
                                <tr
                                    key={v.id}
                                    className="border-t border-gray-50 hover:bg-gray-50"
                                >
                                    <td className="px-3 py-2 font-medium text-gray-800">
                                        {v.name}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-500">
                                        {v.document_count}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() =>
                                                    void openMembership(v)
                                                }
                                                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:border-gray-400"
                                            >
                                                Edit documents
                                            </button>
                                            <button
                                                onClick={() =>
                                                    void handleReindex(v.id)
                                                }
                                                disabled={reindexing === v.id}
                                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:border-gray-400 disabled:opacity-40"
                                            >
                                                {reindexing === v.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : null}
                                                Reindex
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        <RowActions
                                            onDelete={() =>
                                                void handleDelete(v.id)
                                            }
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingVault && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4">
                    <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
                        <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-800">
                            Documents in “{editingVault.name}”
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                            {docs.length === 0 ? (
                                <p className="px-2 py-6 text-xs text-gray-400">
                                    This matter has no documents yet.
                                </p>
                            ) : (
                                docs.map((d) => {
                                    const on = selectedDocs.has(d.id);
                                    return (
                                        <button
                                            key={d.id}
                                            onClick={() =>
                                                setSelectedDocs((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(d.id))
                                                        next.delete(d.id);
                                                    else next.add(d.id);
                                                    return next;
                                                })
                                            }
                                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                                        >
                                            <span
                                                className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"}`}
                                            >
                                                {on ? (
                                                    <Check className="h-3 w-3" />
                                                ) : null}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-gray-700">
                                                {d.filename}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
                            <button
                                onClick={() => setEditingVault(null)}
                                className="h-8 rounded-full px-3 text-xs text-gray-500 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void saveMembership()}
                                className="h-8 rounded-full bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-700"
                            >
                                Save ({selectedDocs.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
