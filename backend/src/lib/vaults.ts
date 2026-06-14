/**
 * Matter Vault (v2 Phase 2): named document sets within a matter for
 * retrieval/review at scale. A vault is a scoping layer over the Phase-1
 * document_chunks index — membership is the set of document_ids it groups.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const VAULT_NAME_MAX = 200;
export const VAULT_DESC_MAX = 2000;

export type VaultRow = {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeVaultName(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, VAULT_NAME_MAX);
}

export function normalizeVaultDescription(raw: unknown): string | null {
  const d = String(raw ?? "").trim().slice(0, VAULT_DESC_MAX);
  return d || null;
}

export async function listVaults(
  projectId: string,
  db: Db,
): Promise<(VaultRow & { document_count: number })[]> {
  const { data } = await db
    .from("vaults")
    .select("id, project_id, user_id, name, description, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const vaults = (data ?? []) as VaultRow[];
  if (vaults.length === 0) return [];
  const { data: members } = await db
    .from("vault_documents")
    .select("vault_id")
    .in(
      "vault_id",
      vaults.map((v) => v.id),
    );
  const counts = new Map<string, number>();
  for (const m of (members ?? []) as { vault_id: string }[]) {
    counts.set(m.vault_id, (counts.get(m.vault_id) ?? 0) + 1);
  }
  return vaults.map((v) => ({ ...v, document_count: counts.get(v.id) ?? 0 }));
}

export async function listVaultDocumentIds(
  vaultId: string,
  db: Db,
): Promise<string[]> {
  const { data } = await db
    .from("vault_documents")
    .select("document_id")
    .eq("vault_id", vaultId);
  return ((data ?? []) as { document_id: string }[]).map((r) => r.document_id);
}

/** Resolve a vault and confirm it belongs to the given project. */
export async function getVaultInProject(
  vaultId: string,
  projectId: string,
  db: Db,
): Promise<VaultRow | null> {
  const { data } = await db
    .from("vaults")
    .select("id, project_id, user_id, name, description, created_at, updated_at")
    .eq("id", vaultId)
    .eq("project_id", projectId)
    .single();
  return (data as VaultRow | null) ?? null;
}
