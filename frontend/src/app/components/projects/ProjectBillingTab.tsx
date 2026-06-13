"use client";

import { useEffect, useMemo, useState } from "react";
import { IndianRupee, Loader2, Plus, Receipt } from "lucide-react";
import { RowActions } from "@/app/components/shared/RowActions";
import {
    createInvoice,
    createTimeEntry,
    deleteTimeEntry,
    getBillingSettings,
    listInvoices,
    listTimeEntries,
    updateBillingSettings,
    updateInvoiceStatus,
    updateTimeEntry,
} from "@/app/lib/mikeApi";
import type {
    BillingSettings,
    Invoice,
    TimeEntry,
} from "@/app/components/shared/types";
import { formatDate } from "./ProjectPageParts";

function rupee(n: number): string {
    return `₹${(Number(n) || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function hoursLabel(minutes: number): string {
    return `${(minutes / 60).toFixed(2)} h`;
}

export function ProjectBillingTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const [settings, setSettings] = useState<BillingSettings>({
        firm_gstin: null,
        firm_state: null,
        default_hourly_rate: null,
    });
    const [entries, setEntries] = useState<TimeEntry[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Firm settings drafts
    const [gstin, setGstin] = useState("");
    const [state, setState] = useState("");
    const [rate, setRate] = useState("");
    const [savingSettings, setSavingSettings] = useState(false);

    // New time entry
    const [adding, setAdding] = useState(false);
    const [newDesc, setNewDesc] = useState("");
    const [newMinutes, setNewMinutes] = useState("");
    const [newDate, setNewDate] = useState("");
    const [savingEntry, setSavingEntry] = useState(false);

    // Invoice creation
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [clientName, setClientName] = useState("");
    const [clientGstin, setClientGstin] = useState("");
    const [placeOfSupply, setPlaceOfSupply] = useState("");
    const [creatingInvoice, setCreatingInvoice] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.allSettled([
            getBillingSettings(),
            listTimeEntries(projectId),
            listInvoices(projectId),
        ]).then(([s, e, i]) => {
            if (cancelled) return;
            if (s.status === "fulfilled") {
                setSettings(s.value);
                setGstin(s.value.firm_gstin ?? "");
                setState(s.value.firm_state ?? "");
                setRate(
                    s.value.default_hourly_rate != null
                        ? String(s.value.default_hourly_rate)
                        : "",
                );
            }
            if (e.status === "fulfilled") setEntries(e.value);
            if (i.status === "fulfilled") setInvoices(i.value);
            if (s.status === "rejected" && e.status === "rejected")
                setError("Failed to load billing.");
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const settingsChanged =
        gstin.trim() !== (settings.firm_gstin ?? "") ||
        state.trim() !== (settings.firm_state ?? "") ||
        rate.trim() !==
            (settings.default_hourly_rate != null
                ? String(settings.default_hourly_rate)
                : "");

    async function saveSettings() {
        if (savingSettings || !settingsChanged) return;
        setSavingSettings(true);
        try {
            const updated = await updateBillingSettings({
                firm_gstin: gstin.trim() || null,
                firm_state: state.trim() || null,
                default_hourly_rate: rate.trim() ? Number(rate) : null,
            });
            setSettings(updated);
        } catch {
            setError("Failed to save billing settings.");
        } finally {
            setSavingSettings(false);
        }
    }

    async function submitEntry() {
        const description = newDesc.trim();
        const minutes = Math.round(Number(newMinutes));
        if (!description || !Number.isFinite(minutes) || minutes <= 0) return;
        setSavingEntry(true);
        try {
            const created = await createTimeEntry(projectId, {
                description,
                minutes,
                entry_date: newDate || undefined,
            });
            setEntries((prev) => [created, ...prev]);
            setNewDesc("");
            setNewMinutes("");
            setNewDate("");
            setAdding(false);
        } catch {
            setError("Failed to save time entry.");
        } finally {
            setSavingEntry(false);
        }
    }

    async function toggleBilled(entry: TimeEntry) {
        const billed = !entry.billed;
        setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, billed } : e)),
        );
        try {
            await updateTimeEntry(projectId, entry.id, { billed });
        } catch {
            setEntries((prev) =>
                prev.map((e) =>
                    e.id === entry.id ? { ...e, billed: entry.billed } : e,
                ),
            );
        }
    }

    async function handleDeleteEntry(entryId: string) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setSelected((prev) => {
            const next = new Set(prev);
            next.delete(entryId);
            return next;
        });
        try {
            await deleteTimeEntry(projectId, entryId);
        } catch {
            setError("Failed to delete time entry.");
        }
    }

    function toggleSelected(entryId: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(entryId)) next.delete(entryId);
            else next.add(entryId);
            return next;
        });
    }

    const selectedTotal = useMemo(
        () =>
            entries
                .filter((e) => selected.has(e.id))
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        [entries, selected],
    );

    async function handleCreateInvoice() {
        if (creatingInvoice || selected.size === 0) return;
        setCreatingInvoice(true);
        try {
            const invoice = await createInvoice(projectId, {
                client_name: clientName.trim() || undefined,
                client_gstin: clientGstin.trim() || undefined,
                place_of_supply: placeOfSupply.trim() || undefined,
                time_entry_ids: [...selected],
            });
            setInvoices((prev) => [invoice, ...prev]);
            // Refresh entries so billed flags reflect server state.
            setEntries((prev) =>
                prev.map((e) =>
                    selected.has(e.id) ? { ...e, billed: true } : e,
                ),
            );
            setSelected(new Set());
            setClientName("");
            setClientGstin("");
            setPlaceOfSupply("");
        } catch {
            setError("Failed to create invoice.");
        } finally {
            setCreatingInvoice(false);
        }
    }

    async function cycleInvoiceStatus(invoice: Invoice) {
        const order: Invoice["status"][] = ["draft", "sent", "paid"];
        const next = order[(order.indexOf(invoice.status) + 1) % order.length];
        setInvoices((prev) =>
            prev.map((i) => (i.id === invoice.id ? { ...i, status: next } : i)),
        );
        try {
            await updateInvoiceStatus(projectId, invoice.id, next);
        } catch {
            setInvoices((prev) =>
                prev.map((i) =>
                    i.id === invoice.id ? { ...i, status: invoice.status } : i,
                ),
            );
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading billing…
            </div>
        );
    }

    const filteredEntries = search
        ? entries.filter((e) =>
              e.description.toLowerCase().includes(search.toLowerCase()),
          )
        : entries;

    return (
        <div className="px-4 py-4 space-y-6">
            {error && <div className="text-xs text-red-600">{error}</div>}

            {/* Firm billing settings */}
            <section className="rounded-lg border border-gray-200 p-4">
                <h3 className="mb-3 text-sm font-medium text-gray-800">
                    Firm billing settings
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs text-gray-500">
                        Firm GSTIN
                        <input
                            value={gstin}
                            onChange={(e) => setGstin(e.target.value)}
                            placeholder="e.g. 07ABCDE1234F1Z5"
                            className="h-9 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-gray-300"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-gray-500">
                        Firm state (place of supply)
                        <input
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            placeholder="e.g. Delhi"
                            className="h-9 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-gray-300"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-gray-500">
                        Default hourly rate (₹)
                        <input
                            type="number"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                            placeholder="e.g. 5000"
                            className="h-9 rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-gray-300"
                        />
                    </label>
                </div>
                <div className="mt-3 flex items-center gap-3">
                    <button
                        onClick={() => void saveSettings()}
                        disabled={savingSettings || !settingsChanged}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-gray-900 px-4 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
                    >
                        {savingSettings ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        Save settings
                    </button>
                    <span className="text-[11px] text-gray-400">
                        Intra-state supply (place of supply = firm state) is
                        taxed CGST 9% + SGST 9%; inter-state is IGST 18%. SAC
                        9982.
                    </span>
                </div>
            </section>

            {/* Time entries */}
            <section>
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-800">
                        Time entries
                    </h3>
                    <button
                        onClick={() => setAdding((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-800"
                    >
                        <Plus className="h-3 w-3" />
                        Add time
                    </button>
                </div>

                {adding && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-3">
                        <input
                            autoFocus
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            placeholder="Work done (e.g. Reviewed and marked up the SPA)"
                            maxLength={500}
                            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-gray-400"
                        />
                        <input
                            type="number"
                            value={newMinutes}
                            onChange={(e) => setNewMinutes(e.target.value)}
                            placeholder="Minutes"
                            className="w-24 rounded border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-gray-400"
                        />
                        <input
                            type="date"
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                            className="h-7 rounded border border-gray-200 bg-white px-1 text-xs text-gray-700 outline-none"
                        />
                        <button
                            onClick={() => void submitEntry()}
                            disabled={savingEntry || !newDesc.trim()}
                            className="inline-flex h-7 items-center gap-1 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                        >
                            {savingEntry ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Save
                        </button>
                        <button
                            onClick={() => setAdding(false)}
                            className="h-7 rounded-full px-3 text-xs text-gray-500 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {entries.length === 0 ? (
                    <div className="flex flex-col items-start py-16 w-full max-w-xs">
                        <IndianRupee className="h-8 w-8 text-gray-300 mb-3" />
                        <p className="text-lg font-medium font-serif text-gray-900">
                            No time logged
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                            Log billable work here or let the assistant capture
                            it from chat, then generate a GST invoice.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-md border border-gray-100">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th className="w-8 px-2 py-2" />
                                    <th className="px-2 py-2 text-left">
                                        Date
                                    </th>
                                    <th className="px-2 py-2 text-left">
                                        Description
                                    </th>
                                    <th className="px-2 py-2 text-right">
                                        Time
                                    </th>
                                    <th className="px-2 py-2 text-right">
                                        Amount
                                    </th>
                                    <th className="px-2 py-2 text-left">
                                        Billed
                                    </th>
                                    <th className="w-8 px-2 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEntries.map((e) => (
                                    <tr
                                        key={e.id}
                                        className="border-t border-gray-50 hover:bg-gray-50"
                                    >
                                        <td className="px-2 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(e.id)}
                                                onChange={() =>
                                                    toggleSelected(e.id)
                                                }
                                                disabled={e.billed}
                                                title={
                                                    e.billed
                                                        ? "Already billed"
                                                        : "Select for invoice"
                                                }
                                                className="h-3 w-3 accent-black"
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-gray-500">
                                            {formatDate(e.entry_date)}
                                        </td>
                                        <td className="px-2 py-2 text-gray-800">
                                            {e.description}
                                        </td>
                                        <td className="px-2 py-2 text-right text-gray-500">
                                            {hoursLabel(e.minutes)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-gray-700">
                                            {rupee(e.amount)}
                                        </td>
                                        <td className="px-2 py-2">
                                            <button
                                                onClick={() =>
                                                    void toggleBilled(e)
                                                }
                                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.billed ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700"}`}
                                            >
                                                {e.billed
                                                    ? "Billed"
                                                    : "Unbilled"}
                                            </button>
                                        </td>
                                        <td className="px-2 py-2">
                                            <RowActions
                                                onDelete={() =>
                                                    void handleDeleteEntry(
                                                        e.id,
                                                    )
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Create invoice from selection */}
            {selected.size > 0 && (
                <section className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                    <h3 className="mb-3 text-sm font-medium text-gray-800">
                        Create invoice — {selected.size} entr
                        {selected.size === 1 ? "y" : "ies"} ·{" "}
                        {rupee(selectedTotal)} + GST
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="Client name"
                            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                        />
                        <input
                            value={clientGstin}
                            onChange={(e) => setClientGstin(e.target.value)}
                            placeholder="Client GSTIN (optional)"
                            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                        />
                        <input
                            value={placeOfSupply}
                            onChange={(e) => setPlaceOfSupply(e.target.value)}
                            placeholder="Place of supply (state)"
                            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
                        />
                    </div>
                    <button
                        onClick={() => void handleCreateInvoice()}
                        disabled={creatingInvoice}
                        className="mt-3 inline-flex h-8 items-center gap-1 rounded-full bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                    >
                        {creatingInvoice ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        Generate GST invoice
                    </button>
                </section>
            )}

            {/* Invoices */}
            <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <Receipt className="h-4 w-4 text-gray-400" />
                    Invoices
                </h3>
                {invoices.length === 0 ? (
                    <p className="text-xs text-gray-400">
                        No invoices yet. Select unbilled time entries above to
                        generate one.
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-md border border-gray-100">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th className="px-2 py-2 text-left">
                                        Invoice
                                    </th>
                                    <th className="px-2 py-2 text-left">
                                        Date
                                    </th>
                                    <th className="px-2 py-2 text-left">
                                        Client
                                    </th>
                                    <th className="px-2 py-2 text-right">
                                        Tax
                                    </th>
                                    <th className="px-2 py-2 text-right">
                                        Total
                                    </th>
                                    <th className="px-2 py-2 text-left">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => {
                                    const tax =
                                        Number(inv.cgst) +
                                        Number(inv.sgst) +
                                        Number(inv.igst);
                                    const taxLabel =
                                        Number(inv.igst) > 0
                                            ? `IGST ${rupee(inv.igst)}`
                                            : `CGST ${rupee(inv.cgst)} + SGST ${rupee(inv.sgst)}`;
                                    return (
                                        <tr
                                            key={inv.id}
                                            className="border-t border-gray-50 hover:bg-gray-50"
                                        >
                                            <td className="px-2 py-2 font-medium text-gray-800">
                                                {inv.invoice_number}
                                            </td>
                                            <td className="px-2 py-2 text-gray-500">
                                                {formatDate(inv.invoice_date)}
                                            </td>
                                            <td className="px-2 py-2 text-gray-700">
                                                {inv.client_name ?? "—"}
                                            </td>
                                            <td
                                                className="px-2 py-2 text-right text-gray-500"
                                                title={taxLabel}
                                            >
                                                {rupee(tax)}
                                            </td>
                                            <td className="px-2 py-2 text-right font-medium text-gray-800">
                                                {rupee(inv.total)}
                                            </td>
                                            <td className="px-2 py-2">
                                                <button
                                                    onClick={() =>
                                                        void cycleInvoiceStatus(
                                                            inv,
                                                        )
                                                    }
                                                    title="Click to change status"
                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                                                        inv.status === "paid"
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : inv.status ===
                                                                "sent"
                                                              ? "bg-blue-50 text-blue-700"
                                                              : "bg-gray-100 text-gray-500"
                                                    }`}
                                                >
                                                    {inv.status}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
