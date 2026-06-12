"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Modal } from "@/app/components/shared/Modal";
import type { Client, Project } from "@/app/components/shared/types";
import {
    createClient,
    listClients,
    updateClient,
    type ProjectPeople,
} from "@/app/lib/mikeApi";

const NEW_CLIENT_SENTINEL = "__new__";

interface ProjectDetailsModalProps {
    open: boolean;
    project: Project | null;
    canEdit: boolean;
    currentUserDisplayName?: string | null;
    currentUserEmail?: string | null;
    fetchPeople: (projectId: string) => Promise<ProjectPeople>;
    onClose: () => void;
    onSave: (values: {
        name: string;
        cmNumber: string;
        clientId: string | null;
        clientName: string | null;
    }) => Promise<void>;
    onShareProject: () => void;
}

export function ProjectDetailsModal({
    open,
    project,
    canEdit,
    currentUserDisplayName,
    currentUserEmail,
    fetchPeople,
    onClose,
    onSave,
    onShareProject,
}: ProjectDetailsModalProps) {
    const [nameDraft, setNameDraft] = useState("");
    const [cmDraft, setCmDraft] = useState("");
    const [people, setPeople] = useState<ProjectPeople | null>(null);
    const [peopleLoading, setPeopleLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Client linkage (owner only): pick an existing client, create a new
    // one inline, and edit the selected client's preference notes.
    const [clients, setClients] = useState<Client[]>([]);
    const [clientIdDraft, setClientIdDraft] = useState<string>("");
    const [newClientName, setNewClientName] = useState("");
    const [clientNotesDraft, setClientNotesDraft] = useState("");

    useEffect(() => {
        if (!open || !project) return;
        setNameDraft(project.name);
        setCmDraft(project.cm_number ?? "");
        setClientIdDraft(project.client_id ?? "");
        setNewClientName("");
        setSaved(false);
        setError(null);
    }, [open, project]);

    useEffect(() => {
        if (!open || !canEdit) return;
        let cancelled = false;
        listClients()
            .then((rows) => {
                if (!cancelled) setClients(rows);
            })
            .catch(() => {
                if (!cancelled) setClients([]);
            });
        return () => {
            cancelled = true;
        };
    }, [open, canEdit]);

    const selectedClient = useMemo(
        () => clients.find((c) => c.id === clientIdDraft) ?? null,
        [clients, clientIdDraft],
    );

    useEffect(() => {
        setClientNotesDraft(selectedClient?.notes ?? "");
    }, [selectedClient]);

    useEffect(() => {
        if (!open || !project) return;
        const isPrivateOwnedProject =
            project.is_owner !== false &&
            (!Array.isArray(project.shared_with) ||
                project.shared_with.length === 0);
        if (isPrivateOwnedProject) {
            setPeople(null);
            setPeopleLoading(false);
            return;
        }
        let cancelled = false;
        setPeopleLoading(true);
        fetchPeople(project.id)
            .then((data) => {
                if (!cancelled) setPeople(data);
            })
            .catch(() => {
                if (!cancelled) setPeople(null);
            })
            .finally(() => {
                if (!cancelled) setPeopleLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, project, fetchPeople]);

    const trimmedName = nameDraft.trim();
    const trimmedCm = cmDraft.trim();
    const trimmedNewClientName = newClientName.trim();
    const isCreatingClient = clientIdDraft === NEW_CLIENT_SENTINEL;
    const clientNotesChanged =
        !!selectedClient &&
        clientNotesDraft.trim() !== (selectedClient.notes ?? "");
    const hasChanges = useMemo(() => {
        if (!project) return false;
        return (
            trimmedName !== project.name ||
            trimmedCm !== (project.cm_number ?? "") ||
            (isCreatingClient
                ? !!trimmedNewClientName
                : clientIdDraft !== (project.client_id ?? "")) ||
            clientNotesChanged
        );
    }, [
        project,
        trimmedCm,
        trimmedName,
        clientIdDraft,
        isCreatingClient,
        trimmedNewClientName,
        clientNotesChanged,
    ]);

    if (!project) return null;

    const accessLabel =
        Array.isArray(project.shared_with) && project.shared_with.length > 0
            ? "Shared"
            : "Private";
    const isPrivateOwnedProject =
        project.is_owner !== false && accessLabel === "Private";
    const ownerLabel =
        people?.owner.display_name?.trim() ||
        people?.owner.email?.trim() ||
        (isPrivateOwnedProject ? currentUserDisplayName?.trim() : "") ||
        (isPrivateOwnedProject ? currentUserEmail?.trim() : "") ||
        "Unknown";

    async function handleSave() {
        if (!canEdit || saving || !hasChanges || !trimmedName) return;
        if (isCreatingClient && !trimmedNewClientName) return;
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
            let clientId: string | null = clientIdDraft || null;
            let clientName = selectedClient?.name ?? null;
            if (isCreatingClient) {
                const created = await createClient({
                    name: trimmedNewClientName,
                });
                setClients((prev) =>
                    [...prev, created].sort((a, b) =>
                        a.name.localeCompare(b.name),
                    ),
                );
                setClientIdDraft(created.id);
                setNewClientName("");
                clientId = created.id;
                clientName = created.name;
            } else if (selectedClient && clientNotesChanged) {
                const updated = await updateClient(selectedClient.id, {
                    notes: clientNotesDraft.trim() || null,
                });
                setClients((prev) =>
                    prev.map((c) => (c.id === updated.id ? updated : c)),
                );
            }
            await onSave({
                name: trimmedName,
                cmNumber: trimmedCm,
                clientId,
                clientName,
            });
            setSaved(true);
        } catch {
            setError("Could not update project details.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            breadcrumbs={["Projects", project.name, "Details"]}
            secondaryAction={{
                label: "Share Project",
                icon: <Users className="h-4 w-4" />,
                onClick: onShareProject,
            }}
            footerStatus={
                error ? (
                    <span className="text-sm text-red-600">{error}</span>
                ) : saved ? (
                    <span className="text-sm text-gray-400">Updated</span>
                ) : null
            }
            primaryAction={
                canEdit
                    ? {
                          label: saving ? "Updating..." : "Update",
                          onClick: () => void handleSave(),
                          disabled: saving || !hasChanges || !trimmedName,
                      }
                    : undefined
            }
            cancelAction={canEdit ? undefined : false}
        >
            <div className="flex flex-col gap-5 py-1">
                <div className="flex flex-col gap-3">
                    <label
                        htmlFor="project-details-name"
                        className="text-xs font-medium text-gray-700"
                    >
                        Project Name
                    </label>
                    <input
                        id="project-details-name"
                        value={nameDraft}
                        onChange={(e) => {
                            setNameDraft(e.target.value);
                            setSaved(false);
                            setError(null);
                        }}
                        disabled={!canEdit || saving}
                        className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-gray-300 disabled:cursor-not-allowed disabled:text-gray-400"
                    />
                </div>

                <div className="flex flex-col gap-3">
                    <label
                        htmlFor="project-details-cm"
                        className="text-xs font-medium text-gray-700"
                    >
                        CM
                    </label>
                    <input
                        id="project-details-cm"
                        value={cmDraft}
                        onChange={(e) => {
                            setCmDraft(e.target.value);
                            setSaved(false);
                            setError(null);
                        }}
                        disabled={!canEdit || saving}
                        placeholder="No CM"
                        className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-gray-300 disabled:cursor-not-allowed disabled:text-gray-400"
                    />
                </div>

                {canEdit ? (
                    <div className="flex flex-col gap-3">
                        <label
                            htmlFor="project-details-client"
                            className="text-xs font-medium text-gray-700"
                        >
                            Client
                        </label>
                        <select
                            id="project-details-client"
                            value={clientIdDraft}
                            onChange={(e) => {
                                setClientIdDraft(e.target.value);
                                setSaved(false);
                                setError(null);
                            }}
                            disabled={saving}
                            className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-gray-300 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                            <option value="">No client</option>
                            {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    {client.name}
                                </option>
                            ))}
                            <option value={NEW_CLIENT_SENTINEL}>
                                + New client…
                            </option>
                        </select>
                        {isCreatingClient && (
                            <input
                                autoFocus
                                value={newClientName}
                                onChange={(e) => {
                                    setNewClientName(e.target.value);
                                    setSaved(false);
                                    setError(null);
                                }}
                                disabled={saving}
                                maxLength={200}
                                placeholder="Client name"
                                className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors focus:border-gray-300"
                            />
                        )}
                        {selectedClient && (
                            <>
                                <label
                                    htmlFor="project-details-client-notes"
                                    className="text-xs font-medium text-gray-700"
                                >
                                    Client Notes & Preferences
                                </label>
                                <textarea
                                    id="project-details-client-notes"
                                    value={clientNotesDraft}
                                    onChange={(e) => {
                                        setClientNotesDraft(e.target.value);
                                        setSaved(false);
                                        setError(null);
                                    }}
                                    disabled={saving}
                                    rows={3}
                                    maxLength={4000}
                                    placeholder="e.g. Prefers aggressive indemnities; fixed-fee billing; communicate via portal only."
                                    className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-300 disabled:cursor-not-allowed disabled:text-gray-400"
                                />
                                <p className="text-[11px] text-gray-400">
                                    Shared across all of this client&apos;s
                                    matters. The assistant sees these notes in
                                    every linked project chat.
                                </p>
                            </>
                        )}
                    </div>
                ) : null}

                <div className="divide-y divide-gray-100 text-sm">
                    {!canEdit && (
                        <DetailRow
                            label="Client"
                            value={project.client?.name ?? "No client"}
                        />
                    )}
                    <DetailRow label="Ownership" value={accessLabel} />
                    <DetailRow
                        label="Owner"
                        value={
                            peopleLoading && !isPrivateOwnedProject ? (
                                <span className="inline-flex items-center gap-1.5 text-gray-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading
                                </span>
                            ) : (
                                ownerLabel
                            )
                        }
                    />
                </div>
            </div>
        </Modal>
    );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-gray-500">{label}</span>
            <span className="min-w-0 truncate text-right text-gray-900">
                {value}
            </span>
        </div>
    );
}
