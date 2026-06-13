"use client";

import { useEffect, useState } from "react";
import {
    CalendarClock,
    FileText,
    History,
    Loader2,
    MessageSquare,
    Pencil,
    Sparkles,
    Users,
} from "lucide-react";
import { getProjectTimeline } from "@/app/lib/mikeApi";
import type {
    TimelineEvent,
    TimelineEventType,
} from "@/app/components/shared/types";

const TYPE_META: Record<
    TimelineEventType,
    { label: string; Icon: typeof FileText }
> = {
    document_created: { label: "Documents", Icon: FileText },
    document_version: { label: "Edits", Icon: Pencil },
    chat_created: { label: "Chats", Icon: MessageSquare },
    memory_saved: { label: "Memory", Icon: Sparkles },
    deadline_created: { label: "Deadlines", Icon: CalendarClock },
    party_added: { label: "Parties", Icon: Users },
};

const FILTER_TYPES = Object.keys(TYPE_META) as TimelineEventType[];

function dayLabel(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    if (sameDay(date, today)) return "Today";
    if (sameDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year:
            date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
}

function timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function ProjectTimelineTab({
    projectId,
    search,
}: {
    projectId: string;
    search: string;
}) {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [nextBefore, setNextBefore] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTypes, setActiveTypes] = useState<Set<TimelineEventType>>(
        new Set(),
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getProjectTimeline(projectId)
            .then((result) => {
                if (cancelled) return;
                setEvents(result.events);
                setNextBefore(result.next_before);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load timeline.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    async function loadMore() {
        if (!nextBefore || loadingMore) return;
        setLoadingMore(true);
        try {
            const result = await getProjectTimeline(projectId, {
                before: nextBefore,
            });
            setEvents((prev) => {
                const seen = new Set(prev.map((e) => e.id));
                return [
                    ...prev,
                    ...result.events.filter((e) => !seen.has(e.id)),
                ];
            });
            setNextBefore(result.next_before);
        } catch {
            setError("Failed to load more activity.");
        } finally {
            setLoadingMore(false);
        }
    }

    function toggleType(type: TimelineEventType) {
        setActiveTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }

    const filtered = events.filter((e) => {
        if (activeTypes.size > 0 && !activeTypes.has(e.type)) return false;
        if (
            search &&
            !e.title.toLowerCase().includes(search.toLowerCase()) &&
            !(e.detail ?? "").toLowerCase().includes(search.toLowerCase())
        )
            return false;
        return true;
    });

    const groups: { day: string; items: TimelineEvent[] }[] = [];
    for (const event of filtered) {
        const day = dayLabel(event.at);
        const last = groups[groups.length - 1];
        if (last && last.day === day) last.items.push(event);
        else groups.push({ day, items: [event] });
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading timeline…
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2">
                {FILTER_TYPES.map((type) => {
                    const meta = TYPE_META[type];
                    const active = activeTypes.has(type);
                    return (
                        <button
                            key={type}
                            onClick={() => toggleType(type)}
                            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                                active
                                    ? "border-gray-900 bg-gray-900 text-white"
                                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"
                            }`}
                        >
                            <meta.Icon className="h-3 w-3" />
                            {meta.label}
                        </button>
                    );
                })}
                {activeTypes.size > 0 && (
                    <button
                        onClick={() => setActiveTypes(new Set())}
                        className="h-6 rounded-full px-2.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-100"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {error && (
                <div className="px-4 py-2 text-xs text-red-600">{error}</div>
            )}

            {events.length === 0 ? (
                <div className="flex flex-col items-start py-24 w-full max-w-xs mx-auto">
                    <History className="h-8 w-8 text-gray-300 mb-4" />
                    <p className="text-2xl font-medium font-serif text-gray-900">
                        Matter Timeline
                    </p>
                    <p className="mt-1 text-xs text-gray-400 max-w-xs">
                        Every document, chat, memory, deadline, and party in
                        this matter appears here in chronological order as
                        work happens.
                    </p>
                </div>
            ) : (
                <div className="px-4 py-3">
                    {groups.map((group) => (
                        <div key={group.day} className="mb-4">
                            <div className="sticky top-0 z-10 bg-[#fafbfc] py-1 text-xs font-medium text-gray-400 select-none">
                                {group.day}
                            </div>
                            <div className="mt-1 space-y-0.5">
                                {group.items.map((event) => {
                                    const meta = TYPE_META[event.type];
                                    return (
                                        <div
                                            key={event.id}
                                            className="flex items-start gap-3 rounded px-1 py-1.5 hover:bg-gray-100 transition-colors"
                                        >
                                            <meta.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                                            <div className="min-w-0 flex-1">
                                                <span className="block whitespace-normal break-words text-sm text-gray-800">
                                                    {event.title}
                                                </span>
                                                {event.detail && (
                                                    <span className="block text-xs text-gray-400">
                                                        {event.detail}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-xs text-gray-400">
                                                {timeLabel(event.at)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="py-8 text-sm text-gray-400">
                            No activity matches your filters.
                        </div>
                    )}
                    {nextBefore && (
                        <button
                            onClick={() => void loadMore()}
                            disabled={loadingMore}
                            className="mb-4 inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs text-gray-600 transition-colors hover:border-gray-400 disabled:opacity-40"
                        >
                            {loadingMore ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Load more
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
