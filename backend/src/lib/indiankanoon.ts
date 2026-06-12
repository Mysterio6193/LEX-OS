import fs from "fs/promises";
import path from "path";

const INDIANKANOON_BASE = "https://api.indiankanoon.org";
const INDIANKANOON_WEB_BASE = "https://indiankanoon.org";

type JsonRecord = Record<string, unknown>;
const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
    if (isDev) console.log(...args);
};

function indiankanoonHeaders(apiToken?: string | null): HeadersInit {
    const token =
        apiToken?.trim() || process.env.INDIANKANOON_API_TOKEN?.trim();
    if (!token) {
        throw new Error(
            "INDIANKANOON_API_TOKEN must be set to use Indian Kanoon tools.",
        );
    }
    return {
        Accept: "application/json",
        Authorization: `Token ${token}`,
    };
}

function parseIndiankanoonError(status: number, detail: string): string {
    const trimmed = detail.trim();
    if (!trimmed) return `Indian Kanoon error (${status})`;
    let message = trimmed;
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const record = parsed as Record<string, unknown>;
            message =
                typeof record.detail === "string" && record.detail.trim()
                    ? record.detail.trim()
                    : typeof record.message === "string" && record.message.trim()
                      ? record.message.trim()
                      : trimmed;
        }
    } catch {
        // Non-JSON response bodies are displayed as-is.
    }

    if (status === 429) {
        return `Indian Kanoon rate limit exceeded. Try again shortly.`;
    }
    return `Indian Kanoon error (${status}): ${message}`;
}

async function indiankanoonFetch<T>(
    pathOrUrl: string,
    init?: RequestInit,
    apiToken?: string | null,
): Promise<T> {
    const url = pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `${INDIANKANOON_BASE}${pathOrUrl}`;
    devLog("[indiankanoon/api] request", {
        method: init?.method ?? "GET",
        path: pathOrUrl,
        url,
    });
    const response = await fetch(url, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(15_000),
        headers: {
            ...indiankanoonHeaders(apiToken),
            ...(init?.headers ?? {}),
        },
    });
    devLog("[indiankanoon/api] response", {
        method: init?.method ?? "GET",
        path: pathOrUrl,
        status: response.status,
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(parseIndiankanoonError(response.status, detail));
    }
    return response.json() as Promise<T>;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function truncate(value: string | null, maxChars: number): string | null {
    if (!value) return null;
    if (value.length <= maxChars) return value;
    return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_match, code) =>
            String.fromCharCode(Number.parseInt(code, 10)),
        )
        .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
            String.fromCharCode(Number.parseInt(code, 16)),
        );
}

function stripOpinionMarkup(value: string | null): string | null {
    if (!value) return null;
    return decodeHtmlEntities(
        value
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(div|section|opinion|blockquote|li|h[1-6])>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
    );
}

function safeIndiankanoonHref(rawHref: string | null): string | null {
    if (!rawHref) return null;
    const href = decodeHtmlEntities(rawHref.trim());
    if (!href) return null;
    if (href.startsWith("#")) return href;
    if (href.startsWith("/")) return `${INDIANKANOON_WEB_BASE}${href}`;
    if (href.startsWith(INDIANKANOON_WEB_BASE)) return href;
    if (/^https?:\/\//i.test(href)) return null;
    return null;
}

const SAFE_OPINION_HTML_TAGS = new Set([
    "a",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
]);

const SAFE_OPINION_ATTRS = new Set([
    "aria-label",
    "class",
    "colspan",
    "href",
    "id",
    "rowspan",
    "title",
]);

const VOID_OPINION_TAGS = new Set(["br"]);

function sanitizeOpinionClassList(value: string): string | null {
    const classes = decodeHtmlEntities(value)
        .split(/\s+/)
        .filter((className) => /^[a-z0-9_-]{1,80}$/i.test(className));
    return classes.length ? classes.join(" ") : null;
}

function sanitizeOpinionHtmlAttrs(tagName: string, attrs: string): string {
    const output: string[] = [];
    const attrPattern =
        /([^\s"'<>/=`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrPattern.exec(attrs))) {
        const rawName = match[1] ?? "";
        const name = rawName.toLowerCase();
        const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
        if (!SAFE_OPINION_ATTRS.has(name) || name.startsWith("on")) continue;

        if (name === "href") {
            if (tagName !== "a") continue;
            const href = safeIndiankanoonHref(rawValue);
            if (!href) continue;
            output.push(`href="${escapeHtml(href)}"`);
            continue;
        }

        if (name === "class") {
            const classList = sanitizeOpinionClassList(rawValue);
            if (classList) output.push(`class="${escapeHtml(classList)}"`);
            continue;
        }

        if (name === "id") {
            const id = decodeHtmlEntities(rawValue).trim();
            if (/^[a-z0-9_-]{1,120}$/i.test(id)) {
                output.push(`id="${escapeHtml(id)}"`);
            }
            continue;
        }

        if (name === "colspan" || name === "rowspan") {
            const value = Number.parseInt(rawValue, 10);
            if (Number.isFinite(value) && value > 0 && value <= 100) {
                output.push(`${name}="${value}"`);
            }
            continue;
        }

        const value = decodeHtmlEntities(rawValue).trim();
        if (value) output.push(`${name}="${escapeHtml(value.slice(0, 300))}"`);
    }

    if (tagName === "a") {
        output.push('target="_blank"', 'rel="noopener noreferrer"');
    }

    return output.length ? ` ${output.join(" ")}` : "";
}

function sanitizeOpinionHtml(value: string | null): string | null {
    if (!value) return null;
    const normalized = value
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[\s\S]*?<\/\1>/gi, "")
        .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*\/?>/gi, "");

    const sanitized = normalized.replace(
        /<\/?([a-z0-9-]+)\b([^>]*)>/gi,
        (match, tag, attrs) => {
            const name = String(tag).toLowerCase();
            const closing = match.startsWith("</");
            if (!SAFE_OPINION_HTML_TAGS.has(name)) return "";
            if (closing) {
                return VOID_OPINION_TAGS.has(name) ? "" : `</${name}>`;
            }
            if (VOID_OPINION_TAGS.has(name)) return `<${name}>`;
            return `<${name}${sanitizeOpinionHtmlAttrs(name, String(attrs))}>`;
        },
    );

    return sanitized.replace(/\n{3,}/g, "\n\n").trim();
}

function formatKanoonDate(dateStr: string): string {
    // converts YYYY-MM-DD to DD-MM-YYYY
    const parts = dateStr.split("-");
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

type CitationLookupCluster = {
    id: number;
    caseName: string | null;
    dateFiled: string | null;
    court: string | null;
    citations: string[];
    url: string | null;
    pdfUrl: string | null;
    subOpinions: [];
};

type CitationLookupRow = {
    citation: string | null;
    status: string;
    message: string | null;
    clusters: CitationLookupCluster[];
};

type CitationLookupPayload = {
    citationsSubmitted?: number;
    citationLinks: {
        clusterId: number | null;
        citation: string | null;
        caseName: string | null;
        court: string | null;
        dateFiled: string | null;
        pdfUrl: string | null;
        url: string | null;
        markdown: string;
    }[];
    results: CitationLookupRow[];
    source?: string;
};

function buildCitationLinks(results: CitationLookupRow[]) {
    return results.flatMap((result) =>
        result.clusters.flatMap((cluster) => {
            if (!cluster.url) return [];
            const label = [cluster.caseName, result.citation]
                .filter(Boolean)
                .join(", ");
            return [
                {
                    clusterId: cluster.id,
                    citation: result.citation,
                    caseName: cluster.caseName,
                    court: cluster.court,
                    dateFiled: cluster.dateFiled,
                    pdfUrl: cluster.pdfUrl,
                    url: cluster.url,
                    markdown: `[${label || cluster.url}](${cluster.url})`,
                },
            ];
        }),
    );
}

export async function verifyIndiankanoonCitations(args: {
    citations?: string[];
    apiToken?: string | null;
}): Promise<CitationLookupPayload> {
    const citations = Array.isArray(args.citations)
        ? args.citations
              .map((c) => (typeof c === "string" ? c.trim() : ""))
              .filter(Boolean)
              .slice(0, 50)
        : [];
    if (!citations.length) {
        return { citationLinks: [], results: [] };
    }

    const results: CitationLookupRow[] = [];

    for (const citation of citations) {
        try {
            // Search for the citation as a phrase to find exact match
            const data = await indiankanoonFetch<{
                results?: {
                    tid: number;
                    title: string;
                    court: string;
                    publishdate?: string;
                    headline: string;
                }[];
            }>(`/search/?formInput=${encodeURIComponent(`"${citation}"`)}&pagenum=0`, undefined, args.apiToken);

            const searchResults = data.results || [];
            if (searchResults.length > 0) {
                const topResult = searchResults[0];
                const cluster: CitationLookupCluster = {
                    id: topResult.tid,
                    caseName: topResult.title,
                    dateFiled: topResult.publishdate || null,
                    court: topResult.court,
                    citations: [citation],
                    url: `${INDIANKANOON_WEB_BASE}/doc/${topResult.tid}/`,
                    pdfUrl: null,
                    subOpinions: [],
                };
                results.push({
                    citation,
                    status: "ok",
                    message: null,
                    clusters: [cluster],
                });
            } else {
                results.push({
                    citation,
                    status: "not_found",
                    message: "Citation was not found on Indian Kanoon.",
                    clusters: [],
                });
            }
        } catch (err) {
            results.push({
                citation,
                status: "error",
                message: err instanceof Error ? err.message : String(err),
                clusters: [],
            });
        }
    }

    return {
        citationsSubmitted: citations.length,
        citationLinks: buildCitationLinks(results),
        results,
        source: "api",
    };
}

export async function searchIndiankanoonCaseLaw(args: {
    query?: string;
    court?: string;
    filedAfter?: string;
    filedBefore?: string;
    limit?: number;
    apiToken?: string | null;
}) {
    const query = args.query?.trim();
    if (!query) return { error: "query is required." };
    const limit = Math.max(1, Math.min(20, Math.floor(args.limit ?? 10)));

    let formInput = query;
    if (args.court?.trim()) {
        formInput += ` court:${args.court.trim()}`;
    }
    if (args.filedAfter?.trim()) {
        formInput += ` fromdate:${formatKanoonDate(args.filedAfter.trim())}`;
    }
    if (args.filedBefore?.trim()) {
        formInput += ` todate:${formatKanoonDate(args.filedBefore.trim())}`;
    }

    const data = await indiankanoonFetch<{
        results?: {
            tid: number;
            title: string;
            court: string;
            publishdate?: string;
            headline: string;
        }[];
    }>(`/search/?formInput=${encodeURIComponent(formInput)}&pagenum=0`, undefined, args.apiToken);

    const rawResults = data.results || [];
    return {
        query,
        results: rawResults.slice(0, limit).map((r) => ({
            clusterId: r.tid,
            caseName: r.title,
            citation: null,
            court: r.court,
            dateFiled: r.publishdate || null,
            snippet: stripOpinionMarkup(r.headline),
            url: `${INDIANKANOON_WEB_BASE}/doc/${r.tid}/`,
        })),
    };
}

export async function getIndiankanoonCaseOpinions(args: {
    clusterId?: number;
    includeFullText?: boolean;
    maxChars?: number;
    apiToken?: string | null;
}) {
    if (!args.clusterId || !Number.isFinite(args.clusterId)) {
        return { error: "clusterId is required." };
    }
    const docid = Math.floor(args.clusterId);
    const maxChars = Math.max(1000, Math.min(100000, args.maxChars ?? 25000));

    const doc = await indiankanoonFetch<{
        docid: number;
        title: string;
        court?: string;
        publishdate?: string;
        doc?: string;
        author?: string;
    }>(`/doc/${docid}/`, undefined, args.apiToken);

    const text = stripOpinionMarkup(doc.doc || "");
    const html = sanitizeOpinionHtml(doc.doc || "");

    return {
        id: docid,
        url: `${INDIANKANOON_WEB_BASE}/doc/${docid}/`,
        caseName: doc.title,
        court: doc.court || null,
        dateFiled: doc.publishdate || null,
        citations: [],
        pdfUrl: null,
        opinions: [
            {
                opinionId: docid,
                type: "opinion",
                author: doc.author || null,
                per_curiam: null,
                joined_by_str: null,
                url: `${INDIANKANOON_WEB_BASE}/doc/${docid}/`,
                text: truncate(text, maxChars),
                html: truncate(html, maxChars),
            },
        ],
        source: "api",
    };
}

export async function getIndiankanoonCases(args: {
    clusterIds?: number[];
    includeFullText?: boolean;
    maxChars?: number;
    apiToken?: string | null;
}) {
    const clusterIds = Array.from(
        new Set(
            (args.clusterIds ?? [])
                .filter((value) => Number.isFinite(value) && value > 0)
                .map((value) => Math.floor(value)),
        ),
    );
    if (!clusterIds.length) {
        return { error: "clusterIds is required.", cases: [] };
    }

    const cases = await Promise.all(
        clusterIds.map(async (clusterId) => {
            try {
                const result = await getIndiankanoonCaseOpinions({
                    clusterId,
                    includeFullText: args.includeFullText,
                    maxChars: args.maxChars,
                    apiToken: args.apiToken,
                });
                return {
                    clusterId,
                    ...(result && typeof result === "object"
                        ? (result as JsonRecord)
                        : { result }),
                };
            } catch (err) {
                return {
                    clusterId,
                    id: clusterId,
                    opinions: [],
                    error:
                        err instanceof Error
                            ? err.message
                            : "Indian Kanoon case fetch failed.",
                };
            }
        }),
    );

    return { cases };
}
