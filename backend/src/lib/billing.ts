/**
 * Time tracking & GST invoicing (India).
 *
 * Billable work is captured as time entries per matter (by users or the
 * assistant via save_time_entry). Invoices are generated from selected
 * entries or ad-hoc lines, with GST computed for legal services (SAC 9982)
 * at 18%: CGST 9% + SGST 9% when the place of supply matches the firm's
 * state (intra-state), otherwise IGST 18% (inter-state). All figures are
 * advisory — a professional should confirm the tax treatment.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const GST_RATE = 0.18;
export const SAC_CODE = "9982";
export const DESCRIPTION_MAX_CHARS = 500;

export type TimeEntryRow = {
  id: string;
  project_id: string;
  user_id: string;
  entry_date: string;
  description: string;
  minutes: number;
  rate: number;
  amount: number;
  billed: boolean;
  source: "assistant" | "user";
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = { description: string; amount: number };

export type InvoiceRow = {
  id: string;
  project_id: string;
  user_id: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string | null;
  client_gstin: string | null;
  place_of_supply: string | null;
  sac_code: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  status: "draft" | "sent" | "paid";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingSettings = {
  firm_gstin: string | null;
  firm_state: string | null;
  default_hourly_rate: number | null;
};

const TIME_ENTRY_COLUMNS =
  "id, project_id, user_id, entry_date, description, minutes, rate, amount, billed, source, source_chat_id, created_at, updated_at";
const INVOICE_COLUMNS =
  "id, project_id, user_id, invoice_number, invoice_date, client_name, client_gstin, place_of_supply, sac_code, line_items, subtotal, cgst, sgst, igst, total, status, notes, created_at, updated_at";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNumber(raw: unknown, fallback = 0): number {
  const n = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeDescription(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, DESCRIPTION_MAX_CHARS);
}

/** Accepts only ISO YYYY-MM-DD; returns today when blank/invalid. */
export function normalizeDate(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return value;
  }
  return new Date().toISOString().slice(0, 10);
}

// ---- Billing settings (firm GSTIN / state / default rate) -----------------

export async function getBillingSettings(
  userId: string,
  db: Db,
): Promise<BillingSettings> {
  const { data } = await db
    .from("user_profiles")
    .select("firm_gstin, firm_state, default_hourly_rate")
    .eq("user_id", userId)
    .maybeSingle();
  const row = (data ?? {}) as Partial<BillingSettings>;
  return {
    firm_gstin: row.firm_gstin ?? null,
    firm_state: row.firm_state ?? null,
    default_hourly_rate:
      row.default_hourly_rate != null
        ? toNumber(row.default_hourly_rate)
        : null,
  };
}

// ---- Time entries ----------------------------------------------------------

export async function listTimeEntries(
  projectId: string,
  db: Db,
): Promise<TimeEntryRow[]> {
  const { data } = await db
    .from("time_entries")
    .select(TIME_ENTRY_COLUMNS)
    .eq("project_id", projectId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as TimeEntryRow[];
}

export async function saveTimeEntry(args: {
  projectId: string;
  userId: string;
  description: string;
  minutes: number;
  entryDate?: string;
  rate?: number | null;
  source: "assistant" | "user";
  sourceChatId?: string | null;
  db: Db;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const description = normalizeDescription(args.description);
  if (!description)
    return { ok: false, error: "Time entry description is required." };
  const minutes = Math.max(0, Math.round(toNumber(args.minutes)));
  // Rate defaults to the firm's default hourly rate when not supplied.
  let rate = args.rate != null ? toNumber(args.rate) : NaN;
  if (!Number.isFinite(rate)) {
    const settings = await getBillingSettings(args.userId, args.db);
    rate = settings.default_hourly_rate ?? 0;
  }
  const amount = round2((minutes / 60) * rate);
  const { data, error } = await args.db
    .from("time_entries")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      entry_date: normalizeDate(args.entryDate),
      description,
      minutes,
      rate,
      amount,
      source: args.source,
      source_chat_id: args.sourceChatId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Failed to save time entry." };
  return { ok: true, id: (data as { id: string }).id };
}

// ---- Invoices --------------------------------------------------------------

/**
 * Compute GST for legal services. Intra-state (place of supply == firm
 * state, case-insensitive) splits into CGST + SGST; otherwise IGST.
 */
export function computeInvoiceTotals(
  lineItems: InvoiceLineItem[],
  placeOfSupply: string | null,
  firmState: string | null,
): { subtotal: number; cgst: number; sgst: number; igst: number; total: number } {
  const subtotal = round2(
    lineItems.reduce((sum, li) => sum + toNumber(li.amount), 0),
  );
  const intraState =
    !!placeOfSupply &&
    !!firmState &&
    placeOfSupply.trim().toLowerCase() === firmState.trim().toLowerCase();
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (intraState) {
    cgst = round2(subtotal * (GST_RATE / 2));
    sgst = round2(subtotal * (GST_RATE / 2));
  } else {
    igst = round2(subtotal * GST_RATE);
  }
  const total = round2(subtotal + cgst + sgst + igst);
  return { subtotal, cgst, sgst, igst, total };
}

function sanitizeLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((li) => {
      const item = li as { description?: unknown; amount?: unknown };
      return {
        description: normalizeDescription(item.description),
        amount: round2(toNumber(item.amount)),
      };
    })
    .filter((li) => li.description.length > 0);
}

async function nextInvoiceNumber(userId: string, db: Db): Promise<string> {
  const { count } = await db
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const n = (count ?? 0) + 1;
  return `INV-${String(n).padStart(4, "0")}`;
}

export async function listInvoices(
  projectId: string,
  db: Db,
): Promise<InvoiceRow[]> {
  const { data } = await db
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("project_id", projectId)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as InvoiceRow[];
}

export async function createInvoice(args: {
  projectId: string;
  userId: string;
  invoiceDate?: string;
  clientName?: string | null;
  clientGstin?: string | null;
  placeOfSupply?: string | null;
  timeEntryIds?: string[];
  lineItems?: InvoiceLineItem[];
  notes?: string | null;
  db: Db;
}): Promise<{ ok: true; invoice: InvoiceRow } | { ok: false; error: string }> {
  const { db } = args;
  const lineItems: InvoiceLineItem[] = sanitizeLineItems(args.lineItems);

  // Pull selected unbilled time entries into line items.
  const entryIds = Array.isArray(args.timeEntryIds) ? args.timeEntryIds : [];
  let billedEntryIds: string[] = [];
  if (entryIds.length) {
    const { data } = await db
      .from("time_entries")
      .select(TIME_ENTRY_COLUMNS)
      .eq("project_id", args.projectId)
      .in("id", entryIds);
    const entries = (data ?? []) as TimeEntryRow[];
    for (const e of entries) {
      const mins = toNumber(e.minutes);
      const hrs = mins > 0 ? `${(mins / 60).toFixed(2)} hrs` : "";
      lineItems.push({
        description: [e.entry_date, e.description, hrs]
          .filter(Boolean)
          .join(" — "),
        amount: round2(toNumber(e.amount)),
      });
    }
    billedEntryIds = entries.map((e) => e.id);
  }

  if (lineItems.length === 0)
    return { ok: false, error: "An invoice needs at least one line item." };

  const settings = await getBillingSettings(args.userId, db);
  const placeOfSupply = args.placeOfSupply?.trim() || null;
  const totals = computeInvoiceTotals(
    lineItems,
    placeOfSupply,
    settings.firm_state,
  );
  const invoiceNumber = await nextInvoiceNumber(args.userId, db);

  const { data, error } = await db
    .from("invoices")
    .insert({
      project_id: args.projectId,
      user_id: args.userId,
      invoice_number: invoiceNumber,
      invoice_date: normalizeDate(args.invoiceDate),
      client_name: args.clientName?.trim() || null,
      client_gstin: args.clientGstin?.trim() || null,
      place_of_supply: placeOfSupply,
      sac_code: SAC_CODE,
      line_items: lineItems,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      total: totals.total,
      notes: args.notes?.trim() || null,
    })
    .select(INVOICE_COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: "Failed to create invoice." };

  // Mark the consumed time entries as billed (best-effort).
  if (billedEntryIds.length) {
    await db
      .from("time_entries")
      .update({ billed: true, updated_at: new Date().toISOString() })
      .in("id", billedEntryIds)
      .eq("project_id", args.projectId);
  }

  return { ok: true, invoice: data as InvoiceRow };
}
