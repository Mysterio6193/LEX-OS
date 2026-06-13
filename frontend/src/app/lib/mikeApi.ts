/**
 * Mike API client — all requests to the Node.js backend.
 * Attaches the Supabase auth token for user authentication.
 */

import { supabase } from "@/lib/supabase";
import type {
    AssistantEvent,
    Chat,
    ChatDetailOut,
    CitationAnnotation,
    Client,
    ConflictMatch,
    Document,
    Folder,
    Message,
    ConflictCheckResponse,
    Project,
    ProjectDeadline,
    ProjectHearing,
    ProjectMemory,
    BillingSettings,
    TimeEntry,
    Invoice,
    InvoiceLineItem,
    MatterTemplate,
    ProjectParty,
    ProjectTask,
    TimelineEvent,
    TimelineResponse,
    Workflow,
    TabularReview,
    TabularReviewDetailOut,
    TabularCell,
} from "@/app/components/shared/types";

// Server-side shape before mapping
interface ServerMessage {
    id: string;
    chat_id: string;
    role: "user" | "assistant";
    content: string | AssistantEvent[] | null;
    files?: { filename: string; document_id?: string }[] | null;
    workflow?: { id: string; title: string } | null;
    annotations?: CitationAnnotation[] | null;
    created_at: string;
}
interface ServerChatDetailOut {
    chat: Chat;
    messages: ServerMessage[];
}

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const isDev = process.env.NODE_ENV !== "production";
const getSupabaseUrl = () => {
    try {
        return process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
    } catch {
        return "https://placeholder-project.supabase.co";
    }
};

const isDemoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    getSupabaseUrl().includes("placeholder") ||
    getSupabaseUrl().includes("your-project") ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL;
const devLog = (...args: Parameters<typeof console.log>) => {
    if (isDev) console.log(...args);
};

export class MikeApiError extends Error {
    status: number;
    code: string | null;

    constructor(args: { message: string; status: number; code?: string | null }) {
        super(args.message);
        this.name = "MikeApiError";
        this.status = args.status;
        this.code = args.code ?? null;
    }
}

export function isMfaRequiredError(error: unknown) {
    return (
        error instanceof MikeApiError &&
        error.status === 403 &&
        error.code === "mfa_verification_required"
    );
}

async function getAuthHeader(): Promise<Record<string, string>> {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const authHeaders = await getAuthHeader();
    const { headers: initHeaders, ...restInit } = init ?? {};
    const response = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
        ...restInit,
        headers: {
            Accept: "application/json",
            ...authHeaders,
            ...(initHeaders as Record<string, string> | undefined),
        },
    });

    if (!response.ok) {
        throw await toApiError(response, path);
    }

    if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
    ) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

async function apiBlobRequest(path: string): Promise<{
    blob: Blob;
    filename: string | null;
}> {
    const authHeaders = await getAuthHeader();
    const response = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
        headers: {
            Accept: "application/json",
            ...authHeaders,
        },
    });

    if (!response.ok) {
        throw await toApiError(response, path);
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    return {
        blob: await response.blob(),
        filename: filenameMatch?.[1] ?? null,
    };
}

async function toApiError(response: Response, path: string) {
    const text = await response.text();
    try {
        const parsed = JSON.parse(text) as {
            detail?: unknown;
            code?: unknown;
        };
        devLog("[mike-api] non-ok response", {
            path,
            status: response.status,
            code: parsed.code,
            detail: parsed.detail,
        });
        return new MikeApiError({
            status: response.status,
            code: typeof parsed.code === "string" ? parsed.code : null,
            message:
                typeof parsed.detail === "string" && parsed.detail
                    ? parsed.detail
                    : `API error: ${response.status}`,
        });
    } catch {
        devLog("[mike-api] non-ok non-json response", {
            path,
            status: response.status,
            bodyPreview: text.slice(0, 200),
        });
        return new MikeApiError({
            status: response.status,
            message: text || `API error: ${response.status}`,
        });
    }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(
    includeArchived = false,
): Promise<Project[]> {
    if (isDemoMode) return mockApi.listProjects();
    return apiRequest<Project[]>(
        includeArchived ? "/projects?include_archived=true" : "/projects",
    );
}

export async function cloneProject(
    projectId: string,
    name?: string,
): Promise<Project> {
    if (isDemoMode) return mockApi.cloneProject(projectId, name);
    return apiRequest<Project>(`/projects/${projectId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(name ? { name } : {}),
    });
}

export async function createProject(
    name: string,
    cm_number?: string,
    shared_with?: string[],
): Promise<Project> {
    if (isDemoMode) return mockApi.createProject(name, cm_number, shared_with);
    return apiRequest<Project>("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cm_number, shared_with }),
    });
}

export async function deleteAccount(): Promise<void> {
    if (isDemoMode) return mockApi.deleteAccount();
    return apiRequest<void>("/user/account", { method: "DELETE" });
}

export async function deleteAllChats(): Promise<void> {
    if (isDemoMode) return mockApi.deleteAllChats();
    return apiRequest<void>("/user/chats", { method: "DELETE" });
}

export async function deleteAllProjects(): Promise<void> {
    if (isDemoMode) return mockApi.deleteAllProjects();
    return apiRequest<void>("/user/projects", { method: "DELETE" });
}

export async function deleteAllTabularReviews(): Promise<void> {
    if (isDemoMode) return mockApi.deleteAllTabularReviews();
    return apiRequest<void>("/user/tabular-reviews", { method: "DELETE" });
}

export async function exportAccountData(): Promise<{
    blob: Blob;
    filename: string | null;
}> {
    if (isDemoMode) return mockApi.exportAccountData();
    return apiBlobRequest("/user/export");
}

export async function exportChatData(): Promise<{
    blob: Blob;
    filename: string | null;
}> {
    if (isDemoMode) return mockApi.exportChatData();
    return apiBlobRequest("/user/chats/export");
}

export async function exportTabularReviewsData(): Promise<{
    blob: Blob;
    filename: string | null;
}> {
    if (isDemoMode) return mockApi.exportTabularReviewsData();
    return apiBlobRequest("/user/tabular-reviews/export");
}

export interface UserProfile {
    displayName: string | null;
    organisation: string | null;
    messageCreditsUsed: number;
    creditsResetDate: string;
    creditsRemaining: number;
    tier: string;
    titleModel: string;
    tabularModel: string;
    mfaOnLogin: boolean;
    legalResearchIn: boolean;
    apiKeyStatus: ApiKeyStatus;
}

export async function getUserProfile(): Promise<UserProfile> {
    if (isDemoMode) return mockApi.getUserProfile();
    return apiRequest<UserProfile>("/user/profile");
}

export async function updateUserProfile(payload: {
    displayName?: string | null;
    organisation?: string | null;
    titleModel?: string;
    tabularModel?: string;
    legalResearchIn?: boolean;
}): Promise<UserProfile> {
    if (isDemoMode) return mockApi.updateUserProfile(payload);
    return apiRequest<UserProfile>("/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function updateUserMfaOnLogin(
    enabled: boolean,
): Promise<UserProfile> {
    if (isDemoMode) return mockApi.updateUserMfaOnLogin(enabled);
    return apiRequest<UserProfile>("/user/security/mfa-login", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
    });
}

export type ApiKeyProvider =
    | "claude"
    | "gemini"
    | "openai"
    | "openrouter"
    | "indiankanoon";
export type ApiKeySource = "user" | "env" | null;
export type ApiKeyState = Record<
    ApiKeyProvider,
    {
        configured: boolean;
        source: ApiKeySource;
    }
>;

export type ApiKeyStatus = Record<ApiKeyProvider, boolean> & {
    sources?: Partial<Record<ApiKeyProvider, ApiKeySource>>;
};

export async function getApiKeyStatus(): Promise<ApiKeyStatus> {
    if (isDemoMode) return mockApi.getApiKeyStatus();
    return apiRequest<ApiKeyStatus>("/user/api-keys");
}

export async function saveApiKey(
    provider: ApiKeyProvider,
    apiKey: string | null,
): Promise<ApiKeyStatus> {
    if (isDemoMode) return mockApi.saveApiKey(provider, apiKey);
    return apiRequest<ApiKeyStatus>(`/user/api-keys/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
    });
}

export async function getProject(projectId: string): Promise<Project> {
    if (isDemoMode) return mockApi.getProject(projectId);
    return apiRequest<Project>(`/projects/${projectId}`);
}

export async function updateProject(
    projectId: string,
    payload: {
        name?: string;
        cm_number?: string;
        client_id?: string | null;
        shared_with?: string[];
        archived?: boolean;
        matter_type?: string | null;
        court?: string | null;
        case_number?: string | null;
        jurisdiction?: string | null;
        filing_date?: string | null;
    },
): Promise<Project> {
    if (isDemoMode) return mockApi.updateProject(projectId, payload);
    return apiRequest<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function deleteProject(projectId: string): Promise<void> {
    if (isDemoMode) return mockApi.deleteProject(projectId);
    await apiRequest(`/projects/${projectId}`, { method: "DELETE" });
}

export async function setDocumentPrecedent(
    projectId: string,
    documentId: string,
    isPrecedent: boolean,
): Promise<{ id: string; is_precedent: boolean }> {
    if (isDemoMode) return mockApi.setDocumentPrecedent(projectId, documentId, isPrecedent);
    return apiRequest<{ id: string; is_precedent: boolean }>(
        `/projects/${projectId}/documents/${documentId}/precedent`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_precedent: isPrecedent }),
        },
    );
}

// Clients

export async function listClients(): Promise<Client[]> {
    if (isDemoMode) return mockApi.listClients();
    return apiRequest<Client[]>("/clients");
}

export async function createClient(body: {
    name: string;
    notes?: string;
}): Promise<Client> {
    if (isDemoMode) return mockApi.createClient(body);
    return apiRequest<Client>("/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateClient(
    clientId: string,
    body: { name?: string; notes?: string | null },
): Promise<Client> {
    if (isDemoMode) return mockApi.updateClient(clientId, body);
    return apiRequest<Client>(`/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function deleteClient(clientId: string): Promise<void> {
    if (isDemoMode) return mockApi.deleteClient(clientId);
    await apiRequest(`/clients/${clientId}`, { method: "DELETE" });
}

export interface ProjectPeople {
    owner: {
        user_id: string;
        email: string | null;
        display_name: string | null;
    };
    members: { email: string; display_name: string | null }[];
}

export async function getProjectPeople(
    projectId: string,
): Promise<ProjectPeople> {
    if (isDemoMode) return mockApi.getProjectPeople(projectId);
    return apiRequest<ProjectPeople>(`/projects/${projectId}/people`);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createProjectFolder(
    projectId: string,
    name: string,
    parentFolderId?: string | null,
): Promise<Folder> {
    if (isDemoMode) return mockApi.createProjectFolder(projectId, name, parentFolderId);
    return apiRequest<Folder>(`/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            parent_folder_id: parentFolderId ?? null,
        }),
    });
}

export async function listProjectMemories(
    projectId: string,
): Promise<ProjectMemory[]> {
    if (isDemoMode) return mockApi.listProjectMemories(projectId);
    return apiRequest<ProjectMemory[]>(`/projects/${projectId}/memory`);
}

export async function createProjectMemory(
    projectId: string,
    body: { kind: ProjectMemory["kind"]; content: string },
): Promise<ProjectMemory> {
    if (isDemoMode) return mockApi.createProjectMemory(projectId, body);
    return apiRequest<ProjectMemory>(`/projects/${projectId}/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateProjectMemory(
    projectId: string,
    memoryId: string,
    body: { kind?: ProjectMemory["kind"]; content?: string },
): Promise<ProjectMemory> {
    if (isDemoMode) return mockApi.updateProjectMemory(projectId, memoryId, body);
    return apiRequest<ProjectMemory>(
        `/projects/${projectId}/memory/${memoryId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function deleteProjectMemory(
    projectId: string,
    memoryId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteProjectMemory(projectId, memoryId);
    await apiRequest(`/projects/${projectId}/memory/${memoryId}`, {
        method: "DELETE",
    });
}

export async function listProjectDeadlines(
    projectId: string,
): Promise<ProjectDeadline[]> {
    if (isDemoMode) return mockApi.listProjectDeadlines(projectId);
    return apiRequest<ProjectDeadline[]>(`/projects/${projectId}/deadlines`);
}

export async function createProjectDeadline(
    projectId: string,
    body: { title: string; due_date: string; notes?: string },
): Promise<ProjectDeadline> {
    if (isDemoMode) return mockApi.createProjectDeadline(projectId, body);
    return apiRequest<ProjectDeadline>(`/projects/${projectId}/deadlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateProjectDeadline(
    projectId: string,
    deadlineId: string,
    body: {
        title?: string;
        due_date?: string;
        notes?: string | null;
        status?: ProjectDeadline["status"];
    },
): Promise<ProjectDeadline> {
    if (isDemoMode) return mockApi.updateProjectDeadline(projectId, deadlineId, body);
    return apiRequest<ProjectDeadline>(
        `/projects/${projectId}/deadlines/${deadlineId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function deleteProjectDeadline(
    projectId: string,
    deadlineId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteProjectDeadline(projectId, deadlineId);
    await apiRequest(`/projects/${projectId}/deadlines/${deadlineId}`, {
        method: "DELETE",
    });
}

export async function listProjectHearings(
    projectId: string,
): Promise<ProjectHearing[]> {
    if (isDemoMode) return mockApi.listProjectHearings(projectId);
    return apiRequest<ProjectHearing[]>(`/projects/${projectId}/hearings`);
}

export async function createProjectHearing(
    projectId: string,
    body: {
        purpose: string;
        hearing_date: string;
        court?: string;
        case_number?: string;
        notes?: string;
    },
): Promise<ProjectHearing> {
    if (isDemoMode) return mockApi.createProjectHearing(projectId, body);
    return apiRequest<ProjectHearing>(`/projects/${projectId}/hearings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateProjectHearing(
    projectId: string,
    hearingId: string,
    body: {
        purpose?: string;
        hearing_date?: string;
        court?: string | null;
        case_number?: string | null;
        notes?: string | null;
        status?: ProjectHearing["status"];
    },
): Promise<ProjectHearing> {
    if (isDemoMode) return mockApi.updateProjectHearing(projectId, hearingId, body);
    return apiRequest<ProjectHearing>(
        `/projects/${projectId}/hearings/${hearingId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function deleteProjectHearing(
    projectId: string,
    hearingId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteProjectHearing(projectId, hearingId);
    await apiRequest(`/projects/${projectId}/hearings/${hearingId}`, {
        method: "DELETE",
    });
}

// --- Billing: firm settings, time entries, GST invoices ---

export async function getBillingSettings(): Promise<BillingSettings> {
    if (isDemoMode) return mockApi.getBillingSettings();
    return apiRequest<BillingSettings>(`/billing/settings`);
}

export async function updateBillingSettings(body: {
    firm_gstin?: string | null;
    firm_state?: string | null;
    default_hourly_rate?: number | null;
}): Promise<BillingSettings> {
    if (isDemoMode) return mockApi.updateBillingSettings(body);
    return apiRequest<BillingSettings>(`/billing/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function listTimeEntries(
    projectId: string,
): Promise<TimeEntry[]> {
    if (isDemoMode) return mockApi.listTimeEntries(projectId);
    return apiRequest<TimeEntry[]>(
        `/projects/${projectId}/billing/time-entries`,
    );
}

export async function createTimeEntry(
    projectId: string,
    body: {
        description: string;
        minutes: number;
        entry_date?: string;
        rate?: number;
    },
): Promise<TimeEntry> {
    if (isDemoMode) return mockApi.createTimeEntry(projectId, body);
    return apiRequest<TimeEntry>(
        `/projects/${projectId}/billing/time-entries`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function updateTimeEntry(
    projectId: string,
    entryId: string,
    body: { description?: string; billed?: boolean },
): Promise<TimeEntry> {
    if (isDemoMode) return mockApi.updateTimeEntry(projectId, entryId, body);
    return apiRequest<TimeEntry>(
        `/projects/${projectId}/billing/time-entries/${entryId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function deleteTimeEntry(
    projectId: string,
    entryId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteTimeEntry(projectId, entryId);
    await apiRequest(
        `/projects/${projectId}/billing/time-entries/${entryId}`,
        { method: "DELETE" },
    );
}

export async function listInvoices(projectId: string): Promise<Invoice[]> {
    if (isDemoMode) return mockApi.listInvoices(projectId);
    return apiRequest<Invoice[]>(`/projects/${projectId}/billing/invoices`);
}

export async function createInvoice(
    projectId: string,
    body: {
        invoice_date?: string;
        client_name?: string;
        client_gstin?: string;
        place_of_supply?: string;
        time_entry_ids?: string[];
        line_items?: InvoiceLineItem[];
        notes?: string;
    },
): Promise<Invoice> {
    if (isDemoMode) return mockApi.createInvoice(projectId, body);
    return apiRequest<Invoice>(`/projects/${projectId}/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateInvoiceStatus(
    projectId: string,
    invoiceId: string,
    status: Invoice["status"],
): Promise<Invoice> {
    if (isDemoMode)
        return mockApi.updateInvoiceStatus(projectId, invoiceId, status);
    return apiRequest<Invoice>(
        `/projects/${projectId}/billing/invoices/${invoiceId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        },
    );
}

export async function listProjectParties(
    projectId: string,
): Promise<ProjectParty[]> {
    if (isDemoMode) return mockApi.listProjectParties(projectId);
    return apiRequest<ProjectParty[]>(`/projects/${projectId}/parties`);
}

export async function createProjectParty(
    projectId: string,
    body: { name: string; role: ProjectParty["role"]; notes?: string },
): Promise<ProjectParty> {
    if (isDemoMode) return mockApi.createProjectParty(projectId, body);
    return apiRequest<ProjectParty>(`/projects/${projectId}/parties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateProjectParty(
    projectId: string,
    partyId: string,
    body: {
        name?: string;
        role?: ProjectParty["role"];
        notes?: string | null;
    },
): Promise<ProjectParty> {
    if (isDemoMode) return mockApi.updateProjectParty(projectId, partyId, body);
    return apiRequest<ProjectParty>(
        `/projects/${projectId}/parties/${partyId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function deleteProjectParty(
    projectId: string,
    partyId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteProjectParty(projectId, partyId);
    await apiRequest(`/projects/${projectId}/parties/${partyId}`, {
        method: "DELETE",
    });
}

export async function runConflictCheck(body: {
    names?: string[];
    project_id?: string;
}): Promise<ConflictCheckResponse> {
    if (isDemoMode) return mockApi.runConflictCheck(body);
    return apiRequest<ConflictCheckResponse>(`/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function getProjectTimeline(
    projectId: string,
    opts?: { before?: string; limit?: number },
): Promise<TimelineResponse> {
    if (isDemoMode) return mockApi.getProjectTimeline(projectId, opts);
    const params = new URLSearchParams();
    if (opts?.before) params.set("before", opts.before);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return apiRequest<TimelineResponse>(
        `/projects/${projectId}/timeline${qs ? `?${qs}` : ""}`,
    );
}

export async function listProjectTasks(
    projectId: string,
): Promise<ProjectTask[]> {
    if (isDemoMode) return mockApi.listProjectTasks(projectId);
    return apiRequest<ProjectTask[]>(`/projects/${projectId}/tasks`);
}

export async function createProjectTask(
    projectId: string,
    body: { title: string; notes?: string },
): Promise<ProjectTask> {
    if (isDemoMode) return mockApi.createProjectTask(projectId, body);
    return apiRequest<ProjectTask>(`/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function updateProjectTask(
    projectId: string,
    taskId: string,
    body: {
        title?: string;
        notes?: string | null;
        status?: ProjectTask["status"];
        position?: number;
    },
): Promise<ProjectTask> {
    if (isDemoMode) return mockApi.updateProjectTask(projectId, taskId, body);
    return apiRequest<ProjectTask>(
        `/projects/${projectId}/tasks/${taskId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
}

export async function deleteProjectTask(
    projectId: string,
    taskId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteProjectTask(projectId, taskId);
    await apiRequest(`/projects/${projectId}/tasks/${taskId}`, {
        method: "DELETE",
    });
}

export async function listMatterTemplates(): Promise<MatterTemplate[]> {
    if (isDemoMode) return mockApi.listMatterTemplates();
    return apiRequest<MatterTemplate[]>(`/matter-templates`);
}

export async function applyMatterTemplate(
    projectId: string,
    templateId: string,
): Promise<{ added: number; tasks: ProjectTask[] }> {
    if (isDemoMode) return mockApi.applyMatterTemplate(projectId, templateId);
    return apiRequest<{ added: number; tasks: ProjectTask[] }>(
        `/projects/${projectId}/tasks/apply-template`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: templateId }),
        },
    );
}

export async function renameProjectFolder(
    projectId: string,
    folderId: string,
    name: string,
): Promise<Folder> {
    if (isDemoMode) return mockApi.renameProjectFolder(projectId, folderId, name);
    return apiRequest<Folder>(
        `/projects/${projectId}/folders/${folderId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        },
    );
}

export async function deleteProjectFolder(
    projectId: string,
    folderId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteProjectFolder(projectId, folderId);
    await apiRequest(`/projects/${projectId}/folders/${folderId}`, {
        method: "DELETE",
    });
}

export async function moveSubfolderToFolder(
    projectId: string,
    folderId: string,
    parentFolderId: string | null,
): Promise<Folder> {
    if (isDemoMode) return mockApi.moveSubfolderToFolder(projectId, folderId, parentFolderId);
    return apiRequest<Folder>(
        `/projects/${projectId}/folders/${folderId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parent_folder_id: parentFolderId }),
        },
    );
}

export async function moveDocumentToFolder(
    projectId: string,
    documentId: string,
    folderId: string | null,
): Promise<Document> {
    if (isDemoMode) return mockApi.moveDocumentToFolder(projectId, documentId, folderId);
    return apiRequest<Document>(
        `/projects/${projectId}/documents/${documentId}/folder`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: folderId }),
        },
    );
}

export async function renameProjectDocument(
    projectId: string,
    documentId: string,
    filename: string,
): Promise<Document> {
    if (isDemoMode) return mockApi.renameProjectDocument(projectId, documentId, filename);
    return apiRequest<Document>(
        `/projects/${projectId}/documents/${documentId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename }),
        },
    );
}

export async function addDocumentToProject(
    projectId: string,
    documentId: string,
): Promise<Document> {
    if (isDemoMode) return mockApi.addDocumentToProject(projectId, documentId);
    return apiRequest<Document>(
        `/projects/${projectId}/documents/${documentId}`,
        { method: "POST" },
    );
}

export interface DocumentVersion {
    id: string;
    version_number: number | null;
    source: string;
    created_at: string;
    filename: string | null;
    file_type?: string | null;
    size_bytes?: number | null;
    page_count?: number | null;
    deleted_at?: string | null;
    deleted_by?: string | null;
}

export async function listDocumentVersions(documentId: string): Promise<{
    current_version_id: string | null;
    versions: DocumentVersion[];
}> {
    if (isDemoMode) return mockApi.listDocumentVersions(documentId);
    return apiRequest(`/single-documents/${documentId}/versions`);
}

export async function uploadDocumentVersion(
    documentId: string,
    file: File,
    filename?: string,
): Promise<DocumentVersion> {
    if (isDemoMode) return mockApi.uploadDocumentVersion(documentId, file, filename);
    const authHeaders = await getAuthHeader();
    const form = new FormData();
    form.append("file", file);
    if (filename) form.append("filename", filename);
    const response = await fetch(
        `${API_BASE}/single-documents/${documentId}/versions`,
        {
            method: "POST",
            headers: { ...authHeaders },
            body: form,
        },
    );
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<DocumentVersion>;
}

export async function replaceDocumentVersionFile(
    documentId: string,
    versionId: string,
    file: File,
    filename?: string,
): Promise<DocumentVersion> {
    if (isDemoMode) return mockApi.replaceDocumentVersionFile(documentId, versionId, file, filename);
    const authHeaders = await getAuthHeader();
    const form = new FormData();
    form.append("file", file);
    if (filename) form.append("filename", filename);
    const response = await fetch(
        `${API_BASE}/single-documents/${documentId}/versions/${versionId}/file`,
        {
            method: "PUT",
            headers: { ...authHeaders },
            body: form,
        },
    );
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<DocumentVersion>;
}

export async function copyDocumentVersionFromDocument(
    documentId: string,
    sourceDocumentId: string,
    filename?: string,
): Promise<DocumentVersion> {
    if (isDemoMode) return mockApi.copyDocumentVersionFromDocument(documentId, sourceDocumentId, filename);
    return apiRequest<DocumentVersion>(
        `/single-documents/${documentId}/versions/from-document`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source_document_id: sourceDocumentId,
                filename,
            }),
        },
    );
}

export async function renameDocumentVersion(
    documentId: string,
    versionId: string,
    filename: string | null,
): Promise<DocumentVersion> {
    if (isDemoMode) return mockApi.renameDocumentVersion(documentId, versionId, filename);
    return apiRequest<DocumentVersion>(
        `/single-documents/${documentId}/versions/${versionId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename }),
        },
    );
}

export async function deleteDocumentVersion(
    documentId: string,
    versionId: string,
): Promise<{
    deleted_version_id: string;
    current_version_id: string | null;
}> {
    if (isDemoMode) return mockApi.deleteDocumentVersion(documentId, versionId);
    return apiRequest(`/single-documents/${documentId}/versions/${versionId}`, {
        method: "DELETE",
    });
}

export async function uploadProjectDocument(
    projectId: string,
    file: File,
): Promise<Document> {
    if (isDemoMode) return mockApi.uploadProjectDocument(projectId, file);
    const authHeaders = await getAuthHeader();
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(
        `${API_BASE}/projects/${projectId}/documents`,
        {
            method: "POST",
            headers: { ...authHeaders },
            body: form,
        },
    );
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<Document>;
}

export async function uploadStandaloneDocument(
    file: File,
): Promise<Document> {
    if (isDemoMode) return mockApi.uploadStandaloneDocument(file);
    const authHeaders = await getAuthHeader();
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_BASE}/single-documents`, {
        method: "POST",
        headers: { ...authHeaders },
        body: form,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<Document>;
}

export async function listStandaloneDocuments(): Promise<Document[]> {
    if (isDemoMode) return mockApi.listStandaloneDocuments();
    return apiRequest<Document[]>("/single-documents");
}

export async function deleteDocument(documentId: string): Promise<void> {
    if (isDemoMode) return mockApi.deleteDocument(documentId);
    await apiRequest(`/single-documents/${documentId}`, { method: "DELETE" });
}

export async function getDocumentUrl(
    documentId: string,
    versionId?: string | null,
): Promise<{ url: string; filename: string; version_id: string | null }> {
    if (isDemoMode) return mockApi.getDocumentUrl(documentId, versionId);
    const qs = versionId ? `?version_id=${encodeURIComponent(versionId)}` : "";
    return apiRequest(`/single-documents/${documentId}/url${qs}`);
}

export async function downloadDocumentsZip(
    documentIds: string[],
): Promise<Blob> {
    if (isDemoMode) return mockApi.downloadDocumentsZip(documentIds);
    const authHeaders = await getAuthHeader();
    const response = await fetch(`${API_BASE}/single-documents/download-zip`, {
        method: "POST",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders,
        },
        body: JSON.stringify({ document_ids: documentIds }),
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `API error: ${response.status}`);
    }
    return response.blob();
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function createChat(payload?: {
    project_id?: string;
}): Promise<{ id: string }> {
    if (isDemoMode) return mockApi.createChat(payload);
    return apiRequest<{ id: string }>("/chat/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
    });
}

export async function listChats(options?: { limit?: number }): Promise<Chat[]> {
    if (isDemoMode) return mockApi.listChats(options);
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    return apiRequest<Chat[]>(`/chat${query ? `?${query}` : ""}`);
}

export async function listProjectChats(projectId: string): Promise<Chat[]> {
    if (isDemoMode) return mockApi.listProjectChats(projectId);
    return apiRequest<Chat[]>(`/projects/${projectId}/chats`);
}

export async function getChat(chatId: string): Promise<ChatDetailOut> {
    if (isDemoMode) return mockApi.getChat(chatId);
    const raw = await apiRequest<ServerChatDetailOut>(`/chat/${chatId}`);
    const messages: Message[] = raw.messages.map((m) => {
        if (m.role === "user") {
            return {
                role: "user",
                content: typeof m.content === "string" ? m.content : "",
                files: m.files ?? undefined,
                workflow: m.workflow ?? undefined,
            };
        }
        const events = Array.isArray(m.content)
            ? (m.content as AssistantEvent[])
            : undefined;
        return {
            role: "assistant",
            content:
                events
                    ?.filter((e) => e.type === "content")
                    .map((e) => (e as { type: "content"; text: string }).text)
                    .join("") ?? "",
            annotations: m.annotations ?? undefined,
            events,
        };
    });
    return { chat: raw.chat, messages };
}

export async function renameChat(chatId: string, title: string): Promise<void> {
    if (isDemoMode) return mockApi.renameChat(chatId, title);
    await apiRequest(`/chat/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
    });
}

export async function deleteChat(chatId: string): Promise<void> {
    if (isDemoMode) return mockApi.deleteChat(chatId);
    await apiRequest(`/chat/${chatId}`, { method: "DELETE" });
}

export async function generateChatTitle(
    chatId: string,
    message: string,
): Promise<{ title: string }> {
    if (isDemoMode) return mockApi.generateChatTitle(chatId, message);
    return apiRequest<{ title: string }>(`/chat/${chatId}/generate-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
}

export type CaseLawOpinion = {
    opinionId: number | null;
    apiUrl?: string | null;
    type: string | null;
    author: string | null;
    url: string | null;
    text?: string | null;
    html?: string | null;
};

export async function getIndiankanoonOpinions(
    clusterId: number,
): Promise<CaseLawOpinion[]> {
    if (isDemoMode) return mockApi.getIndiankanoonOpinions(clusterId);
    const result = await apiRequest<{ opinions: CaseLawOpinion[] }>(
        "/case-law/case-opinions",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clusterId,
            }),
        },
    );
    return result.opinions;
}

export async function streamChat(payload: {
    messages: {
        role: string;
        content: string;
        files?: { filename: string; document_id?: string }[];
        workflow?: { id: string; title: string };
    }[];
    chat_id?: string;
    project_id?: string;
    model?: string;
    signal?: AbortSignal;
}): Promise<Response> {
    if (isDemoMode) return mockApi.streamChat(payload);
    const { signal, ...body } = payload;
    const authHeaders = await getAuthHeader();
    return fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...authHeaders,
        },
        body: JSON.stringify(body),
        signal,
    });
}

type StreamChatMessage = {
    role: string;
    content: string;
    files?: { filename: string; document_id?: string }[];
    workflow?: { id: string; title: string };
};

export async function streamProjectChat(payload: {
    projectId: string;
    messages: StreamChatMessage[];
    chat_id?: string;
    model?: string;
    displayed_doc?: { filename: string; document_id: string };
    attached_documents?: { filename: string; document_id: string }[];
    signal?: AbortSignal;
}): Promise<Response> {
    if (isDemoMode) return mockApi.streamProjectChat(payload);
    const { projectId, signal, ...body } = payload;
    const authHeaders = await getAuthHeader();
    return fetch(`${API_BASE}/projects/${projectId}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...authHeaders,
        },
        body: JSON.stringify(body),
        signal,
    });
}

// ---------------------------------------------------------------------------
// Tabular Review
// ---------------------------------------------------------------------------

export async function listTabularReviews(
    projectId?: string,
): Promise<TabularReview[]> {
    if (isDemoMode) return mockApi.listTabularReviews(projectId);
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return apiRequest<TabularReview[]>(`/tabular-review${qs}`);
}

export async function createTabularReview(payload: {
    title?: string;
    document_ids: string[];
    columns_config: { index: number; name: string; prompt: string }[];
    workflow_id?: string;
    project_id?: string;
}): Promise<TabularReview> {
    if (isDemoMode) return mockApi.createTabularReview(payload);
    return apiRequest<TabularReview>("/tabular-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function getTabularReview(
    reviewId: string,
): Promise<TabularReviewDetailOut> {
    if (isDemoMode) return mockApi.getTabularReview(reviewId);
    return apiRequest<TabularReviewDetailOut>(`/tabular-review/${reviewId}`);
}

export async function updateTabularReview(
    reviewId: string,
    payload: {
        title?: string;
        columns_config?: { index: number; name: string; prompt: string }[];
        document_ids?: string[];
        project_id?: string | null;
        shared_with?: string[];
    },
): Promise<TabularReview> {
    if (isDemoMode) return mockApi.updateTabularReview(reviewId, payload);
    return apiRequest<TabularReview>(`/tabular-review/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function getTabularReviewPeople(
    reviewId: string,
): Promise<ProjectPeople> {
    if (isDemoMode) return mockApi.getTabularReviewPeople(reviewId);
    return apiRequest<ProjectPeople>(`/tabular-review/${reviewId}/people`);
}

export async function generateTabularColumnPrompt(
    title: string,
    options?: { format?: string; documentName?: string; tags?: string[] },
): Promise<{ prompt: string; source: "preset" | "llm" | "fallback" }> {
    if (isDemoMode) return mockApi.generateTabularColumnPrompt(title, options);
    return apiRequest<{
        prompt: string;
        source: "preset" | "llm" | "fallback";
    }>("/tabular-review/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title,
            format: options?.format,
            documentName: options?.documentName,
            tags: options?.tags,
        }),
    });
}

export async function uploadReviewDocument(
    reviewId: string,
    file: File,
    options?: {
        projectId?: string;
        documentIds?: string[];
        columnsConfig?: { index: number; name: string; prompt: string }[];
    },
): Promise<Document> {
    if (isDemoMode) return mockApi.uploadReviewDocument(reviewId, file, options);
    const uploaded = options?.projectId
        ? await uploadProjectDocument(options.projectId, file)
        : await uploadStandaloneDocument(file);

    await updateTabularReview(reviewId, {
        columns_config: options?.columnsConfig,
        document_ids: [...(options?.documentIds ?? []), uploaded.id],
    });

    return uploaded;
}

export async function deleteTabularReview(reviewId: string): Promise<void> {
    if (isDemoMode) return mockApi.deleteTabularReview(reviewId);
    await apiRequest(`/tabular-review/${reviewId}`, { method: "DELETE" });
}

export async function streamTabularGeneration(
    reviewId: string,
): Promise<Response> {
    if (isDemoMode) return mockApi.streamTabularGeneration(reviewId);
    const authHeaders = await getAuthHeader();
    return fetch(`${API_BASE}/tabular-review/${reviewId}/generate`, {
        method: "POST",
        headers: { ...authHeaders },
    });
}

export async function streamTabularChat(
    reviewId: string,
    messages: { role: string; content: string }[],
    chat_id?: string | null,
    signal?: AbortSignal,
    context?: { reviewTitle?: string | null; projectName?: string | null },
): Promise<Response> {
    if (isDemoMode) return mockApi.streamTabularChat(reviewId, messages, chat_id, signal, context);
    const authHeaders = await getAuthHeader();
    return fetch(`${API_BASE}/tabular-review/${reviewId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
            messages,
            chat_id: chat_id ?? undefined,
            review_title: context?.reviewTitle ?? undefined,
            project_name: context?.projectName ?? undefined,
        }),
        signal: signal ?? undefined,
    });
}

export interface TRCitationAnnotation {
    type: "tabular_citation";
    ref: number;
    col_index: number;
    row_index: number;
    col_name: string;
    doc_name: string;
    quote: string;
}

interface RawTRMessage {
    id: string;
    chat_id: string;
    role: "user" | "assistant";
    content: string | AssistantEvent[] | null;
    annotations?: TRCitationAnnotation[] | null;
    created_at: string;
}

export interface TRDisplayMessage {
    role: "user" | "assistant";
    content: string;
    events?: AssistantEvent[];
    annotations?: TRCitationAnnotation[];
}

export interface TRChat {
    id: string;
    title: string | null;
    created_at: string;
    updated_at: string;
}

export function mapTRMessages(raw: RawTRMessage[]): TRDisplayMessage[] {
    return raw.map((m) => {
        if (m.role === "user") {
            return {
                role: "user" as const,
                content: typeof m.content === "string" ? m.content : "",
            };
        }
        const events = Array.isArray(m.content)
            ? (m.content as AssistantEvent[])
            : undefined;
        const content =
            events
                ?.filter((e) => e.type === "content")
                .map((e) => (e as { type: "content"; text: string }).text)
                .join("") ?? "";
        return {
            role: "assistant" as const,
            content,
            events,
            annotations: m.annotations ?? undefined,
        };
    });
}

export async function getTabularChats(reviewId: string): Promise<TRChat[]> {
    if (isDemoMode) return mockApi.getTabularChats(reviewId);
    return apiRequest<TRChat[]>(`/tabular-review/${reviewId}/chats`);
}

export async function getTabularChatMessages(
    reviewId: string,
    chatId: string,
): Promise<RawTRMessage[]> {
    if (isDemoMode) return mockApi.getTabularChatMessages(reviewId, chatId);
    return apiRequest<RawTRMessage[]>(
        `/tabular-review/${reviewId}/chats/${chatId}/messages`,
    );
}

export async function deleteTabularChat(
    reviewId: string,
    chatId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteTabularChat(reviewId, chatId);
    await apiRequest(`/tabular-review/${reviewId}/chats/${chatId}`, {
        method: "DELETE",
    });
}

export async function regenerateTabularCell(
    reviewId: string,
    documentId: string,
    columnIndex: number,
): Promise<{
    summary: string;
    flag: "green" | "grey" | "yellow" | "red";
    reasoning: string;
}> {
    if (isDemoMode) return mockApi.regenerateTabularCell(reviewId, documentId, columnIndex);
    return apiRequest(`/tabular-review/${reviewId}/regenerate-cell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            document_id: documentId,
            column_index: columnIndex,
        }),
    });
}

export async function clearTabularCells(
    reviewId: string,
    documentIds: string[],
): Promise<void> {
    if (isDemoMode) return mockApi.clearTabularCells(reviewId, documentIds);
    await apiRequest(`/tabular-review/${reviewId}/clear-cells`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: documentIds }),
    });
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

type WorkflowType = Workflow["type"];

export async function listWorkflows(
    type: WorkflowType,
): Promise<Workflow[]> {
    if (isDemoMode) return mockApi.listWorkflows(type);
    return apiRequest<Workflow[]>(`/workflows?type=${type}`);
}

export async function getWorkflow(workflowId: string): Promise<Workflow> {
    if (isDemoMode) return mockApi.getWorkflow(workflowId);
    return apiRequest<Workflow>(`/workflows/${workflowId}`);
}

export async function createWorkflow(payload: {
    title: string;
    type: "assistant" | "tabular";
    prompt_md?: string;
    columns_config?: { index: number; name: string; prompt: string }[];
    practice?: string | null;
}): Promise<Workflow> {
    if (isDemoMode) return mockApi.createWorkflow(payload);
    return apiRequest<Workflow>("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function updateWorkflow(
    workflowId: string,
    payload: {
        title?: string;
        prompt_md?: string;
        columns_config?: { index: number; name: string; prompt: string }[];
        practice?: string | null;
    },
): Promise<Workflow> {
    if (isDemoMode) return mockApi.updateWorkflow(workflowId, payload);
    return apiRequest<Workflow>(`/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
    if (isDemoMode) return mockApi.deleteWorkflow(workflowId);
    await apiRequest(`/workflows/${workflowId}`, { method: "DELETE" });
}

export async function listHiddenWorkflows(): Promise<string[]> {
    if (isDemoMode) return mockApi.listHiddenWorkflows();
    return apiRequest<string[]>("/workflows/hidden");
}

export async function hideWorkflow(workflowId: string): Promise<void> {
    if (isDemoMode) return mockApi.hideWorkflow(workflowId);
    await apiRequest("/workflows/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflowId }),
    });
}

export async function unhideWorkflow(workflowId: string): Promise<void> {
    if (isDemoMode) return mockApi.unhideWorkflow(workflowId);
    await apiRequest(`/workflows/hidden/${workflowId}`, { method: "DELETE" });
}

export async function shareWorkflow(
    workflowId: string,
    payload: { emails: string[]; allow_edit: boolean },
): Promise<void> {
    if (isDemoMode) return mockApi.shareWorkflow(workflowId, payload);
    await apiRequest<void>(`/workflows/${workflowId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function listWorkflowShares(workflowId: string): Promise<
    {
        id: string;
        shared_with_email: string;
        allow_edit: boolean;
        created_at: string;
    }[]
> {
    if (isDemoMode) return mockApi.listWorkflowShares(workflowId);
    return apiRequest(`/workflows/${workflowId}/shares`);
}

export async function deleteWorkflowShare(
    workflowId: string,
    shareId: string,
): Promise<void> {
    if (isDemoMode) return mockApi.deleteWorkflowShare(workflowId, shareId);
    await apiRequest(`/workflows/${workflowId}/shares/${shareId}`, {
        method: "DELETE",
    });
}


// ============================================================================
// MOCK CLIENT-SIDE IMPLEMENTATION FOR DEMO MODE
// ============================================================================

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getLocalStorage<T>(key: string, defaultValue: T): T {
    if (typeof window === "undefined") return defaultValue;
    const item = window.localStorage.getItem(key);
    if (!item) {
        window.localStorage.setItem(key, JSON.stringify(defaultValue));
        return defaultValue;
    }
    try {
        return JSON.parse(item);
    } catch {
        return defaultValue;
    }
}

function setLocalStorage<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

const DEFAULT_USER_PROFILE: UserProfile = {
    displayName: "Demo Advocate",
    organisation: "lexOS Legal Labs",
    messageCreditsUsed: 12,
    creditsResetDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    creditsRemaining: 988,
    tier: "Enterprise Partner",
    titleModel: "claude",
    tabularModel: "gemini",
    mfaOnLogin: false,
    legalResearchIn: true,
    apiKeyStatus: {
        claude: true,
        gemini: true,
        openai: false,
        openrouter: false,
        indiankanoon: true,
        sources: {
            claude: "env",
            gemini: "env",
            indiankanoon: "env",
        }
    }
};

const DEFAULT_CLIENTS: Client[] = [
    {
        id: "cli-1",
        user_id: "demo-user-id",
        name: "Acme Corporation Private Limited",
        notes: "Major manufacturing conglomerate based in Mumbai.",
        created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "cli-2",
        user_id: "demo-user-id",
        name: "Acme Power Projects",
        notes: "Infrastructure developer.",
        created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_PROJECTS: Project[] = [
    {
        id: "proj-1",
        user_id: "demo-user-id",
        name: "Kesavananda Bharati Analysis",
        cm_number: "CM-2026-001",
        client_id: "cli-1",
        shared_with: ["partner@lexos.org"],
        matter_type: "Writ Petition (Art. 226/32)",
        court: "Supreme Court of India",
        case_number: "Writ Petition (Civil) No. 135 of 1970",
        jurisdiction: "Constitutional Bench",
        filing_date: "1970-10-31",
        created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "proj-2",
        user_id: "demo-user-id",
        name: "General Corporate Advisory",
        cm_number: "CM-2026-002",
        client_id: "cli-2",
        shared_with: [],
        matter_type: "General Matter",
        court: "NCLT Mumbai Bench",
        case_number: "CP/2026/009",
        jurisdiction: "Company Law",
        filing_date: "2026-01-15",
        created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_PROJECT_DEADLINES: ProjectDeadline[] = [
    {
        id: "dl-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        title: "File Written Submissions in Writ Petition",
        due_date: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        notes: "Need to compile annexures and file before the constitutional bench.",
        status: "pending",
        source: "user",
        source_chat_id: null,
        created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "dl-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        title: "Serve copy to Respondent Caveators",
        due_date: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        notes: "Caveat notice already received on behalf of State of Kerala.",
        status: "pending",
        source: "assistant",
        source_chat_id: null,
        created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_PROJECT_HEARINGS: ProjectHearing[] = [
    {
        id: "hr-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        purpose: "Final Arguments Admission",
        court: "Supreme Court of India - Court 1",
        case_number: "Writ Petition (Civil) No. 135 of 1970",
        hearing_date: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        notes: "Constitutional Bench of 13 judges to assemble.",
        status: "scheduled",
        source: "assistant",
        source_chat_id: null,
        created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "hr-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        purpose: "Interim Relief Arguments",
        court: "High Court of Kerala",
        case_number: "WP(C) No. 441 of 1970",
        hearing_date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        notes: "Interim stay granted on land acquisition proceedings.",
        status: "done",
        source: "user",
        source_chat_id: null,
        created_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_BILLING_SETTINGS: BillingSettings = {
    firm_gstin: "07ABCDE1234F1Z5",
    firm_state: "Delhi",
    default_hourly_rate: 5000,
};

const DEFAULT_TIME_ENTRIES: TimeEntry[] = [
    {
        id: "te-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        entry_date: new Date(Date.now() - 2 * 24 * 3600 * 1000)
            .toISOString()
            .slice(0, 10),
        description: "Reviewed petition record and prepared written submissions",
        minutes: 150,
        rate: 5000,
        amount: 12500,
        billed: false,
        source: "user",
        source_chat_id: null,
        created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "te-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        entry_date: new Date(Date.now() - 1 * 24 * 3600 * 1000)
            .toISOString()
            .slice(0, 10),
        description: "Client conference and strategy note",
        minutes: 60,
        rate: 5000,
        amount: 5000,
        billed: false,
        source: "assistant",
        source_chat_id: null,
        created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
];

const DEFAULT_INVOICES: Invoice[] = [];

const DEFAULT_PROJECT_PARTIES: ProjectParty[] = [
    {
        id: "pty-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        name: "His Holiness Kesavananda Bharati Sripadagalvaru",
        role: "client",
        notes: "Head of the Edneer Mutt, petitioner.",
        source: "user",
        source_chat_id: null,
        created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "pty-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        name: "State of Kerala",
        role: "counterparty",
        notes: "Respondent state contesting mutation/land rights.",
        source: "assistant",
        source_chat_id: null,
        created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "pty-3",
        project_id: "proj-1",
        user_id: "demo-user-id",
        name: "Nani Palkhivala",
        role: "opposing_counsel",
        notes: "Lead counsel for petitioner.",
        source: "user",
        source_chat_id: null,
        created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_PROJECT_MEMORIES: ProjectMemory[] = [
    {
        id: "mem-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        kind: "decision",
        content: "Decided to challenge Article 31B and 29th Constitutional Amendment directly in the petition.",
        source: "user",
        source_chat_id: null,
        created_at: new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "mem-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        kind: "fact",
        content: "Edneer Mutt owns approximately 400 acres of land affected by the Kerala Land Reforms Act.",
        source: "assistant",
        source_chat_id: null,
        created_at: new Date(Date.now() - 22 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_PROJECT_TASKS: ProjectTask[] = [
    {
        id: "tsk-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        title: "Identify the fundamental/legal right infringed and the cause of action",
        notes: "Property right violation under Art 19(1)(f) and freedom to manage religious affairs under Art 26.",
        status: "done",
        position: 0,
        source: "template",
        template_id: "tpl-writ-petition",
        source_chat_id: null,
        created_at: new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "tsk-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        title: "Confirm territorial jurisdiction and the correct High Court bench / Supreme Court",
        notes: "Filed directly in Supreme Court of India under Art 32.",
        status: "done",
        position: 1,
        source: "template",
        template_id: "tpl-writ-petition",
        source_chat_id: null,
        created_at: new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "tsk-3",
        project_id: "proj-1",
        user_id: "demo-user-id",
        title: "Draft the writ petition with grounds and prayer",
        notes: "Need to draft ground of basic structure limitation.",
        status: "pending",
        position: 2,
        source: "template",
        template_id: "tpl-writ-petition",
        source_chat_id: null,
        created_at: new Date(Date.now() - 27 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_MATTER_TEMPLATES: MatterTemplate[] = [
    {
        id: "tpl-ma-diligence",
        name: "M&A Due Diligence",
        description: "Standard buy-side due diligence workflow for an acquisition.",
        task_count: 13,
        tasks: [
            "Run conflict check on target, sellers, and key counterparties",
            "Prepare and send due diligence request list",
            "Set up data room access and document index",
            "Review corporate records and capitalization",
            "Review material contracts and change-of-control clauses",
            "Review financing arrangements and security interests",
            "Review employment and benefit arrangements",
            "Review IP ownership and licenses",
            "Review litigation, disputes, and regulatory matters",
            "Prepare red-flag due diligence report",
            "Draft disclosure schedule comments",
            "Track conditions precedent through closing",
        ]
    },
    {
        id: "tpl-nda-review",
        name: "NDA Review",
        description: "Fast-turnaround review of a non-disclosure agreement.",
        task_count: 8,
        tasks: [
            "Run conflict check on counterparty",
            "Confirm mutual vs. one-way structure matches the deal",
            "Review definition and scope of confidential information",
            "Check term, survival, and return/destruction obligations",
            "Check permitted disclosures and residuals language",
            "Review remedies, governing law, and jurisdiction",
            "Prepare markup and summary of key changes",
            "Circulate for signature and calendar expiry",
        ]
    },
    {
        id: "tpl-litigation",
        name: "Litigation",
        description: "Core workflow for a new contentious matter engagement.",
        task_count: 9,
        tasks: [
            "Run conflict check on all parties and related entities",
            "Issue litigation hold and preserve documents",
            "Collect key documents and build chronology",
            "Assess limitation periods and calendar critical deadlines",
            "Evaluate claims, defences, and preliminary strategy",
            "Prepare initial pleading or response",
            "Plan discovery / disclosure approach",
            "Consider settlement and ADR options",
            "Prepare witness list and evidence plan",
        ]
    },
    {
        id: "tpl-lease-analysis",
        name: "Lease Analysis",
        description: "Commercial lease review and negotiation checklist.",
        task_count: 8,
        tasks: [
            "Run conflict check on landlord and guarantors",
            "Confirm premises, term, and renewal options",
            "Review rent, escalations, and operating expense pass-throughs",
            "Review assignment, subletting, and change-of-control provisions",
            "Check repair, maintenance, and reinstatement obligations",
            "Review insurance and indemnity allocation",
            "Check default, termination, and remedies provisions",
            "Summarize key terms and negotiation points for client",
        ]
    },
    {
        id: "tpl-general",
        name: "General Matter",
        description: "A minimal checklist for any new engagement.",
        task_count: 5,
        tasks: [
            "Run conflict check on client and counterparties",
            "Confirm engagement scope and fee arrangement",
            "Collect and organize matter documents",
            "Record key parties and deadlines",
            "Agree next steps with client",
        ]
    },
    {
        id: "tpl-writ-petition",
        name: "Writ Petition (Art. 226/32)",
        description: "Constitutional writ before a High Court (Art. 226) or the Supreme Court (Art. 32).",
        task_count: 10,
        tasks: [
            "Run conflict check on petitioner and respondents",
            "Identify the fundamental/legal right infringed and the cause of action",
            "Confirm territorial jurisdiction and the correct High Court bench / Supreme Court",
            "Check availability and exhaustion of alternative remedies",
            "Draft the writ petition with grounds and prayer",
            "Prepare the synopsis and list of dates",
            "Annex impugned order and supporting documents (paper book)",
            "Prepare affidavit in support and vakalatnama",
            "Pay court fees and e-file / file before the registry",
            "Calendar the listing date and prepare for admission hearing",
        ]
    },
    {
        id: "tpl-bail-application",
        name: "Bail Application (BNSS/CrPC)",
        description: "Regular or anticipatory bail application in a criminal matter.",
        task_count: 8,
        tasks: [
            "Run conflict check on the accused and complainant",
            "Confirm FIR number, sections charged, and custody status",
            "Determine bail type (regular u/s 480 BNSS / anticipatory u/s 482 BNSS) and forum",
            "Review case diary, remand papers, and grounds for arrest",
            "Draft the bail application with grounds and case law",
            "Prepare affidavit, vakalatnama, and antecedents details",
            "File the application and obtain the listing date",
            "Prepare submissions and proposed bail conditions / sureties",
        ]
    },
    {
        id: "tpl-nclt-ibc",
        name: "Insolvency – NCLT/IBC",
        description: "Corporate insolvency resolution application before the NCLT under the IBC, 2016.",
        task_count: 9,
        tasks: [
            "Run conflict check on the applicant and corporate debtor",
            "Confirm the debt, default, and that it crosses the threshold (₹1 crore)",
            "Determine the applicant type (S.7 financial / S.9 operational creditor)",
            "For S.9 — issue and serve the demand notice in Form 3/4 and await 10-day response",
            "Compile records of default (information utility / bank statements / invoices)",
            "Draft the application in the prescribed Form (Form 1 / Form 5)",
            "Propose an Interim Resolution Professional (with written consent in Form 2)",
            "Pay the prescribed fee and file before the appropriate NCLT bench",
            "Calendar the listing and track admission/defect cure",
        ]
    },
    {
        id: "tpl-cheque-138",
        name: "Cheque Dishonour – S.138 NI Act",
        description: "Complaint for dishonour of cheque under Section 138 of the Negotiable Instruments Act.",
        task_count: 9,
        tasks: [
            "Run conflict check on the complainant and accused/drawer",
            "Confirm the cheque, return memo, and reason for dishonour",
            "Send the statutory demand notice within 30 days of the return memo",
            "Await the 15-day payment period after the notice is served",
            "File the complaint within 30 days of the notice-period expiry (limitation)",
            "Confirm territorial jurisdiction (payee's bank branch location)",
            "Draft the complaint, list of witnesses, and documents",
            "Prepare the complainant's affidavit (S.145 evidence) and vakalatnama",
            "File before the Magistrate and obtain the next date",
        ]
    },
    {
        id: "tpl-arbitration",
        name: "Arbitration (A&C Act 1996)",
        description: "Arbitration proceeding under the Arbitration and Conciliation Act, 1996.",
        task_count: 9,
        tasks: [
            "Run conflict check on the claimant and respondent",
            "Confirm the arbitration agreement / clause and seat & venue",
            "Issue the notice invoking arbitration (S.21)",
            "Agree on or apply for appointment of arbitrator(s) (S.11)",
            "Assess limitation and any interim-relief need (S.9 / S.17)",
            "Draft and file the statement of claim with documents",
            "Track the statement of defence and counterclaim",
            "Plan evidence, witness statements, and hearings",
            "Track timelines for the award (S.29A)",
        ]
    },
    {
        id: "tpl-consumer-complaint",
        name: "Consumer Complaint (CP Act 2019)",
        description: "Complaint before a Consumer Commission under the Consumer Protection Act, 2019.",
        task_count: 8,
        tasks: [
            "Run conflict check on the complainant and opposite party",
            "Confirm 'consumer' status and the deficiency in service / defect in goods",
            "Determine pecuniary & territorial jurisdiction (District/State/National Commission)",
            "Check limitation (within 2 years of cause of action)",
            "Compile invoices, correspondence, and evidence of deficiency",
            "Draft the complaint with reliefs and affidavit",
            "Pay the prescribed fee and file before the Commission",
            "Calendar admission and prepare for the first hearing",
        ]
    },
    {
        id: "tpl-civil-suit",
        name: "Civil Suit (CPC)",
        description: "Civil suit for recovery / declaration / injunction under the CPC.",
        task_count: 9,
        tasks: [
            "Run conflict check on the plaintiff and defendants",
            "Identify the cause of action, reliefs, and valuation for court fees",
            "Confirm jurisdiction (pecuniary, territorial, subject-matter)",
            "Check limitation under the Limitation Act, 1963",
            "Send a S.80 CPC notice where a government/public officer is a defendant",
            "Draft the plaint with cause title, pleadings, and prayer",
            "Prepare the list of documents, verification, and vakalatnama",
            "Pay ad valorem court fees and file before the appropriate court",
            "Track issuance of summons and the next date",
        ]
    },
    {
        id: "tpl-hearing-prep",
        name: "Court Hearing Prep & Trial Briefing",
        description: "Standard checklist for preparing for an upcoming crucial court hearing or trial argument.",
        task_count: 7,
        tasks: [
            "Review cause list and confirm case slot/timing",
            "Prepare compilation of precedents and statutory authorities",
            "Conduct Indian Kanoon search on opposing counsel's citations",
            "Draft brief note of arguments / synopsis of facts",
            "Prepare list of dates and index of pleadings",
            "Brief Senior Counsel on case strategy and arguments",
            "Verify service of index and synopsis to Opposing Counsel"
        ]
    }
];

const DEFAULT_FOLDERS: Folder[] = [
    {
        id: "fold-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        name: "Pleadings",
        parent_folder_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: "fold-2",
        project_id: "proj-1",
        user_id: "demo-user-id",
        name: "Case Law References",
        parent_folder_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }
];

const DEFAULT_DOCUMENTS: Document[] = [
    {
        id: "doc-1",
        project_id: "proj-1",
        folder_id: "fold-2",
        filename: "Kesavananda_Bharati_v_State_of_Kerala.pdf",
        file_type: "pdf",
        storage_path: "mock/doc-1.pdf",
        pdf_storage_path: "mock/doc-1.pdf",
        size_bytes: 409600,
        page_count: 703,
        structure_tree: [
            {
                id: "sec-1",
                title: "1. Introduction & Background",
                level: 1,
                page_number: 1,
                children: []
            },
            {
                id: "sec-2",
                title: "2. The Basic Structure Doctrine",
                level: 1,
                page_number: 120,
                children: []
            }
        ],
        status: "ready",
        created_at: new Date().toISOString(),
        active_version_number: 1,
    },
    {
        id: "doc-2",
        project_id: "proj-1",
        folder_id: "fold-1",
        filename: "Written_Submissions_Final.docx",
        file_type: "docx",
        storage_path: "mock/doc-2.docx",
        pdf_storage_path: null,
        size_bytes: 102400,
        page_count: 24,
        structure_tree: [],
        status: "ready",
        created_at: new Date().toISOString(),
        active_version_number: 1,
    }
];

const DEFAULT_WORKFLOWS: Workflow[] = [
    {
        id: "wf-1",
        user_id: null,
        title: "Supreme Court Judgment Summarizer",
        type: "assistant",
        prompt_md: "You are a Supreme Court of India Law Clerk. Summarize the provided judgment identifying: 1. Ratio Decidendi, 2. Obiter Dicta, 3. Dissenting opinions, and 4. Critical citations.",
        columns_config: null,
        is_system: true,
        created_at: new Date().toISOString(),
        practice: "Constitutional Law",
        is_owner: false,
    },
    {
        id: "wf-2",
        user_id: null,
        title: "Tabular Contract Diligence",
        type: "tabular",
        prompt_md: null,
        columns_config: [
            { index: 0, name: "Governing Law", prompt: "Identify the governing law and jurisdiction specified in the contract.", format: "tag", tags: ["India", "UK", "US", "Singapore"] },
            { index: 1, name: "Limitation of Liability", prompt: "Extract the exact liability cap amount or percentage.", format: "monetary_amount" },
            { index: 2, name: "Termination for Convenience", prompt: "Is there a termination for convenience clause? If yes, what is the notice period?", format: "yes_no" }
        ],
        is_system: true,
        created_at: new Date().toISOString(),
        practice: "Corporate",
        is_owner: false,
    },
    {
        id: "wf-3",
        user_id: null,
        title: "Corporate Compliance Auditor",
        type: "assistant",
        prompt_md: "Act as a corporate compliance auditor. Scan the company records to identify any filing defaults (e.g. AOC-4, MGT-7), pending director board resolution approvals, or charges registered with the MCA.",
        columns_config: null,
        is_system: true,
        created_at: new Date().toISOString(),
        practice: "Corporate Law",
        is_owner: false,
    },
    {
        id: "wf-4",
        user_id: null,
        title: "S.138 NI Act Checklist Auditor",
        type: "tabular",
        prompt_md: null,
        columns_config: [
            { index: 0, name: "Statutory Notice Served Date", prompt: "Identify the date when the statutory demand notice was successfully served on the drawer.", format: "date" },
            { index: 1, name: "Notice Period Expiry", prompt: "Calculate the exact expiry date of the 15-day notice response window.", format: "date" },
            { index: 2, name: "Is Complaint within Limitation?", prompt: "Is the complaint filed within the 30-day limitation window starting from the notice period expiry?", format: "yes_no" },
            { index: 3, name: "Pecuniary Threshold Crosses?", prompt: "Is the cheque amount above 10,000 INR?", format: "yes_no" }
        ],
        is_system: true,
        created_at: new Date().toISOString(),
        practice: "Criminal Law",
        is_owner: false,
    }
];

const DEFAULT_TABULAR_REVIEWS: TabularReview[] = [
    {
        id: "rev-1",
        project_id: "proj-1",
        user_id: "demo-user-id",
        title: "Contract Audit Matrix",
        columns_config: [
            { index: 0, name: "Effective Date", prompt: "Extract the effective date of the contract.", format: "date" },
            { index: 1, name: "Party Names", prompt: "List all signing parties.", format: "text" },
            { index: 2, name: "Indemnification Risk", prompt: "Check if the indemnification is uncapped.", format: "yes_no" }
        ],
        document_ids: ["doc-2"],
        workflow_id: "wf-2",
        is_owner: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        document_count: 1,
    }
];

const DEFAULT_TABULAR_CELLS: TabularCell[] = [
    {
        id: "cell-1",
        review_id: "rev-1",
        document_id: "doc-2",
        column_index: 0,
        content: {
            summary: "January 15, 2026",
            flag: "green",
            reasoning: "The preamble clearly states: 'This Agreement is made and entered into this 15th day of January, 2026...'"
        },
        status: "done",
        created_at: new Date().toISOString(),
    },
    {
        id: "cell-2",
        review_id: "rev-1",
        document_id: "doc-2",
        column_index: 1,
        content: {
            summary: "1. lexOS Legal Labs\n2. Acme Corporation Private Limited",
            flag: "grey",
            reasoning: "Found signing blocks on page 1 and page 24."
        },
        status: "done",
        created_at: new Date().toISOString(),
    },
    {
        id: "cell-3",
        review_id: "rev-1",
        document_id: "doc-2",
        column_index: 2,
        content: {
            summary: "Yes",
            flag: "red",
            reasoning: "Section 14(b) states: 'Neither party shall be subject to any cap on indemnification arising under Section 12 (Intellectual Property Claims).'"
        },
        status: "done",
        created_at: new Date().toISOString(),
    }
];

async function streamChatMock(payload: {
    messages: { role: string; content: string; files?: any[]; workflow?: any }[];
    chat_id?: string;
    project_id?: string;
    model?: string;
}): Promise<Response> {
    const encoder = new TextEncoder();
    let targetChatId = payload.chat_id;
    
    // If it's a new chat, create it
    if (!targetChatId) {
        targetChatId = `chat-${Date.now()}`;
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        const newChat: Chat = {
            id: targetChatId,
            project_id: payload.project_id || null,
            user_id: "demo-user-id",
            title: payload.messages[0]?.content.slice(0, 35) || "Research Chat",
            created_at: new Date().toISOString(),
        };
        chats.push(newChat);
        setLocalStorage("lexos_chats", chats);
    }

    // Save the user's latest message to history
    const latestMsg = payload.messages[payload.messages.length - 1];
    if (latestMsg) {
        const messagesMap = getLocalStorage<Record<string, Message[]>>("lexos_messages", {});
        messagesMap[targetChatId] = payload.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            files: m.files,
            workflow: m.workflow,
        }));
        setLocalStorage("lexos_messages", messagesMap);
    }

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                // Send the chat ID first
                send({ type: "chat_id", chatId: targetChatId });
                await delay(200);

                // Send thinking/reasoning
                send({ type: "reasoning_delta", text: "Analyzing query in context of matters...\n" });
                await delay(500);
                
                // Simulate document reading if a document is attached or exists
                const docs = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
                const projectDocs = docs.filter(d => d.project_id === payload.project_id);
                if (projectDocs.length > 0) {
                    send({ type: "reasoning_delta", text: `Reviewing related files: ${projectDocs.map(d => d.filename).join(", ")}\n` });
                    await delay(500);
                    for (const doc of projectDocs) {
                        send({ type: "doc_read_start", filename: doc.filename });
                        await delay(600);
                        send({ type: "doc_read", filename: doc.filename });
                        await delay(200);
                    }
                }

                // Simulate Indian Kanoon search
                send({ type: "reasoning_delta", text: "Searching Indian Kanoon case law database...\n" });
                await delay(400);
                send({ type: "indiankanoon_search_case_law_start", query: latestMsg?.content || "Kesavananda" });
                await delay(800);
                send({ type: "indiankanoon_search_case_law", query: latestMsg?.content || "Kesavananda", result_count: 5 });
                await delay(200);

                send({ type: "reasoning_block_end" });
                await delay(200);

                // Prepare simulated response text based on the query
                let responseText = "Under Indian constitutional law, the basic structure doctrine restricts Parliament's power to amend critical features of the Constitution. Based on the documents provided: \n\n";
                if (latestMsg?.content?.toLowerCase().includes("contract") || latestMsg?.content?.toLowerCase().includes("agreement")) {
                    responseText = "I have reviewed the matter agreement. Here are the key highlights:\n\n1. **Liability Limit:** The agreement specifies uncapped indemnification for intellectual property disputes, which poses a yellow/red risk flag.\n2. **Governing Law:** The agreement is governed by the laws of India.\n3. **Term:** The agreement remains active unless terminated by either party with a 60-day notice.\n\nLet me know if you would like me to draft a summary or cross-examine specific clauses!";
                } else if (latestMsg?.content?.toLowerCase().includes("summarize") || latestMsg?.content?.toLowerCase().includes("summary")) {
                    responseText = "Here is the summary of the selected document:\n\n* **Title:** Written Submissions Final\n* **Author:** Advocate on Record\n* **Key Ratio:** Basic structure challenge on Article 31B.\n* **Significance:** Affirms the landmark ratio in Kesavananda Bharati.";
                } else {
                    responseText += "1. **Kesavananda Bharati v. State of Kerala (1973):** Established the 'Basic Structure' rule limiting parliamentary amendments.\n2. **Minerva Mills v. Union of India (1980):** Reaffirmed judicial review as a basic structure feature.\n3. **Indira Nehru Gandhi v. Raj Narain (1975):** Declared democracy and free/fair elections as basic features.\n\nYour matter folders contain pleadings and briefs aligning with this precedent. Would you like me to draft a constitutional legal petition?";
                }

                // Stream the response text word-by-word
                const words = responseText.split(" ");
                let currentAccumulated = "";
                for (const word of words) {
                    send({ type: "content_delta", text: word + " " });
                    currentAccumulated += word + " ";
                    await delay(35);
                }

                send({ type: "content_done" });

                // Finally save the assistant message to local storage history
                const messagesMap = getLocalStorage<Record<string, Message[]>>("lexos_messages", {});
                const chatHistory = messagesMap[targetChatId!] || [];
                chatHistory.push({
                    role: "assistant",
                    content: responseText,
                    events: [
                        { type: "content", text: responseText }
                    ],
                });
                messagesMap[targetChatId!] = chatHistory;
                setLocalStorage("lexos_messages", messagesMap);

            } catch (err: any) {
                send({ type: "error", message: err.message });
            } finally {
                send("[DONE]");
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    });
}

async function streamTabularGenerationMock(reviewId: string): Promise<Response> {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                // Find review
                const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
                const review = reviews.find((r) => r.id === reviewId);
                if (!review) throw new Error("Review not found");

                const docIds = review.document_ids || [];
                const cols = review.columns_config || [];
                const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);

                // Run cell by cell
                for (const docId of docIds) {
                    for (const col of cols) {
                        // Simulate generation start
                        send({
                            type: "cell_update",
                            document_id: docId,
                            column_index: col.index,
                            status: "generating",
                            content: null,
                        });
                        await delay(500);

                        // Generate mock answer
                        let summary = "Extracted information";
                        let flag: "green" | "grey" | "yellow" | "red" = "grey";
                        
                        if (col.format === "yes_no") {
                            summary = "Yes";
                            flag = "green";
                        } else if (col.format === "date") {
                            summary = new Date().toLocaleDateString("en-IN");
                        } else if (col.format === "monetary_amount" || col.format === "currency") {
                            summary = "₹5,0,000";
                            flag = "yellow";
                        } else {
                            summary = `Extracted data for ${col.name}`;
                        }

                        const cellContent = {
                            summary,
                            flag,
                            reasoning: `Analysis of ${col.name} in document ${docId} complete. Ratio and authority verified.`,
                        };

                        // Save cell
                        const cellIdx = cells.findIndex((c) => c.review_id === reviewId && c.document_id === docId && c.column_index === col.index);
                        if (cellIdx !== -1) {
                            cells[cellIdx].content = cellContent;
                            cells[cellIdx].status = "done";
                        } else {
                            cells.push({
                                id: `cell-${docId}-${col.index}-${Date.now()}`,
                                review_id: reviewId,
                                document_id: docId,
                                column_index: col.index,
                                content: cellContent,
                                status: "done",
                                created_at: new Date().toISOString(),
                            });
                        }
                        
                        // Send update
                        send({
                            type: "cell_update",
                            document_id: docId,
                            column_index: col.index,
                            status: "done",
                            content: cellContent,
                        });
                        await delay(200);
                    }
                }
                setLocalStorage("lexos_tabular_cells", cells);
            } catch (err: any) {
                console.error("Tabular stream error", err);
            } finally {
                send("[DONE]");
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    });
}

async function streamTabularChatMock(
    reviewId: string,
    messages: { role: string; content: string }[],
    chat_id?: string | null,
    signal?: AbortSignal,
    context?: { reviewTitle?: string | null; projectName?: string | null }
): Promise<Response> {
    const encoder = new TextEncoder();
    let targetChatId = chat_id;

    // Create chat if it's new
    if (!targetChatId) {
        targetChatId = `chat-${Date.now()}`;
        const chats = getLocalStorage<TRChat[]>(`lexos_tr_chats_${reviewId}`, []);
        const newChat: TRChat = {
            id: targetChatId,
            title: messages[0]?.content.slice(0, 30) || "Tabular Chat",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        chats.push(newChat);
        setLocalStorage(`lexos_tr_chats_${reviewId}`, chats);
    }

    // Save history
    const latestMsg = messages[messages.length - 1];
    if (latestMsg) {
        const messagesMap = getLocalStorage<Record<string, RawTRMessage[]>>(`lexos_tr_messages_${reviewId}`, {});
        messagesMap[targetChatId] = messages.map((m) => ({
            id: `tr-msg-${Date.now()}`,
            chat_id: targetChatId!,
            role: m.role as "user" | "assistant",
            content: m.content,
            created_at: new Date().toISOString(),
        }));
        setLocalStorage(`lexos_tr_messages_${reviewId}`, messagesMap);
    }

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                send({ type: "chat_id", chatId: targetChatId });
                await delay(100);
                send({ type: "chat_title", chatId: targetChatId, title: messages[0]?.content.slice(0, 30) || "Tabular Chat" });
                await delay(200);

                send({ type: "reasoning_delta", text: "Analyzing tabular review data and cells..." });
                await delay(500);

                const responseText = `I have analyzed the tabular review for '${context?.reviewTitle || "Review"}'. Here are the key findings based on your query:\n\n* **Compliance:** The Governing Law columns config matches the requirements.\n* **Errors/Warnings:** There is 1 uncapped liability risk detected.\n\nLet me know if you would like me to compile a draft report.`;
                const words = responseText.split(" ");
                for (const word of words) {
                    send({ type: "content_delta", text: word + " " });
                    await delay(35);
                }

                // Save assistant message to history
                const messagesMap = getLocalStorage<Record<string, RawTRMessage[]>>(`lexos_tr_messages_${reviewId}`, {});
                const chatHistory = messagesMap[targetChatId!] || [];
                chatHistory.push({
                    id: `tr-msg-assistant-${Date.now()}`,
                    chat_id: targetChatId!,
                    role: "assistant",
                    content: responseText,
                    created_at: new Date().toISOString(),
                });
                messagesMap[targetChatId!] = chatHistory;
                setLocalStorage(`lexos_tr_messages_${reviewId}`, messagesMap);

            } catch (err: any) {
                console.error("Tabular chat stream error", err);
            } finally {
                send("[DONE]");
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    });
}

const mockApi = {
    streamChat: streamChatMock,

    streamProjectChat: async (payload: {
        projectId: string;
        messages: any[];
        chat_id?: string;
        model?: string;
        displayed_doc?: { filename: string; document_id: string };
        attached_documents?: { filename: string; document_id: string }[];
        signal?: AbortSignal;
    }): Promise<Response> => {
        const { projectId, ...rest } = payload;
        return streamChatMock({ project_id: projectId, ...rest });
    },

    streamTabularGeneration: streamTabularGenerationMock,

    streamTabularChat: streamTabularChatMock,

    listProjects: async (includeArchived = false): Promise<Project[]> => {
        await delay(100);
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);
        const clients = getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);
        const resolved = projects.map((p) => {
            const client = clients.find((c) => c.id === p.client_id);
            return {
                ...p,
                client: client ? { id: client.id, name: client.name } : null,
            };
        });
        if (includeArchived) return resolved;
        return resolved.filter((p) => !p.archived_at);
    },
    
    createProject: async (name: string, cm_number?: string, shared_with?: string[]): Promise<Project> => {
        await delay(100);
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);
        const newProj: Project = {
            id: `proj-${Date.now()}`,
            user_id: "demo-user-id",
            name,
            cm_number: cm_number || null,
            shared_with: shared_with || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        projects.push(newProj);
        setLocalStorage("lexos_projects", projects);
        return newProj;
    },

    getProject: async (projectId: string): Promise<Project> => {
        await delay(100);
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);
        const folders = getLocalStorage<Folder[]>("lexos_folders", DEFAULT_FOLDERS);
        const documents = getLocalStorage<Document[]>("lexos_documents", DEFAULT_DOCUMENTS);
        const clients = getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);

        const project = projects.find((p) => p.id === projectId);
        if (!project) throw new Error("Project not found");

        const projFolders = folders.filter((f) => f.project_id === projectId);
        const projDocs = documents.filter((d) => d.project_id === projectId);
        const client = clients.find((c) => c.id === project.client_id);

        return {
            ...project,
            client: client ? { id: client.id, name: client.name } : null,
            folders: projFolders,
            documents: projDocs,
        };
    },

    updateProject: async (projectId: string, payload: any): Promise<Project> => {
        await delay(100);
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);
        const idx = projects.findIndex((p) => p.id === projectId);
        if (idx === -1) throw new Error("Project not found");

        const updated = {
            ...projects[idx],
            ...payload,
            updated_at: new Date().toISOString(),
        };
        projects[idx] = updated;
        setLocalStorage("lexos_projects", projects);
        return updated;
    },

    deleteProject: async (projectId: string): Promise<void> => {
        await delay(100);
        const projects = getLocalStorage("lexos_projects", DEFAULT_PROJECTS);
        setLocalStorage("lexos_projects", projects.filter((p) => p.id !== projectId));
    },

    getProjectPeople: async (projectId: string): Promise<ProjectPeople> => {
        await delay(100);
        const projects = getLocalStorage("lexos_projects", DEFAULT_PROJECTS);
        const project = projects.find((p) => p.id === projectId);
        return {
            owner: {
                user_id: "demo-user-id",
                email: "demo@lexos.org",
                display_name: "Demo Advocate",
            },
            members: project?.shared_with.map((email) => ({ email, display_name: null })) || [],
        };
    },

    deleteAccount: async (): Promise<void> => {
        await delay(100);
        if (typeof window !== "undefined") {
            window.localStorage.clear();
        }
    },

    deleteAllChats: async (): Promise<void> => {
        await delay(100);
        setLocalStorage("lexos_chats", []);
        setLocalStorage("lexos_messages", {});
    },

    deleteAllProjects: async (): Promise<void> => {
        await delay(100);
        setLocalStorage("lexos_projects", []);
        setLocalStorage("lexos_folders", []);
        setLocalStorage("lexos_documents", []);
    },

    deleteAllTabularReviews: async (): Promise<void> => {
        await delay(100);
        setLocalStorage("lexos_tabular_reviews", []);
        setLocalStorage("lexos_tabular_cells", []);
    },

    exportAccountData: async (): Promise<{ blob: Blob; filename: string | null }> => {
        await delay(200);
        const data = {
            profile: getLocalStorage("lexos_user_profile", DEFAULT_USER_PROFILE),
            projects: getLocalStorage("lexos_projects", DEFAULT_PROJECTS),
            chats: getLocalStorage<Chat[]>("lexos_chats", []),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        return { blob, filename: "lexos-account-export.json" };
    },

    exportChatData: async (): Promise<{ blob: Blob; filename: string | null }> => {
        await delay(200);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        const messages = getLocalStorage<Record<string, Message[]>>("lexos_messages", {});
        const data = chats.map(c => ({
            chat: c,
            messages: messages[c.id] || []
        }));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        return { blob, filename: "lexos-chat-export.json" };
    },

    exportTabularReviewsData: async (): Promise<{ blob: Blob; filename: string | null }> => {
        await delay(200);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
        const data = { reviews, cells };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        return { blob, filename: "lexos-tabular-reviews-export.json" };
    },

    getUserProfile: async (): Promise<UserProfile> => {
        await delay(50);
        return getLocalStorage("lexos_user_profile", DEFAULT_USER_PROFILE);
    },

    updateUserProfile: async (payload: any): Promise<UserProfile> => {
        await delay(50);
        const profile = getLocalStorage("lexos_user_profile", DEFAULT_USER_PROFILE);
        const updated = { ...profile, ...payload };
        setLocalStorage("lexos_user_profile", updated);
        return updated;
    },

    updateUserMfaOnLogin: async (enabled: boolean): Promise<UserProfile> => {
        await delay(50);
        const profile = getLocalStorage("lexos_user_profile", DEFAULT_USER_PROFILE);
        const updated = { ...profile, mfaOnLogin: enabled };
        setLocalStorage("lexos_user_profile", updated);
        return updated;
    },

    getApiKeyStatus: async (): Promise<ApiKeyStatus> => {
        await delay(50);
        const profile = getLocalStorage("lexos_user_profile", DEFAULT_USER_PROFILE);
        return profile.apiKeyStatus;
    },

    saveApiKey: async (provider: ApiKeyProvider, apiKey: string | null): Promise<ApiKeyStatus> => {
        await delay(50);
        const profile = getLocalStorage("lexos_user_profile", DEFAULT_USER_PROFILE);
        profile.apiKeyStatus[provider] = !!apiKey;
        if (profile.apiKeyStatus.sources) {
            profile.apiKeyStatus.sources[provider] = apiKey ? "user" : null;
        }
        setLocalStorage("lexos_user_profile", profile);
        return profile.apiKeyStatus;
    },

    createProjectFolder: async (projectId: string, name: string, parentFolderId?: string | null): Promise<Folder> => {
        await delay(100);
        const folders = getLocalStorage("lexos_folders", DEFAULT_FOLDERS);
        const newFolder: Folder = {
            id: `fold-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            name,
            parent_folder_id: parentFolderId ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        folders.push(newFolder);
        setLocalStorage("lexos_folders", folders);
        return newFolder;
    },

    renameProjectFolder: async (projectId: string, folderId: string, name: string): Promise<Folder> => {
        await delay(100);
        const folders = getLocalStorage("lexos_folders", DEFAULT_FOLDERS);
        const idx = folders.findIndex((f) => f.id === folderId);
        if (idx === -1) throw new Error("Folder not found");
        folders[idx].name = name;
        folders[idx].updated_at = new Date().toISOString();
        setLocalStorage("lexos_folders", folders);
        return folders[idx];
    },

    deleteProjectFolder: async (projectId: string, folderId: string): Promise<void> => {
        await delay(100);
        const folders = getLocalStorage("lexos_folders", DEFAULT_FOLDERS);
        setLocalStorage("lexos_folders", folders.filter((f) => f.id !== folderId && f.parent_folder_id !== folderId));
    },

    moveSubfolderToFolder: async (projectId: string, folderId: string, parentFolderId: string | null): Promise<Folder> => {
        await delay(100);
        const folders = getLocalStorage("lexos_folders", DEFAULT_FOLDERS);
        const idx = folders.findIndex((f) => f.id === folderId);
        if (idx === -1) throw new Error("Folder not found");
        folders[idx].parent_folder_id = parentFolderId;
        folders[idx].updated_at = new Date().toISOString();
        setLocalStorage("lexos_folders", folders);
        return folders[idx];
    },

    moveDocumentToFolder: async (projectId: string, documentId: string, folderId: string | null): Promise<Document> => {
        await delay(100);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const idx = documents.findIndex((d) => d.id === documentId);
        if (idx === -1) throw new Error("Document not found");
        documents[idx].folder_id = folderId;
        documents[idx].updated_at = new Date().toISOString();
        setLocalStorage("lexos_documents", documents);
        return documents[idx];
    },

    renameProjectDocument: async (projectId: string, documentId: string, filename: string): Promise<Document> => {
        await delay(100);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const idx = documents.findIndex((d) => d.id === documentId);
        if (idx === -1) throw new Error("Document not found");
        documents[idx].filename = filename;
        documents[idx].updated_at = new Date().toISOString();
        setLocalStorage("lexos_documents", documents);
        return documents[idx];
    },

    addDocumentToProject: async (projectId: string, documentId: string): Promise<Document> => {
        await delay(100);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const idx = documents.findIndex((d) => d.id === documentId);
        if (idx === -1) throw new Error("Document not found");
        documents[idx].project_id = projectId;
        documents[idx].updated_at = new Date().toISOString();
        setLocalStorage("lexos_documents", documents);
        return documents[idx];
    },

    listDocumentVersions: async (documentId: string): Promise<{ current_version_id: string | null; versions: DocumentVersion[] }> => {
        await delay(50);
        const versions = [
            {
                id: `ver-${documentId}-1`,
                version_number: 1,
                source: "user",
                created_at: new Date().toISOString(),
                filename: "Kesavananda_Bharati_v_State_of_Kerala.pdf",
                size_bytes: 409600,
                page_count: 703,
            }
        ];
        return { current_version_id: `ver-${documentId}-1`, versions };
    },

    uploadDocumentVersion: async (documentId: string, file: File, filename?: string): Promise<DocumentVersion> => {
        await delay(200);
        return {
            id: `ver-${documentId}-${Date.now()}`,
            version_number: 2,
            source: "user",
            created_at: new Date().toISOString(),
            filename: filename || file.name,
            size_bytes: file.size,
            page_count: 10,
        };
    },

    replaceDocumentVersionFile: async (documentId: string, versionId: string, file: File, filename?: string): Promise<DocumentVersion> => {
        await delay(200);
        return {
            id: versionId,
            version_number: 2,
            source: "user",
            created_at: new Date().toISOString(),
            filename: filename || file.name,
            size_bytes: file.size,
            page_count: 12,
        };
    },

    copyDocumentVersionFromDocument: async (documentId: string, sourceDocumentId: string, filename?: string): Promise<DocumentVersion> => {
        await delay(100);
        return {
            id: `ver-${documentId}-${Date.now()}`,
            version_number: 2,
            source: "user",
            created_at: new Date().toISOString(),
            filename: filename || "Copied version",
            size_bytes: 100000,
            page_count: 5,
        };
    },

    renameDocumentVersion: async (documentId: string, versionId: string, filename: string | null): Promise<DocumentVersion> => {
        await delay(100);
        return {
            id: versionId,
            version_number: 1,
            source: "user",
            created_at: new Date().toISOString(),
            filename,
            size_bytes: 100000,
            page_count: 5,
        };
    },

    deleteDocumentVersion: async (documentId: string, versionId: string): Promise<{ deleted_version_id: string; current_version_id: string | null }> => {
        await delay(100);
        return { deleted_version_id: versionId, current_version_id: `ver-${documentId}-1` };
    },

    uploadProjectDocument: async (projectId: string, file: File): Promise<Document> => {
        await delay(500);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const newDoc: Document = {
            id: `doc-${Date.now()}`,
            project_id: projectId,
            folder_id: null,
            filename: file.name,
            file_type: file.name.endsWith(".docx") ? "docx" : "pdf",
            storage_path: `mock/${file.name}`,
            pdf_storage_path: file.name.endsWith(".pdf") ? `mock/${file.name}` : null,
            size_bytes: file.size,
            page_count: 5,
            structure_tree: [],
            status: "ready",
            created_at: new Date().toISOString(),
            active_version_number: 1,
        };
        documents.push(newDoc);
        setLocalStorage("lexos_documents", documents);
        return newDoc;
    },

    uploadStandaloneDocument: async (file: File): Promise<Document> => {
        await delay(500);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const newDoc: Document = {
            id: `doc-${Date.now()}`,
            project_id: null,
            folder_id: null,
            filename: file.name,
            file_type: file.name.endsWith(".docx") ? "docx" : "pdf",
            storage_path: `mock/${file.name}`,
            pdf_storage_path: file.name.endsWith(".pdf") ? `mock/${file.name}` : null,
            size_bytes: file.size,
            page_count: 5,
            structure_tree: [],
            status: "ready",
            created_at: new Date().toISOString(),
            active_version_number: 1,
        };
        documents.push(newDoc);
        setLocalStorage("lexos_documents", documents);
        return newDoc;
    },

    listStandaloneDocuments: async (): Promise<Document[]> => {
        await delay(50);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        return documents.filter((d) => d.project_id === null);
    },

    deleteDocument: async (documentId: string): Promise<void> => {
        await delay(100);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        setLocalStorage("lexos_documents", documents.filter((d) => d.id !== documentId));
    },

    getDocumentUrl: async (documentId: string, versionId?: string | null): Promise<{ url: string; filename: string; version_id: string | null }> => {
        await delay(50);
        const documents = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const doc = documents.find((d) => d.id === documentId);
        return {
            url: doc?.storage_path || `mock/doc.pdf`,
            filename: doc?.filename || "document.pdf",
            version_id: versionId || null,
        };
    },

    downloadDocumentsZip: async (documentIds: string[]): Promise<Blob> => {
        await delay(300);
        return new Blob(["dummy zip content"], { type: "application/zip" });
    },

    createChat: async (payload?: { project_id?: string }): Promise<{ id: string }> => {
        await delay(100);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        const newChat: Chat = {
            id: `chat-${Date.now()}`,
            project_id: payload?.project_id || null,
            user_id: "demo-user-id",
            title: "New Research Chat",
            created_at: new Date().toISOString(),
        };
        chats.push(newChat);
        setLocalStorage("lexos_chats", chats);
        return { id: newChat.id };
    },

    listChats: async (options?: { limit?: number }): Promise<Chat[]> => {
        await delay(50);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        chats.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (options?.limit) return chats.slice(0, options.limit);
        return chats;
    },

    listProjectChats: async (projectId: string): Promise<Chat[]> => {
        await delay(50);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        return chats.filter((c) => c.project_id === projectId);
    },

    getChat: async (chatId: string): Promise<ChatDetailOut> => {
        await delay(50);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        const chat = chats.find((c) => c.id === chatId) || {
            id: chatId,
            project_id: null,
            user_id: "demo-user-id",
            title: "Research Chat",
            created_at: new Date().toISOString(),
        };
        const messagesMap = getLocalStorage<Record<string, Message[]>>("lexos_messages", {});
        const messages = messagesMap[chatId] || [];
        return { chat, messages };
    },

    renameChat: async (chatId: string, title: string): Promise<void> => {
        await delay(50);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        const idx = chats.findIndex((c) => c.id === chatId);
        if (idx !== -1) {
            chats[idx].title = title;
            setLocalStorage("lexos_chats", chats);
        }
    },

    deleteChat: async (chatId: string): Promise<void> => {
        await delay(50);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []);
        setLocalStorage("lexos_chats", chats.filter((c) => c.id !== chatId));
        const messagesMap = getLocalStorage<Record<string, Message[]>>("lexos_messages", {});
        delete messagesMap[chatId];
        setLocalStorage("lexos_messages", messagesMap);
    },

    generateChatTitle: async (chatId: string, message: string): Promise<{ title: string }> => {
        await delay(100);
        const title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
        return { title };
    },

    getIndiankanoonOpinions: async (clusterId: number): Promise<CaseLawOpinion[]> => {
        await delay(150);
        return [
            {
                opinionId: clusterId,
                type: "judgment",
                author: "Justice H. R. Khanna",
                url: `https://indiankanoon.org/doc/${clusterId}/`,
                text: "The basic structure of the Constitution cannot be amended by the Parliament under Article 368.",
            }
        ];
    },

    listTabularReviews: async (projectId?: string): Promise<TabularReview[]> => {
        await delay(50);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        if (projectId) return reviews.filter((r) => r.project_id === projectId);
        return reviews;
    },

    createTabularReview: async (payload: any): Promise<TabularReview> => {
        await delay(100);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        const newReview: TabularReview = {
            id: `rev-${Date.now()}`,
            project_id: payload.project_id || null,
            user_id: "demo-user-id",
            title: payload.title || "Untitled Review",
            columns_config: payload.columns_config || [],
            document_ids: payload.document_ids || [],
            workflow_id: payload.workflow_id || null,
            practice: payload.practice || null,
            shared_with: payload.shared_with || [],
            is_owner: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            document_count: payload.document_ids?.length || 0,
        };
        reviews.push(newReview);
        setLocalStorage("lexos_tabular_reviews", reviews);

        // Prepopulate empty pending cells
        const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
        const docs = payload.document_ids || [];
        const cols = payload.columns_config || [];
        for (const docId of docs) {
            for (const col of cols) {
                cells.push({
                    id: `cell-${docId}-${col.index}`,
                    review_id: newReview.id,
                    document_id: docId,
                    column_index: col.index,
                    content: null,
                    status: "pending",
                    created_at: new Date().toISOString(),
                });
            }
        }
        setLocalStorage("lexos_tabular_cells", cells);

        return newReview;
    },

    getTabularReview: async (reviewId: string): Promise<TabularReviewDetailOut> => {
        await delay(100);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        const review = reviews.find((r) => r.id === reviewId);
        if (!review) throw new Error("Tabular review not found");

        const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
        const reviewCells = cells.filter((c) => c.review_id === reviewId);

        const allDocs = getLocalStorage("lexos_documents", DEFAULT_DOCUMENTS);
        const docIds = review.document_ids || [];
        const reviewDocs = allDocs.filter((d) => docIds.includes(d.id));

        return {
            review,
            cells: reviewCells,
            documents: reviewDocs,
        };
    },

    updateTabularReview: async (reviewId: string, payload: any): Promise<TabularReview> => {
        await delay(100);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        const idx = reviews.findIndex((r) => r.id === reviewId);
        if (idx === -1) throw new Error("Tabular review not found");

        const updated = {
            ...reviews[idx],
            ...payload,
            updated_at: new Date().toISOString(),
        };
        reviews[idx] = updated;
        setLocalStorage("lexos_tabular_reviews", reviews);

        // Make sure we generate cells if documents list expanded
        if (payload.document_ids) {
            const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
            const cols = updated.columns_config || [];
            for (const docId of payload.document_ids) {
                for (const col of cols) {
                    const exists = cells.some((c) => c.review_id === reviewId && c.document_id === docId && c.column_index === col.index);
                    if (!exists) {
                        cells.push({
                            id: `cell-${docId}-${col.index}-${Date.now()}`,
                            review_id: reviewId,
                            document_id: docId,
                            column_index: col.index,
                            content: null,
                            status: "pending",
                            created_at: new Date().toISOString(),
                        });
                    }
                }
            }
            // Filter out cells of removed documents
            const filteredCells = cells.filter((c) => c.review_id !== reviewId || payload.document_ids.includes(c.document_id));
            setLocalStorage("lexos_tabular_cells", filteredCells);
        }

        return updated;
    },

    getTabularReviewPeople: async (reviewId: string): Promise<ProjectPeople> => {
        await delay(100);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        const review = reviews.find((r) => r.id === reviewId);
        return {
            owner: {
                user_id: "demo-user-id",
                email: "demo@lexos.org",
                display_name: "Demo Advocate",
            },
            members: review?.shared_with?.map((email) => ({ email, display_name: null })) || [],
        };
    },

    generateTabularColumnPrompt: async (title: string, options?: any): Promise<{ prompt: string; source: "preset" | "llm" | "fallback" }> => {
        await delay(100);
        return {
            prompt: `Extract details relating to '${title}' from the documents and format appropriately.`,
            source: "preset",
        };
    },

    uploadReviewDocument: async (reviewId: string, file: File, options?: any): Promise<Document> => {
        const doc = options?.projectId
            ? await mockApi.uploadProjectDocument(options.projectId, file)
            : await mockApi.uploadStandaloneDocument(file);

        const docIds = [...(options?.documentIds || []), doc.id];
        await mockApi.updateTabularReview(reviewId, {
            columns_config: options?.columnsConfig,
            document_ids: docIds,
        });
        return doc;
    },

    deleteTabularReview: async (reviewId: string): Promise<void> => {
        await delay(100);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        setLocalStorage("lexos_tabular_reviews", reviews.filter((r) => r.id !== reviewId));
        const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
        setLocalStorage("lexos_tabular_cells", cells.filter((c) => c.review_id !== reviewId));
    },

    regenerateTabularCell: async (reviewId: string, documentId: string, columnIndex: number): Promise<{ summary: string; flag: "green" | "grey" | "yellow" | "red"; reasoning: string }> => {
        await delay(1000);
        const reviews = getLocalStorage("lexos_tabular_reviews", DEFAULT_TABULAR_REVIEWS);
        const review = reviews.find((r) => r.id === reviewId);
        const col = review?.columns_config?.find((c) => c.index === columnIndex);
        
        let summary = "Extracted information";
        let flag: "green" | "grey" | "yellow" | "red" = "grey";
        
        if (col) {
            if (col.format === "yes_no") {
                summary = "Yes";
                flag = "green";
            } else if (col.format === "date") {
                summary = new Date().toLocaleDateString("en-IN");
            } else if (col.format === "monetary_amount" || col.format === "currency") {
                summary = "₹5,00,000";
                flag = "yellow";
            } else {
                summary = `Mocked review for: ${col.name}`;
            }
        }

        const result = {
            summary,
            flag,
            reasoning: `This is a simulated analysis under Demo Mode for column: '${col?.name || "Column"}' and file ID: '${documentId}'.`,
        };

        const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
        const idx = cells.findIndex((c) => c.review_id === reviewId && c.document_id === documentId && c.column_index === columnIndex);
        if (idx !== -1) {
            cells[idx].content = result;
            cells[idx].status = "done";
            setLocalStorage("lexos_tabular_cells", cells);
        }
        return result;
    },

    clearTabularCells: async (reviewId: string, documentIds: string[]): Promise<void> => {
        await delay(50);
        const cells = getLocalStorage("lexos_tabular_cells", DEFAULT_TABULAR_CELLS);
        const updated = cells.map((c) => {
            if (c.review_id === reviewId && documentIds.includes(c.document_id)) {
                return { ...c, content: null, status: "pending" as const };
            }
            return c;
        });
        setLocalStorage("lexos_tabular_cells", updated);
    },

    listWorkflows: async (type: "assistant" | "tabular"): Promise<Workflow[]> => {
        await delay(50);
        const workflows = getLocalStorage("lexos_workflows", DEFAULT_WORKFLOWS);
        const hidden = getLocalStorage<string[]>("lexos_hidden_workflows", []);
        return workflows.filter((w) => w.type === type && !hidden.includes(w.id));
    },

    getWorkflow: async (workflowId: string): Promise<Workflow> => {
        await delay(50);
        const workflows = getLocalStorage("lexos_workflows", DEFAULT_WORKFLOWS);
        const wf = workflows.find((w) => w.id === workflowId);
        if (!wf) throw new Error("Workflow not found");
        return wf;
    },

    createWorkflow: async (payload: any): Promise<Workflow> => {
        await delay(100);
        const workflows = getLocalStorage("lexos_workflows", DEFAULT_WORKFLOWS);
        const newWorkflow: Workflow = {
            id: `wf-${Date.now()}`,
            user_id: "demo-user-id",
            title: payload.title,
            type: payload.type,
            prompt_md: payload.prompt_md || null,
            columns_config: payload.columns_config || null,
            is_system: false,
            created_at: new Date().toISOString(),
            practice: payload.practice || null,
            allow_edit: true,
            is_owner: true,
        };
        workflows.push(newWorkflow);
        setLocalStorage("lexos_workflows", workflows);
        return newWorkflow;
    },

    updateWorkflow: async (workflowId: string, payload: any): Promise<Workflow> => {
        await delay(100);
        const workflows = getLocalStorage("lexos_workflows", DEFAULT_WORKFLOWS);
        const idx = workflows.findIndex((w) => w.id === workflowId);
        if (idx === -1) throw new Error("Workflow not found");
        const updated = {
            ...workflows[idx],
            ...payload,
        };
        workflows[idx] = updated;
        setLocalStorage("lexos_workflows", workflows);
        return updated;
    },

    deleteWorkflow: async (workflowId: string): Promise<void> => {
        await delay(100);
        const workflows = getLocalStorage("lexos_workflows", DEFAULT_WORKFLOWS);
        setLocalStorage("lexos_workflows", workflows.filter((w) => w.id !== workflowId));
    },

    listHiddenWorkflows: async (): Promise<string[]> => {
        await delay(50);
        return getLocalStorage("lexos_hidden_workflows", []);
    },

    hideWorkflow: async (workflowId: string): Promise<void> => {
        await delay(50);
        const hidden = getLocalStorage<string[]>("lexos_hidden_workflows", []);
        if (!hidden.includes(workflowId)) {
            hidden.push(workflowId);
            setLocalStorage("lexos_hidden_workflows", hidden);
        }
    },

    unhideWorkflow: async (workflowId: string): Promise<void> => {
        await delay(50);
        const hidden = getLocalStorage<string[]>("lexos_hidden_workflows", []);
        setLocalStorage("lexos_hidden_workflows", hidden.filter((id) => id !== workflowId));
    },

    shareWorkflow: async (workflowId: string, payload: any): Promise<void> => {
        await delay(100);
    },

    listWorkflowShares: async (workflowId: string): Promise<any[]> => {
        await delay(50);
        return [];
    },

    deleteWorkflowShare: async (workflowId: string, shareId: string): Promise<void> => {
        await delay(50);
    },

    getTabularChats: async (reviewId: string): Promise<TRChat[]> => {
        await delay(50);
        const chats = getLocalStorage<TRChat[]>(`lexos_tr_chats_${reviewId}`, []);
        return chats;
    },

    getTabularChatMessages: async (reviewId: string, chatId: string): Promise<RawTRMessage[]> => {
        await delay(50);
        const messages = getLocalStorage<Record<string, RawTRMessage[]>>(`lexos_tr_messages_${reviewId}`, {});
        return messages[chatId] || [];
    },

    deleteTabularChat: async (reviewId: string, chatId: string): Promise<void> => {
        await delay(50);
        const chats = getLocalStorage<TRChat[]>(`lexos_tr_chats_${reviewId}`, []);
        setLocalStorage(`lexos_tr_chats_${reviewId}`, chats.filter((c) => c.id !== chatId));
        const messages = getLocalStorage<Record<string, RawTRMessage[]>>(`lexos_tr_messages_${reviewId}`, {});
        delete messages[chatId];
        setLocalStorage(`lexos_tr_messages_${reviewId}`, messages);
    },

    cloneProject: async (projectId: string, name?: string): Promise<Project> => {
        await delay(300);
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);
        const sourceProj = projects.find((p) => p.id === projectId);
        if (!sourceProj) throw new Error("Source project not found");
        
        const newProjId = `proj-${Date.now()}`;
        const newProj: Project = {
            ...sourceProj,
            id: newProjId,
            name: name || `${sourceProj.name} (Copy)`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        projects.push(newProj);
        setLocalStorage("lexos_projects", projects);
        
        const folders = getLocalStorage<Folder[]>("lexos_folders", DEFAULT_FOLDERS);
        const sourceFolders = folders.filter((f) => f.project_id === projectId);
        const folderIdMap = new Map<string, string>();
        
        sourceFolders.forEach((f) => {
            const newFolderId = `fold-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            folderIdMap.set(f.id, newFolderId);
            folders.push({
                ...f,
                id: newFolderId,
                project_id: newProjId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        });
        
        folders.forEach((f) => {
            if (f.project_id === newProjId && f.parent_folder_id && folderIdMap.has(f.parent_folder_id)) {
                f.parent_folder_id = folderIdMap.get(f.parent_folder_id)!;
            }
        });
        setLocalStorage("lexos_folders", folders);
        
        const documents = getLocalStorage<Document[]>("lexos_documents", DEFAULT_DOCUMENTS);
        const sourceDocs = documents.filter((d) => d.project_id === projectId);
        sourceDocs.forEach((d) => {
            documents.push({
                ...d,
                id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                project_id: newProjId,
                folder_id: d.folder_id ? (folderIdMap.get(d.folder_id) || null) : null,
                created_at: new Date().toISOString(),
            });
        });
        setLocalStorage("lexos_documents", documents);
        
        return newProj;
    },

    setDocumentPrecedent: async (projectId: string, documentId: string, isPrecedent: boolean): Promise<{ id: string; is_precedent: boolean }> => {
        await delay(50);
        const documents = getLocalStorage<Document[]>("lexos_documents", DEFAULT_DOCUMENTS);
        const doc = documents.find((d) => d.id === documentId);
        if (doc) {
            doc.is_precedent = isPrecedent;
            setLocalStorage("lexos_documents", documents);
        }
        return { id: documentId, is_precedent: isPrecedent };
    },

    listClients: async (): Promise<Client[]> => {
        await delay(50);
        return getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);
    },
    
    createClient: async (body: { name: string; notes?: string }): Promise<Client> => {
        await delay(100);
        const clients = getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);
        const newClient: Client = {
            id: `cli-${Date.now()}`,
            user_id: "demo-user-id",
            name: body.name,
            notes: body.notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        clients.push(newClient);
        setLocalStorage("lexos_clients", clients);
        return newClient;
    },
    
    updateClient: async (clientId: string, body: { name?: string; notes?: string | null }): Promise<Client> => {
        await delay(100);
        const clients = getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);
        const idx = clients.findIndex((c) => c.id === clientId);
        if (idx === -1) throw new Error("Client not found");
        
        const updated = {
            ...clients[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        clients[idx] = updated;
        setLocalStorage("lexos_clients", clients);
        return updated;
    },
    
    deleteClient: async (clientId: string): Promise<void> => {
        await delay(100);
        const clients = getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);
        setLocalStorage("lexos_clients", clients.filter((c) => c.id !== clientId));
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);
        projects.forEach((p) => {
            if (p.client_id === clientId) p.client_id = null;
        });
        setLocalStorage("lexos_projects", projects);
    },

    listProjectMemories: async (projectId: string): Promise<ProjectMemory[]> => {
        await delay(50);
        const memories = getLocalStorage<ProjectMemory[]>("lexos_project_memories", DEFAULT_PROJECT_MEMORIES);
        return memories.filter((m) => m.project_id === projectId);
    },
    
    createProjectMemory: async (projectId: string, body: { kind: ProjectMemory["kind"]; content: string }): Promise<ProjectMemory> => {
        await delay(100);
        const memories = getLocalStorage<ProjectMemory[]>("lexos_project_memories", DEFAULT_PROJECT_MEMORIES);
        const newMemory: ProjectMemory = {
            id: `mem-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            kind: body.kind,
            content: body.content,
            source: "user",
            source_chat_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        memories.push(newMemory);
        setLocalStorage("lexos_project_memories", memories);
        return newMemory;
    },
    
    updateProjectMemory: async (projectId: string, memoryId: string, body: { kind?: ProjectMemory["kind"]; content?: string }): Promise<ProjectMemory> => {
        await delay(100);
        const memories = getLocalStorage<ProjectMemory[]>("lexos_project_memories", DEFAULT_PROJECT_MEMORIES);
        const idx = memories.findIndex((m) => m.id === memoryId);
        if (idx === -1) throw new Error("Memory not found");
        
        const updated = {
            ...memories[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        memories[idx] = updated;
        setLocalStorage("lexos_project_memories", memories);
        return updated;
    },
    
    deleteProjectMemory: async (projectId: string, memoryId: string): Promise<void> => {
        await delay(100);
        const memories = getLocalStorage<ProjectMemory[]>("lexos_project_memories", DEFAULT_PROJECT_MEMORIES);
        setLocalStorage("lexos_project_memories", memories.filter((m) => m.id !== memoryId));
    },

    listProjectDeadlines: async (projectId: string): Promise<ProjectDeadline[]> => {
        await delay(50);
        const deadlines = getLocalStorage<ProjectDeadline[]>("lexos_project_deadlines", DEFAULT_PROJECT_DEADLINES);
        return deadlines.filter((d) => d.project_id === projectId);
    },
    
    createProjectDeadline: async (projectId: string, body: { title: string; due_date: string; notes?: string }): Promise<ProjectDeadline> => {
        await delay(100);
        const deadlines = getLocalStorage<ProjectDeadline[]>("lexos_project_deadlines", DEFAULT_PROJECT_DEADLINES);
        const newDeadline: ProjectDeadline = {
            id: `dl-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            title: body.title,
            due_date: body.due_date,
            notes: body.notes || null,
            status: "pending",
            source: "user",
            source_chat_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        deadlines.push(newDeadline);
        setLocalStorage("lexos_project_deadlines", deadlines);
        return newDeadline;
    },
    
    updateProjectDeadline: async (projectId: string, deadlineId: string, body: { title?: string; due_date?: string; notes?: string | null; status?: ProjectDeadline["status"] }): Promise<ProjectDeadline> => {
        await delay(100);
        const deadlines = getLocalStorage<ProjectDeadline[]>("lexos_project_deadlines", DEFAULT_PROJECT_DEADLINES);
        const idx = deadlines.findIndex((d) => d.id === deadlineId);
        if (idx === -1) throw new Error("Deadline not found");
        
        const updated = {
            ...deadlines[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        deadlines[idx] = updated;
        setLocalStorage("lexos_project_deadlines", deadlines);
        return updated;
    },
    
    deleteProjectDeadline: async (projectId: string, deadlineId: string): Promise<void> => {
        await delay(100);
        const deadlines = getLocalStorage<ProjectDeadline[]>("lexos_project_deadlines", DEFAULT_PROJECT_DEADLINES);
        setLocalStorage("lexos_project_deadlines", deadlines.filter((d) => d.id !== deadlineId));
    },

    listProjectHearings: async (projectId: string): Promise<ProjectHearing[]> => {
        await delay(50);
        const hearings = getLocalStorage<ProjectHearing[]>("lexos_project_hearings", DEFAULT_PROJECT_HEARINGS);
        return hearings.filter((h) => h.project_id === projectId);
    },
    
    createProjectHearing: async (projectId: string, body: { purpose: string; hearing_date: string; court?: string; case_number?: string; notes?: string }): Promise<ProjectHearing> => {
        await delay(100);
        const hearings = getLocalStorage<ProjectHearing[]>("lexos_project_hearings", DEFAULT_PROJECT_HEARINGS);
        const newHearing: ProjectHearing = {
            id: `hr-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            purpose: body.purpose,
            court: body.court || null,
            case_number: body.case_number || null,
            hearing_date: body.hearing_date,
            notes: body.notes || null,
            status: "scheduled",
            source: "user",
            source_chat_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        hearings.push(newHearing);
        setLocalStorage("lexos_project_hearings", hearings);
        return newHearing;
    },
    
    updateProjectHearing: async (projectId: string, hearingId: string, body: { purpose?: string; hearing_date?: string; court?: string | null; case_number?: string | null; notes?: string | null; status?: ProjectHearing["status"] }): Promise<ProjectHearing> => {
        await delay(100);
        const hearings = getLocalStorage<ProjectHearing[]>("lexos_project_hearings", DEFAULT_PROJECT_HEARINGS);
        const idx = hearings.findIndex((h) => h.id === hearingId);
        if (idx === -1) throw new Error("Hearing not found");
        
        const updated = {
            ...hearings[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        hearings[idx] = updated;
        setLocalStorage("lexos_project_hearings", hearings);
        return updated;
    },
    
    deleteProjectHearing: async (projectId: string, hearingId: string): Promise<void> => {
        await delay(100);
        const hearings = getLocalStorage<ProjectHearing[]>("lexos_project_hearings", DEFAULT_PROJECT_HEARINGS);
        setLocalStorage("lexos_project_hearings", hearings.filter((h) => h.id !== hearingId));
    },

    listProjectParties: async (projectId: string): Promise<ProjectParty[]> => {
        await delay(50);
        const parties = getLocalStorage<ProjectParty[]>("lexos_project_parties", DEFAULT_PROJECT_PARTIES);
        return parties.filter((p) => p.project_id === projectId);
    },
    
    createProjectParty: async (projectId: string, body: { name: string; role: ProjectParty["role"]; notes?: string }): Promise<ProjectParty> => {
        await delay(100);
        const parties = getLocalStorage<ProjectParty[]>("lexos_project_parties", DEFAULT_PROJECT_PARTIES);
        const newParty: ProjectParty = {
            id: `pty-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            name: body.name,
            role: body.role,
            notes: body.notes || null,
            source: "user",
            source_chat_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        parties.push(newParty);
        setLocalStorage("lexos_project_parties", parties);
        return newParty;
    },
    
    updateProjectParty: async (projectId: string, partyId: string, body: { name?: string; role?: ProjectParty["role"]; notes?: string | null }): Promise<ProjectParty> => {
        await delay(100);
        const parties = getLocalStorage<ProjectParty[]>("lexos_project_parties", DEFAULT_PROJECT_PARTIES);
        const idx = parties.findIndex((p) => p.id === partyId);
        if (idx === -1) throw new Error("Party not found");
        
        const updated = {
            ...parties[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        parties[idx] = updated;
        setLocalStorage("lexos_project_parties", parties);
        return updated;
    },
    
    deleteProjectParty: async (projectId: string, partyId: string): Promise<void> => {
        await delay(100);
        const parties = getLocalStorage<ProjectParty[]>("lexos_project_parties", DEFAULT_PROJECT_PARTIES);
        setLocalStorage("lexos_project_parties", parties.filter((p) => p.id !== partyId));
    },

    runConflictCheck: async (body: { names?: string[]; project_id?: string }): Promise<ConflictCheckResponse> => {
        await delay(300);
        const namesToCheck = body.names || [];
        const parties = getLocalStorage<ProjectParty[]>("lexos_project_parties", DEFAULT_PROJECT_PARTIES);
        const clients = getLocalStorage<Client[]>("lexos_clients", DEFAULT_CLIENTS);
        const projects = getLocalStorage<Project[]>("lexos_projects", DEFAULT_PROJECTS);

        const queries = namesToCheck.map((name) => {
            const matches: ConflictMatch[] = [];

            clients.forEach((client) => {
                if (client.name.toLowerCase().includes(name.toLowerCase())) {
                    const match_strength = client.name.toLowerCase() === name.toLowerCase() ? "exact" as const : "strong" as const;
                    matches.push({
                        matched_name: client.name,
                        match_kind: "client",
                        role: "client",
                        match_strength,
                        severity: "potential_conflict",
                        project: null,
                        client: { id: client.id, name: client.name },
                    });
                }
            });

            parties.forEach((party) => {
                if (party.name.toLowerCase().includes(name.toLowerCase())) {
                    const match_strength = party.name.toLowerCase() === name.toLowerCase() ? "exact" as const : "strong" as const;
                    const project = projects.find((p) => p.id === party.project_id) || null;
                    matches.push({
                        matched_name: party.name,
                        match_kind: "party",
                        role: party.role,
                        match_strength,
                        severity: party.role === "counterparty" ? "potential_conflict" as const : "related_match" as const,
                        project: project ? { id: project.id, name: project.name } : null,
                        client: null,
                    });
                }
            });

            return { name, matches };
        });

        return {
            queries,
            checked_at: new Date().toISOString(),
        };
    },

    getProjectTimeline: async (projectId: string, opts?: { before?: string; limit?: number }): Promise<TimelineResponse> => {
        await delay(100);
        
        const documents = getLocalStorage<Document[]>("lexos_documents", DEFAULT_DOCUMENTS).filter(d => d.project_id === projectId);
        const chats = getLocalStorage<Chat[]>("lexos_chats", []).filter(c => c.project_id === projectId);
        const deadlines = getLocalStorage<ProjectDeadline[]>("lexos_project_deadlines", DEFAULT_PROJECT_DEADLINES).filter(d => d.project_id === projectId);
        const parties = getLocalStorage<ProjectParty[]>("lexos_project_parties", DEFAULT_PROJECT_PARTIES).filter(p => p.project_id === projectId);
        const memories = getLocalStorage<ProjectMemory[]>("lexos_project_memories", DEFAULT_PROJECT_MEMORIES).filter(m => m.project_id === projectId);
        
        const events: TimelineEvent[] = [];
        
        documents.forEach((doc) => {
            events.push({
                id: `evt-doc-${doc.id}`,
                type: "document_created",
                at: doc.created_at || new Date().toISOString(),
                title: "Document Added",
                detail: `${doc.filename} added to files`,
                refs: { document_id: doc.id }
            });
        });
        
        chats.forEach((chat) => {
            events.push({
                id: `evt-chat-${chat.id}`,
                type: "chat_created",
                at: chat.created_at,
                title: "Assistant Chat Started",
                detail: chat.title || "Untitled Research Chat",
                refs: { chat_id: chat.id }
            });
        });
        
        deadlines.forEach((dl) => {
            events.push({
                id: `evt-dl-${dl.id}`,
                type: "deadline_created",
                at: dl.created_at,
                title: "Deadline Calendar Entry",
                detail: `${dl.title} (due ${dl.due_date})`,
            });
        });
        
        parties.forEach((p) => {
            events.push({
                id: `evt-pty-${p.id}`,
                type: "party_added",
                at: p.created_at,
                title: "Matter Party Added",
                detail: `${p.name} added as ${p.role.replace(/_/g, " ")}`,
            });
        });
        
        memories.forEach((m) => {
            events.push({
                id: `evt-mem-${m.id}`,
                type: "memory_saved",
                at: m.created_at,
                title: `Matter ${m.kind.charAt(0).toUpperCase() + m.kind.slice(1)} Logged`,
                detail: m.content.length > 50 ? m.content.slice(0, 47) + "..." : m.content,
            });
        });
        
        events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        
        let filteredEvents = events;
        if (opts?.before) {
            filteredEvents = events.filter(e => new Date(e.at).getTime() < new Date(opts.before!).getTime());
        }
        
        const limit = opts?.limit || 10;
        const pageEvents = filteredEvents.slice(0, limit);
        const nextBefore = filteredEvents.length > limit ? pageEvents[pageEvents.length - 1].at : null;
        
        return {
            events: pageEvents,
            next_before: nextBefore,
        };
    },

    listProjectTasks: async (projectId: string): Promise<ProjectTask[]> => {
        await delay(50);
        const tasks = getLocalStorage<ProjectTask[]>("lexos_project_tasks", DEFAULT_PROJECT_TASKS);
        return tasks.filter((t) => t.project_id === projectId).sort((a, b) => a.position - b.position);
    },
    
    createProjectTask: async (projectId: string, body: { title: string; notes?: string }): Promise<ProjectTask> => {
        await delay(100);
        const tasks = getLocalStorage<ProjectTask[]>("lexos_project_tasks", DEFAULT_PROJECT_TASKS);
        
        const projectTasks = tasks.filter((t) => t.project_id === projectId);
        let maxPos = -1;
        projectTasks.forEach((t) => {
            if (t.position > maxPos) maxPos = t.position;
        });
        
        const newTask: ProjectTask = {
            id: `tsk-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            title: body.title,
            notes: body.notes || null,
            status: "pending",
            position: maxPos + 1,
            source: "user",
            template_id: null,
            source_chat_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        tasks.push(newTask);
        setLocalStorage("lexos_project_tasks", tasks);
        return newTask;
    },
    
    updateProjectTask: async (projectId: string, taskId: string, body: { title?: string; notes?: string | null; status?: ProjectTask["status"]; position?: number }): Promise<ProjectTask> => {
        await delay(100);
        const tasks = getLocalStorage<ProjectTask[]>("lexos_project_tasks", DEFAULT_PROJECT_TASKS);
        const idx = tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) throw new Error("Task not found");
        
        const updated = {
            ...tasks[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        tasks[idx] = updated;
        setLocalStorage("lexos_project_tasks", tasks);
        return updated;
    },
    
    deleteProjectTask: async (projectId: string, taskId: string): Promise<void> => {
        await delay(100);
        const tasks = getLocalStorage<ProjectTask[]>("lexos_project_tasks", DEFAULT_PROJECT_TASKS);
        setLocalStorage("lexos_project_tasks", tasks.filter((t) => t.id !== taskId));
    },

    listMatterTemplates: async (): Promise<MatterTemplate[]> => {
        await delay(50);
        return getLocalStorage<MatterTemplate[]>("lexos_matter_templates", DEFAULT_MATTER_TEMPLATES);
    },
    
    applyMatterTemplate: async (projectId: string, templateId: string): Promise<{ added: number; tasks: ProjectTask[] }> => {
        await delay(200);
        const templates = getLocalStorage<MatterTemplate[]>("lexos_matter_templates", DEFAULT_MATTER_TEMPLATES);
        const template = templates.find((t) => t.id === templateId);
        if (!template) throw new Error("Template not found");
        
        const tasks = getLocalStorage<ProjectTask[]>("lexos_project_tasks", DEFAULT_PROJECT_TASKS);
        
        const projectTasks = tasks.filter((t) => t.project_id === projectId);
        let maxPos = -1;
        projectTasks.forEach((t) => {
            if (t.position > maxPos) maxPos = t.position;
        });
        
        const addedTasks: ProjectTask[] = [];
        template.tasks.forEach((taskTitle, idx) => {
            const newTask: ProjectTask = {
                id: `tsk-${templateId}-${idx}-${Date.now()}`,
                project_id: projectId,
                user_id: "demo-user-id",
                title: taskTitle,
                notes: null,
                status: "pending",
                position: maxPos + 1 + idx,
                source: "template",
                template_id: templateId,
                source_chat_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            tasks.push(newTask);
            addedTasks.push(newTask);
        });
        
        setLocalStorage("lexos_project_tasks", tasks);
        return {
            added: addedTasks.length,
            tasks: addedTasks,
        };
    },

    // --- Billing (India GST) ---

    getBillingSettings: async (): Promise<BillingSettings> => {
        await delay(50);
        return getLocalStorage<BillingSettings>(
            "lexos_billing_settings",
            DEFAULT_BILLING_SETTINGS,
        );
    },

    updateBillingSettings: async (body: {
        firm_gstin?: string | null;
        firm_state?: string | null;
        default_hourly_rate?: number | null;
    }): Promise<BillingSettings> => {
        await delay(100);
        const current = getLocalStorage<BillingSettings>(
            "lexos_billing_settings",
            DEFAULT_BILLING_SETTINGS,
        );
        const updated: BillingSettings = { ...current, ...body };
        setLocalStorage("lexos_billing_settings", updated);
        return updated;
    },

    listTimeEntries: async (projectId: string): Promise<TimeEntry[]> => {
        await delay(50);
        const entries = getLocalStorage<TimeEntry[]>(
            "lexos_time_entries",
            DEFAULT_TIME_ENTRIES,
        );
        return entries.filter((e) => e.project_id === projectId);
    },

    createTimeEntry: async (
        projectId: string,
        body: {
            description: string;
            minutes: number;
            entry_date?: string;
            rate?: number;
        },
    ): Promise<TimeEntry> => {
        await delay(100);
        const entries = getLocalStorage<TimeEntry[]>(
            "lexos_time_entries",
            DEFAULT_TIME_ENTRIES,
        );
        const settings = getLocalStorage<BillingSettings>(
            "lexos_billing_settings",
            DEFAULT_BILLING_SETTINGS,
        );
        const rate = body.rate ?? settings.default_hourly_rate ?? 0;
        const amount =
            Math.round(((body.minutes / 60) * rate + Number.EPSILON) * 100) /
            100;
        const newEntry: TimeEntry = {
            id: `te-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            entry_date:
                body.entry_date || new Date().toISOString().slice(0, 10),
            description: body.description,
            minutes: body.minutes,
            rate,
            amount,
            billed: false,
            source: "user",
            source_chat_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        entries.push(newEntry);
        setLocalStorage("lexos_time_entries", entries);
        return newEntry;
    },

    updateTimeEntry: async (
        projectId: string,
        entryId: string,
        body: { description?: string; billed?: boolean },
    ): Promise<TimeEntry> => {
        await delay(100);
        const entries = getLocalStorage<TimeEntry[]>(
            "lexos_time_entries",
            DEFAULT_TIME_ENTRIES,
        );
        const idx = entries.findIndex((e) => e.id === entryId);
        if (idx === -1) throw new Error("Time entry not found");
        entries[idx] = {
            ...entries[idx],
            ...body,
            updated_at: new Date().toISOString(),
        };
        setLocalStorage("lexos_time_entries", entries);
        return entries[idx];
    },

    deleteTimeEntry: async (
        projectId: string,
        entryId: string,
    ): Promise<void> => {
        await delay(100);
        const entries = getLocalStorage<TimeEntry[]>(
            "lexos_time_entries",
            DEFAULT_TIME_ENTRIES,
        );
        setLocalStorage(
            "lexos_time_entries",
            entries.filter((e) => e.id !== entryId),
        );
    },

    listInvoices: async (projectId: string): Promise<Invoice[]> => {
        await delay(50);
        const invoices = getLocalStorage<Invoice[]>(
            "lexos_invoices",
            DEFAULT_INVOICES,
        );
        return invoices.filter((i) => i.project_id === projectId);
    },

    createInvoice: async (
        projectId: string,
        body: {
            invoice_date?: string;
            client_name?: string;
            client_gstin?: string;
            place_of_supply?: string;
            time_entry_ids?: string[];
            line_items?: InvoiceLineItem[];
            notes?: string;
        },
    ): Promise<Invoice> => {
        await delay(150);
        const round2 = (n: number) =>
            Math.round((n + Number.EPSILON) * 100) / 100;
        const entries = getLocalStorage<TimeEntry[]>(
            "lexos_time_entries",
            DEFAULT_TIME_ENTRIES,
        );
        const settings = getLocalStorage<BillingSettings>(
            "lexos_billing_settings",
            DEFAULT_BILLING_SETTINGS,
        );
        const lineItems: InvoiceLineItem[] = [...(body.line_items ?? [])];
        const ids = body.time_entry_ids ?? [];
        for (const e of entries.filter((e) => ids.includes(e.id))) {
            const hrs = e.minutes > 0 ? `${(e.minutes / 60).toFixed(2)} hrs` : "";
            lineItems.push({
                description: [e.entry_date, e.description, hrs]
                    .filter(Boolean)
                    .join(" — "),
                amount: round2(e.amount),
            });
        }
        const subtotal = round2(
            lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0),
        );
        const place = body.place_of_supply?.trim() || null;
        const intra =
            !!place &&
            !!settings.firm_state &&
            place.toLowerCase() === settings.firm_state.toLowerCase();
        const cgst = intra ? round2(subtotal * 0.09) : 0;
        const sgst = intra ? round2(subtotal * 0.09) : 0;
        const igst = intra ? 0 : round2(subtotal * 0.18);
        const total = round2(subtotal + cgst + sgst + igst);
        const invoices = getLocalStorage<Invoice[]>(
            "lexos_invoices",
            DEFAULT_INVOICES,
        );
        const newInvoice: Invoice = {
            id: `inv-${Date.now()}`,
            project_id: projectId,
            user_id: "demo-user-id",
            invoice_number: `INV-${String(invoices.length + 1).padStart(4, "0")}`,
            invoice_date:
                body.invoice_date || new Date().toISOString().slice(0, 10),
            client_name: body.client_name?.trim() || null,
            client_gstin: body.client_gstin?.trim() || null,
            place_of_supply: place,
            sac_code: "9982",
            line_items: lineItems,
            subtotal,
            cgst,
            sgst,
            igst,
            total,
            status: "draft",
            notes: body.notes?.trim() || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        invoices.push(newInvoice);
        setLocalStorage("lexos_invoices", invoices);
        // Mark consumed entries billed.
        if (ids.length) {
            const all = entries.map((e) =>
                ids.includes(e.id) ? { ...e, billed: true } : e,
            );
            setLocalStorage("lexos_time_entries", all);
        }
        return newInvoice;
    },

    updateInvoiceStatus: async (
        projectId: string,
        invoiceId: string,
        status: Invoice["status"],
    ): Promise<Invoice> => {
        await delay(100);
        const invoices = getLocalStorage<Invoice[]>(
            "lexos_invoices",
            DEFAULT_INVOICES,
        );
        const idx = invoices.findIndex((i) => i.id === invoiceId);
        if (idx === -1) throw new Error("Invoice not found");
        invoices[idx] = {
            ...invoices[idx],
            status,
            updated_at: new Date().toISOString(),
        };
        setLocalStorage("lexos_invoices", invoices);
        return invoices[idx];
    }
};
