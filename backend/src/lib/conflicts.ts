/**
 * Conflict checking (PRD CLM-07/WA-09).
 *
 * Matches candidate names against the caller's whole accessible universe —
 * client names, party names across all accessible matters — and reports
 * matches with the role each entity plays on the matched side, so a
 * prospective client who is a counterparty elsewhere is surfaced.
 *
 * Matching happens in TypeScript: the per-user candidate universe is small,
 * pg_trgm is not enabled on deployments, and scoring in code keeps match
 * reasons explainable. Results are advisory — match strength and context
 * are always shown and a lawyer makes the call; nothing is auto-cleared.
 */

import type { createServerSupabase } from "./supabase";
import { listAccessibleProjectIds } from "./access";

type Db = ReturnType<typeof createServerSupabase>;

export const CONFLICT_CHECK_MAX_NAMES = 50;
export const CONFLICT_CHECK_NAME_MAX_CHARS = 200;
/** Cap matches per queried name so one common word can't flood the result. */
const MAX_MATCHES_PER_NAME = 25;

export type ConflictMatch = {
  matched_name: string;
  /** Where the matched name lives: a client record or a matter party. */
  match_kind: "client" | "party";
  /** Party role on the matched side; null for client records. */
  role: string | null;
  match_strength: "exact" | "strong" | "partial";
  severity: "potential_conflict" | "related_match";
  project: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
};

export type ConflictCheckResult = {
  queries: { name: string; matches: ConflictMatch[] }[];
};

/** Trailing corporate-form suffixes ignored when comparing entity names. */
const LEGAL_SUFFIXES = new Set([
  "ltd",
  "limited",
  "llp",
  "llc",
  "inc",
  "incorporated",
  "plc",
  "pvt",
  "private",
  "gmbh",
  "co",
  "corp",
  "corporation",
  "company",
  "lp",
  "sa",
  "ag",
  "bv",
  "nv",
]);

function tokenizeName(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

export function matchNameStrength(
  query: string,
  candidate: string,
): "exact" | "strong" | "partial" | null {
  const queryTokens = tokenizeName(query);
  const candidateTokens = tokenizeName(candidate);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return null;
  const queryNorm = queryTokens.join(" ");
  const candidateNorm = candidateTokens.join(" ");
  if (queryNorm === candidateNorm) return "exact";
  if (
    queryNorm.includes(candidateNorm) ||
    candidateNorm.includes(queryNorm)
  ) {
    return "strong";
  }
  const dice = diceCoefficient(new Set(queryTokens), new Set(candidateTokens));
  if (dice >= 0.6) return "partial";
  return null;
}

const ADVERSE_ROLES = new Set(["counterparty", "opposing_counsel"]);

export async function runConflictCheck(args: {
  names: string[];
  userId: string;
  userEmail?: string | null;
  /** Matter being checked — its own parties are not conflicts with itself. */
  excludeProjectId?: string | null;
  db: Db;
}): Promise<ConflictCheckResult> {
  const names = args.names
    .map((n) => String(n ?? "").trim().slice(0, CONFLICT_CHECK_NAME_MAX_CHARS))
    .filter(Boolean)
    .slice(0, CONFLICT_CHECK_MAX_NAMES);
  if (names.length === 0) return { queries: [] };

  const projectIds = await listAccessibleProjectIds(
    args.userId,
    args.userEmail,
    args.db,
  );

  const [{ data: projects }, { data: parties }, { data: ownClients }] =
    await Promise.all([
      projectIds.length
        ? args.db
            .from("projects")
            .select("id, name, client_id")
            .in("id", projectIds)
        : Promise.resolve({ data: [] }),
      projectIds.length
        ? args.db
            .from("project_parties")
            .select("id, project_id, name, role")
            .in("project_id", projectIds)
        : Promise.resolve({ data: [] }),
      args.db.from("clients").select("id, name").eq("user_id", args.userId),
    ]);

  const projectRows = (projects ?? []) as {
    id: string;
    name: string;
    client_id: string | null;
  }[];
  const partyRows = (parties ?? []) as {
    id: string;
    project_id: string;
    name: string;
    role: string;
  }[];
  const clientRows = (ownClients ?? []) as { id: string; name: string }[];

  // Clients linked to accessible projects may belong to another owner
  // (shared matters); fetch any not already covered by the user's own list.
  const knownClientIds = new Set(clientRows.map((c) => c.id));
  const missingClientIds = [
    ...new Set(
      projectRows
        .map((p) => p.client_id)
        .filter((id): id is string => !!id && !knownClientIds.has(id)),
    ),
  ];
  if (missingClientIds.length) {
    const { data: linkedClients } = await args.db
      .from("clients")
      .select("id, name")
      .in("id", missingClientIds);
    for (const c of (linkedClients ?? []) as { id: string; name: string }[]) {
      clientRows.push(c);
    }
  }

  const projectById = new Map(projectRows.map((p) => [p.id, p]));
  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const clientProjectsByClientId = new Map<string, string[]>();
  for (const p of projectRows) {
    if (!p.client_id) continue;
    const list = clientProjectsByClientId.get(p.client_id) ?? [];
    list.push(p.id);
    clientProjectsByClientId.set(p.client_id, list);
  }

  const queries = names.map((name) => {
    const matches: ConflictMatch[] = [];

    for (const party of partyRows) {
      if (args.excludeProjectId && party.project_id === args.excludeProjectId)
        continue;
      const strength = matchNameStrength(name, party.name);
      if (!strength) continue;
      const project = projectById.get(party.project_id) ?? null;
      const client = project?.client_id
        ? (clientById.get(project.client_id) ?? null)
        : null;
      matches.push({
        matched_name: party.name,
        match_kind: "party",
        role: party.role,
        match_strength: strength,
        severity: ADVERSE_ROLES.has(party.role)
          ? "potential_conflict"
          : "related_match",
        project: project ? { id: project.id, name: project.name } : null,
        client: client ? { id: client.id, name: client.name } : null,
      });
    }

    for (const client of clientRows) {
      const strength = matchNameStrength(name, client.name);
      if (!strength) continue;
      const clientProjectIds = (
        clientProjectsByClientId.get(client.id) ?? []
      ).filter((id) => id !== args.excludeProjectId);
      const firstProject = clientProjectIds.length
        ? (projectById.get(clientProjectIds[0]) ?? null)
        : null;
      matches.push({
        matched_name: client.name,
        match_kind: "client",
        role: null,
        // The queried name is an existing client of the firm. Whether that
        // is adverse depends on which side the name is being engaged on —
        // flag it as a potential conflict so a lawyer reviews it.
        match_strength: strength,
        severity: "potential_conflict",
        project: firstProject
          ? { id: firstProject.id, name: firstProject.name }
          : null,
        client: { id: client.id, name: client.name },
      });
    }

    const strengthRank = { exact: 0, strong: 1, partial: 2 } as const;
    const severityRank = { potential_conflict: 0, related_match: 1 } as const;
    matches.sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        strengthRank[a.match_strength] - strengthRank[b.match_strength],
    );
    return { name, matches: matches.slice(0, MAX_MATCHES_PER_NAME) };
  });

  return { queries };
}
