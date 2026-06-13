"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, ShieldAlert, Users } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    createProjectParty,
    deleteProjectParty,
    listProjectParties,
    runConflictCheck,
    updateProjectParty,
} from "@/app/lib/mikeApi";
import type {
    ConflictCheckResponse,
    ProjectParty,
    ProjectPartyRole,
} from "@/app/components/shared/types";
import { NAME_COL_W } from "./ProjectPageParts";

const PARTY_ROLES: { value: ProjectPartyRole; label: string }[] = [
    { value: "client", label: "Client" },
    { value: "counterparty", label: "Counterparty" },
    { value: "opposing_counsel", label: "Opposing counsel" },
    { value: "witness", label: "Witness" },
    { value: "other", label: "Other" },
];

function roleLabel(role: string): string {
    return (
        PARTY_ROLES.find((r) => r.value === role)?.label ??
        role.replace(/_/g, " ")
    );
}

function RoleSelect({
    value,
    onChange,
}: {
    value: ProjectPartyRole;
    onChange: (role: ProjectPartyRole) => void;
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value as ProjectPartyRole)}
            className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
        >
            {PARTY_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                    {r.label}
                </option>
            ))}
        </select>
    );
}

function ConflictResults({ result }: { result: ConflictCheckResponse }) {
    const totalMatches = result.queries.reduce(
        (sum, q) => sum + q.matches.length,
        0,
    );
    if (totalMatches === 0) {
        return (
            <div className="px-4 py-2 text-xs text-gray-500">
                No matches found across your matters, parties, and clients.
                This only covers data recorded in lexOS — it is not a
                clearance.
            </div>
        );
    }
    return (
        <div className="px-4 py-2 space-y-2">
            {result.queries
                .filter((q) => q.matches.length > 0)
                .map((q) => (
                    <div key={q.name}>
                        <div className="text-xs font-medium text-gray-700">
                            {q.name}
                        </div>
                        <div className="mt-1 space-y-1">
                            {q.matches.map((m, i) => (
                                <div
                                    key={i}
                                    className="flex flex-wrap items-center gap-2 text-xs text-gray-600"
                                >
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                            m.severity === "potential_conflict"
                                                ? "bg-red-50 text-red-700"
                                                : "bg-gray-100 text-gray-500"
                                        }`}
                                    >
                                        {m.severity === "potential_conflict"
                                            ? "Potential conflict"
                                            : "Related match"}
                                    </span>
                                    <span className="font-medium text-gray-800">
                                        {m.matched_name}
                                    </span>
                                    <span>
                                        {m.match_kind === "client"
                                            ? "existing client"
                                            : roleLabel(
                                                  m.role ?? "other",
                                              ).toLowerCase()}
                                        {m.project
                                            ? ` in “${m.project.name}”`
                                            : ""}
                                    </span>
                                    <span className="text-gray-400">
                                        ({m.match_strength} match)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            <p className="text-[11px] text-gray-400">
                Conflict checks cover only matters, parties, and clients
                recorded in lexOS. Have a lawyer review potential conflicts
                before engagement.
            </p>
        </div>
    );
}

export function ProjectPartiesTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const stickyCellBg = "bg-[#fafbfc]";
    const [parties, setParties] = useState<ProjectParty[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [newRole, setNewRole] = useState<ProjectPartyRole>("counterparty");
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editRole, setEditRole] = useState<ProjectPartyRole>("other");

    const [checkName, setCheckName] = useState("");
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] =
        useState<ConflictCheckResponse | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        listProjectParties(projectId)
            .then((rows) => {
                if (!cancelled) setParties(rows);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load parties.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const filtered = search
        ? parties.filter((p) =>
              p.name.toLowerCase().includes(search.toLowerCase()),
          )
        : parties;

    async function submitNewParty() {
        const name = newName.trim();
        if (!name || saving) return;
        setSaving(true);
        try {
            const created = await createProjectParty(projectId, {
                name,
                role: newRole,
            });
            setParties((prev) => [...prev, created]);
            setNewName("");
            setNewRole("counterparty");
            setAdding(false);
        } catch {
            setError("Failed to save party.");
        } finally {
            setSaving(false);
        }
    }

    async function submitEdit(partyId: string) {
        const name = editName.trim();
        setEditingId(null);
        if (!name) return;
        const existing = parties.find((p) => p.id === partyId);
        if (!existing || (existing.name === name && existing.role === editRole))
            return;
        try {
            const updated = await updateProjectParty(projectId, partyId, {
                name,
                role: editRole,
            });
            setParties((prev) =>
                prev.map((p) => (p.id === partyId ? updated : p)),
            );
        } catch {
            setError("Failed to update party.");
        }
    }

    async function handleDelete(partyId: string) {
        setParties((prev) => prev.filter((p) => p.id !== partyId));
        try {
            await deleteProjectParty(projectId, partyId);
        } catch {
            setError("Failed to delete party.");
        }
    }

    async function runCheck(body: { names?: string[]; project_id?: string }) {
        if (checking) return;
        setChecking(true);
        setCheckResult(null);
        try {
            const result = await runConflictCheck(body);
            setCheckResult(result);
        } catch {
            setError("Conflict check failed.");
        } finally {
            setChecking(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading parties…
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
                <button
                    onClick={() => void runCheck({ project_id: projectId })}
                    disabled={checking || parties.length === 0}
                    title={
                        parties.length === 0
                            ? "Record parties first to check this matter"
                            : "Check this matter's parties against all your matters and clients"
                    }
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
                >
                    {checking ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <ShieldAlert className="h-3 w-3" />
                    )}
                    Run conflict check
                </button>
                <input
                    value={checkName}
                    onChange={(e) => setCheckName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && checkName.trim())
                            void runCheck({ names: [checkName.trim()] });
                    }}
                    maxLength={200}
                    placeholder="Check a name (e.g. a prospective client)…"
                    className="h-7 w-72 max-w-full rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none focus:border-gray-400"
                />
                {checkResult && (
                    <button
                        onClick={() => setCheckResult(null)}
                        className="h-7 rounded-full px-3 text-xs text-gray-500 transition-colors hover:bg-gray-100"
                    >
                        Clear results
                    </button>
                )}
            </div>

            {checkResult && (
                <div className="border-b border-gray-100 bg-gray-50/60">
                    <ConflictResults result={checkResult} />
                </div>
            )}

            <div className="flex items-center h-8 pr-8 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                <div
                    className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} flex items-center gap-4 self-stretch pl-4 pr-2 text-left`}
                >
                    <span>Party</span>
                </div>
                <div className="ml-auto w-36 shrink-0 text-left">Role</div>
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
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void submitNewParty();
                            if (e.key === "Escape") setAdding(false);
                        }}
                        maxLength={200}
                        placeholder="e.g. Acme Holdings Ltd"
                        className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-gray-400"
                    />
                    <RoleSelect value={newRole} onChange={setNewRole} />
                    <button
                        onClick={() => void submitNewParty()}
                        disabled={saving || !newName.trim()}
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
                        Add party
                    </button>
                </div>
            )}

            {parties.length === 0 && !adding ? (
                <div className="flex flex-col items-start py-24 w-full max-w-xs mx-auto">
                    <Users className="h-8 w-8 text-gray-300 mb-4" />
                    <p className="text-2xl font-medium font-serif text-gray-900">
                        Matter Parties
                    </p>
                    <p className="mt-1 text-xs text-gray-400 max-w-xs">
                        Clients, counterparties, opposing counsel, and
                        witnesses recorded here are visible to the assistant
                        in every chat and power conflict checks across all
                        your matters. The assistant records parties
                        automatically when they come up, and you can add your
                        own.
                    </p>
                </div>
            ) : (
                <div>
                    {filtered.map((party) => (
                        <div
                            key={party.id}
                            className="group flex items-center min-h-10 pr-8 border-b border-gray-50 hover:bg-gray-100 transition-colors"
                        >
                            <div
                                className={`sticky left-0 z-[60] ${NAME_COL_W} ${stickyCellBg} py-2 pl-4 pr-2 transition-colors group-hover:bg-gray-100`}
                            >
                                {editingId === party.id ? (
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <input
                                            autoFocus
                                            value={editName}
                                            onChange={(e) =>
                                                setEditName(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter")
                                                    void submitEdit(party.id);
                                                if (e.key === "Escape")
                                                    setEditingId(null);
                                            }}
                                            maxLength={200}
                                            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none"
                                        />
                                        <RoleSelect
                                            value={editRole}
                                            onChange={setEditRole}
                                        />
                                        <button
                                            onClick={() =>
                                                void submitEdit(party.id)
                                            }
                                            className="h-7 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-700"
                                        >
                                            Save
                                        </button>
                                    </div>
                                ) : (
                                    <div className="min-w-0">
                                        <span className="block whitespace-normal break-words text-sm text-gray-800">
                                            {party.name}
                                        </span>
                                        {party.notes && (
                                            <span className="block text-xs text-gray-400 whitespace-normal break-words">
                                                {party.notes}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="ml-auto w-36 shrink-0 text-sm text-gray-500">
                                {roleLabel(party.role)}
                            </div>
                            <div className="w-24 shrink-0 text-sm text-gray-500 capitalize">
                                {party.source}
                            </div>
                            <div className="w-8 shrink-0 flex justify-end">
                                <RowActions
                                    renameLabel="Edit"
                                    onRename={() => {
                                        setEditName(party.name);
                                        setEditRole(party.role);
                                        setEditingId(party.id);
                                    }}
                                    onDelete={() =>
                                        void handleDelete(party.id)
                                    }
                                />
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && parties.length > 0 && (
                        <div className="px-4 py-8 text-sm text-gray-400">
                            No parties match your search.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
