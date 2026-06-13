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
        <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.015)] hover:shadow-[0_8px_30px_rgba(0,136,255,0.04)] hover:border-blue-500/30 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group">
            <div>
                <div className="mb-4 flex items-center justify-between border-b border-gray-50 pb-3">
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-800">
                        <div className="rounded-lg bg-slate-50 p-1.5 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors duration-300">
                            <Icon className="h-4 w-4" />
                        </div>
                        <span>{title}</span>
                    </div>
                    {viewAllTab && (
                        <button
                            onClick={() => onNavigate(viewAllTab)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors flex items-center gap-0.5"
                        >
                            View all →
                        </button>
                    )}
                </div>
                <div>{children}</div>
            </div>
        </div>
    );
}

function EmptyHint({ text }: { text: string }) {
    return <p className="text-xs text-gray-400 italic py-2">{text}</p>;
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
            <div className="flex items-center justify-center gap-3 px-4 py-20 text-sm text-gray-500 font-medium">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                Loading matter dashboard…
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

    const totalTasks = tasks.length;
    const completedTasks = totalTasks - openTasks.length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
        <div className="px-6 py-6 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Matter Overview</h2>
                    <p className="text-xs text-gray-500">Key info, status, deadlines, and activity at a glance.</p>
                </div>
                <button
                    onClick={onDraftStatusReport}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-4 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 hover:text-blue-800 shadow-sm"
                >
                    <FileSignature className="h-3.5 w-3.5 text-blue-600" />
                    Draft status report
                </button>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                <SectionCard
                    icon={Briefcase}
                    title="Matter"
                    onNavigate={onNavigate}
                >
                    <div className="space-y-3.5 text-sm text-gray-700">
                        <div>
                            <p className="font-semibold text-gray-900 text-base group-hover:text-blue-600 transition-colors duration-300">
                                {project?.name ?? "—"}
                            </p>
                            {project?.cm_number && (
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 mt-1">
                                    CM {project.cm_number}
                                </span>
                            )}
                        </div>

                        <div className="text-xs text-gray-600 flex items-center gap-1.5">
                            <span className="text-gray-400 font-medium">Client:</span>
                            {project?.client?.name ? (
                                <span className="font-semibold text-gray-800 bg-blue-50/50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100/50">
                                    {project.client.name}
                                </span>
                            ) : (
                                <span className="italic text-gray-400">not linked</span>
                            )}
                        </div>

                        {(project?.matter_type ||
                            project?.court ||
                            project?.case_number ||
                            project?.jurisdiction) && (
                            <div className="space-y-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
                                {project?.matter_type && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-gray-400 w-16">Type:</span>
                                        <span className="font-medium text-gray-800">{project.matter_type}</span>
                                    </div>
                                )}
                                {project?.court && (
                                    <div className="flex items-start gap-1.5">
                                        <span className="text-gray-400 w-16 shrink-0">Court:</span>
                                        <span className="font-medium text-gray-800">
                                            {project.court}
                                            {project?.case_number
                                                ? ` (${project.case_number})`
                                                : ""}
                                        </span>
                                    </div>
                                )}
                                {project?.jurisdiction && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-gray-400 w-16">Jurisdiction:</span>
                                        <span className="font-medium text-gray-800">{project.jurisdiction}</span>
                                    </div>
                                )}
                                {project?.filing_date && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-gray-400 w-16">Filed:</span>
                                        <span className="font-medium text-gray-800">{project.filing_date}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        <div className="mt-4 flex items-center gap-3 text-xs text-gray-400 border-t border-gray-50 pt-3">
                            <span className="flex items-center gap-1">📁 <strong className="text-gray-700 font-semibold">{project?.document_count ?? 0}</strong> docs</span>
                            <span className="flex items-center gap-1">💬 <strong className="text-gray-700 font-semibold">{project?.chat_count ?? 0}</strong> chats</span>
                            <span className="flex items-center gap-1">📋 <strong className="text-gray-700 font-semibold">{openTasks.length}</strong> pending</span>
                        </div>
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
                        <ul className="space-y-2">
                            {upcomingDeadlines.map((d) => (
                                <li
                                    key={d.id}
                                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors duration-200"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{d.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{shortDate(d.due_date)}</p>
                                    </div>
                                    {d.due_date < today ? (
                                        <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10 shrink-0">
                                            Overdue
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10 shrink-0">
                                            Pending
                                        </span>
                                    )}
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
                        <ul className="space-y-2">
                            {upcomingHearings.map((h) => (
                                <li
                                    key={h.id}
                                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors duration-200"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{h.purpose}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{shortDate(h.hearing_date)}</p>
                                    </div>
                                    {h.hearing_date < today ? (
                                        <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-500/10 shrink-0">
                                            Past
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 shrink-0">
                                            Scheduled
                                        </span>
                                    )}
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
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                                    <span>Task Progress</span>
                                    <span>{completedTasks}/{totalTasks} ({progressPercent}%)</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5">
                                    <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                                </div>
                            </div>
                            
                            {openTasks.length === 0 ? (
                                <EmptyHint text="All tasks done." />
                            ) : (
                                <ul className="space-y-1.5">
                                    {openTasks
                                        .slice(0, SECTION_LIMIT)
                                        .map((t) => (
                                            <li
                                                key={t.id}
                                                className="flex items-center gap-2.5 p-1.5 hover:bg-slate-50 rounded-lg transition-colors duration-200 truncate text-sm text-gray-700"
                                            >
                                                <div className="h-4 w-4 rounded border border-gray-300 bg-white flex items-center justify-center flex-shrink-0" />
                                                <span className="truncate">{t.title}</span>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
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
                        <ul className="space-y-2">
                            {parties.slice(0, SECTION_LIMIT).map((p) => (
                                <li
                                    key={p.id}
                                    className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors duration-200"
                                >
                                    <span className="text-sm font-semibold text-gray-800 truncate">
                                        {p.name}
                                    </span>
                                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset shrink-0 ${
                                        p.role === "client" ? "bg-blue-50 text-blue-700 ring-blue-600/10" :
                                        p.role === "counterparty" ? "bg-amber-50 text-amber-700 ring-amber-600/10" :
                                        p.role === "opposing_counsel" ? "bg-rose-50 text-rose-700 ring-rose-600/10" :
                                        "bg-slate-50 text-slate-600 ring-slate-500/10"
                                    }`}>
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
                        <ul className="space-y-2">
                            {keyMemories.map((m) => (
                                <li
                                    key={m.id}
                                    className="p-3 bg-amber-50/30 rounded-xl border border-amber-100/50 hover:bg-amber-50/60 transition-colors duration-200"
                                >
                                    <p className="text-xs text-amber-800 font-semibold mb-1 uppercase tracking-wider">
                                        {m.kind === "decision" ? "Decision" : "Info"}
                                    </p>
                                    <span className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
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
                        <div className="relative pl-4 border-l border-slate-100 ml-1 py-1 space-y-4">
                            {timeline.slice(0, 5).map((e) => (
                                <div key={e.id} className="relative group/item">
                                    <span className="absolute -left-[20.5px] top-1.5 block h-2.5 w-2.5 rounded-full border border-white bg-slate-300 ring-2 ring-white group-hover/item:bg-blue-500 group-hover/item:ring-blue-100 transition-all duration-300" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase">{shortDate(e.at)}</span>
                                        <span className="text-xs text-slate-700 font-medium leading-relaxed mt-0.5">
                                            {e.title}
                                            {e.detail && (
                                                <span className="text-slate-400 font-normal">
                                                    {" "}
                                                    — {e.detail}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </div>
    );
}
