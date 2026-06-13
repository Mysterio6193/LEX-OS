"use client";

import { useEffect, useState } from "react";
import {
    Briefcase,
    CalendarClock,
    FileSignature,
    Gavel,
    History,
    ListChecks,
    Loader2,
    Sparkles,
    Users,
} from "lucide-react";
import {
    getProjectTimeline,
    listProjectDeadlines,
    listProjectHearings,
    listProjectMemories,
    listProjectParties,
    listProjectTasks,
} from "@/app/lib/mikeApi";
import type {
    Project,
    ProjectDeadline,
    ProjectHearing,
    ProjectMemory,
    ProjectParty,
    ProjectTask,
    TimelineEvent,
} from "@/app/components/shared/types";
import type { ProjectTab } from "./ProjectPageParts";

const SECTION_LIMIT = 5;

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function roleLabel(role: string): string {
    return role.replace(/_/g, " ");
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
    });
}

function SectionCard({
    icon: Icon,
    title,
    viewAllTab,
    onNavigate,
    children,
}: {
    icon: typeof Users;
    title: string;
    viewAllTab?: ProjectTab;
    onNavigate: (tab: ProjectTab) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <Icon className="h-4 w-4 text-gray-400" />
                    {title}
                </div>
                {viewAllTab && (
                    <button
                        onClick={() => onNavigate(viewAllTab)}
                        className="text-xs text-gray-400 transition-colors hover:text-gray-700"
                    >
                        View all →
                    </button>
                )}
            </div>
            {children}
        </div>
    );
}

function EmptyHint({ text }: { text: string }) {
    return <p className="text-xs text-gray-400">{text}</p>;
}

export function ProjectOverviewTab({
    projectId,
    project,
    onNavigate,
    onDraftStatusReport,
}: {
    projectId: string;
    project: Project | null;
    onNavigate: (tab: ProjectTab) => void;
    onDraftStatusReport: () => void;
}) {
    const [parties, setParties] = useState<ProjectParty[]>([]);
    const [deadlines, setDeadlines] = useState<ProjectDeadline[]>([]);
    const [hearings, setHearings] = useState<ProjectHearing[]>([]);
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [memories, setMemories] = useState<ProjectMemory[]>([]);
    const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([
            listProjectParties(projectId),
            listProjectDeadlines(projectId),
            listProjectTasks(projectId),
            listProjectMemories(projectId),
            getProjectTimeline(projectId, { limit: 10 }),
            listProjectHearings(projectId),
        ]).then(([p, d, t, m, tl, h]) => {
            if (cancelled) return;
            if (p.status === "fulfilled") setParties(p.value);
            if (d.status === "fulfilled") setDeadlines(d.value);
            if (t.status === "fulfilled") setTasks(t.value);
            if (m.status === "fulfilled") setMemories(m.value);
            if (tl.status === "fulfilled") setTimeline(tl.value.events);
            if (h.status === "fulfilled") setHearings(h.value);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading overview…
            </div>
        );
    }

    const today = todayIso();
    const upcomingDeadlines = deadlines
        .filter((d) => d.status === "pending")
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, SECTION_LIMIT);
    const upcomingHearings = hearings
        .filter((h) => h.status !== "done")
        .sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))
        .slice(0, SECTION_LIMIT);
    const openTasks = tasks.filter((t) => t.status === "pending");
    const decisions = memories.filter((m) => m.kind === "decision");
    const keyMemories = (decisions.length ? decisions : memories).slice(
        0,
        SECTION_LIMIT,
    );

    return (
        <div className="px-4 py-4">
            <div className="mb-3 flex items-center justify-end">
                <button
                    onClick={onDraftStatusReport}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs text-gray-600 transition-colors hover:border-gray-400"
                >
                    <FileSignature className="h-3.5 w-3.5 text-gray-400" />
                    Draft status report
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                <SectionCard
                    icon={Briefcase}
                    title="Matter"
                    onNavigate={onNavigate}
                >
                    <div className="space-y-1 text-sm text-gray-700">
                        <p className="font-medium text-gray-900">
                            {project?.name ?? "—"}
                        </p>
                        {project?.cm_number && (
                            <p className="text-xs text-gray-400">
                                CM {project.cm_number}
                            </p>
                        )}
                        <p className="text-xs text-gray-500">
                            Client:{" "}
                            {project?.client?.name ?? (
                                <span className="text-gray-400">
                                    not linked
                                </span>
                            )}
                        </p>
                        {(project?.matter_type ||
                            project?.court ||
                            project?.case_number ||
                            project?.jurisdiction) && (
                            <div className="mt-1 space-y-0.5 border-t border-gray-100 pt-1 text-xs text-gray-500">
                                {project?.matter_type && (
                                    <p>{project.matter_type}</p>
                                )}
                                {project?.court && (
                                    <p>
                                        {project.court}
                                        {project?.case_number
                                            ? ` · ${project.case_number}`
                                            : ""}
                                    </p>
                                )}
                                {(project?.jurisdiction ||
                                    project?.filing_date) && (
                                    <p>
                                        {project?.jurisdiction ?? ""}
                                        {project?.jurisdiction &&
                                        project?.filing_date
                                            ? " · "
                                            : ""}
                                        {project?.filing_date
                                            ? `filed ${project.filing_date}`
                                            : ""}
                                    </p>
                                )}
                            </div>
                        )}
                        <p className="text-xs text-gray-500">
                            {project?.document_count ?? 0} documents ·{" "}
                            {project?.chat_count ?? 0} chats ·{" "}
                            {openTasks.length} open tasks
                        </p>
                    </div>
                </SectionCard>

                <SectionCard
                    icon={CalendarClock}
                    title="Upcoming deadlines"
                    viewAllTab="deadlines"
                    onNavigate={onNavigate}
                >
                    {upcomingDeadlines.length === 0 ? (
                        <EmptyHint text="No pending deadlines." />
                    ) : (
                        <ul className="space-y-1.5">
                            {upcomingDeadlines.map((d) => (
                                <li
                                    key={d.id}
                                    className="flex items-baseline gap-2 text-sm"
                                >
                                    <span
                                        className={`shrink-0 text-xs font-medium ${d.due_date < today ? "text-red-600" : "text-gray-400"}`}
                                    >
                                        {shortDate(d.due_date)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-gray-700">
                                        {d.title}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard
                    icon={Gavel}
                    title="Upcoming hearings"
                    viewAllTab="hearings"
                    onNavigate={onNavigate}
                >
                    {upcomingHearings.length === 0 ? (
                        <EmptyHint text="No upcoming hearings." />
                    ) : (
                        <ul className="space-y-1.5">
                            {upcomingHearings.map((h) => (
                                <li
                                    key={h.id}
                                    className="flex items-baseline gap-2 text-sm"
                                >
                                    <span
                                        className={`shrink-0 text-xs font-medium ${h.hearing_date < today ? "text-red-600" : "text-gray-400"}`}
                                    >
                                        {shortDate(h.hearing_date)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-gray-700">
                                        {h.purpose}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard
                    icon={ListChecks}
                    title="Checklist"
                    viewAllTab="tasks"
                    onNavigate={onNavigate}
                >
                    {tasks.length === 0 ? (
                        <EmptyHint text="No tasks yet — apply a matter template from the Checklist tab." />
                    ) : openTasks.length === 0 ? (
                        <EmptyHint text="All tasks done." />
                    ) : (
                        <>
                            <p className="mb-1.5 text-xs text-gray-400">
                                {openTasks.length} of {tasks.length} pending
                            </p>
                            <ul className="space-y-1.5">
                                {openTasks
                                    .slice(0, SECTION_LIMIT)
                                    .map((t) => (
                                        <li
                                            key={t.id}
                                            className="truncate text-sm text-gray-700"
                                        >
                                            {t.title}
                                        </li>
                                    ))}
                            </ul>
                        </>
                    )}
                </SectionCard>

                <SectionCard
                    icon={Users}
                    title="Parties"
                    viewAllTab="parties"
                    onNavigate={onNavigate}
                >
                    {parties.length === 0 ? (
                        <EmptyHint text="No parties recorded yet." />
                    ) : (
                        <ul className="space-y-1.5">
                            {parties.slice(0, SECTION_LIMIT).map((p) => (
                                <li
                                    key={p.id}
                                    className="flex items-baseline gap-2 text-sm"
                                >
                                    <span className="min-w-0 flex-1 truncate text-gray-700">
                                        {p.name}
                                    </span>
                                    <span className="shrink-0 text-xs capitalize text-gray-400">
                                        {roleLabel(p.role)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard
                    icon={Sparkles}
                    title={decisions.length ? "Key decisions" : "Memory"}
                    viewAllTab="memory"
                    onNavigate={onNavigate}
                >
                    {keyMemories.length === 0 ? (
                        <EmptyHint text="Nothing saved to matter memory yet." />
                    ) : (
                        <ul className="space-y-1.5">
                            {keyMemories.map((m) => (
                                <li
                                    key={m.id}
                                    className="text-sm text-gray-700"
                                >
                                    <span className="line-clamp-2">
                                        {m.content}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard
                    icon={History}
                    title="Recent activity"
                    viewAllTab="timeline"
                    onNavigate={onNavigate}
                >
                    {timeline.length === 0 ? (
                        <EmptyHint text="No activity yet." />
                    ) : (
                        <ul className="space-y-1.5">
                            {timeline.slice(0, 6).map((e) => (
                                <li
                                    key={e.id}
                                    className="flex items-baseline gap-2 text-sm"
                                >
                                    <span className="shrink-0 text-xs text-gray-400">
                                        {shortDate(e.at)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-gray-700">
                                        {e.title}
                                        {e.detail && (
                                            <span className="text-gray-400">
                                                {" "}
                                                — {e.detail}
                                            </span>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>
            </div>
        </div>
    );
}
