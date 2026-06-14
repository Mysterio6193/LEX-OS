/**
 * Tabular cell citation parsing + verification (v2 Phase 2b).
 *
 * Review-table cells embed inline citations of the form
 * `[[page:N||quote:exact text]]` in their summary. These helpers extract
 * those markers into a structured array and verify each quote against the
 * cell's source document (reusing the citation guard), so the stored
 * `tabular_cells.citations` is grounded and any fabricated quote is flagged.
 * Pure functions — unit-tested in the eval harness.
 */

import { quoteAppears } from "./agent/citationGuard";

export type CellCitation = {
  page: number | null;
  quote: string;
  verified?: boolean;
};

const INLINE_CITATION_RE =
  /\[\[\s*page\s*:\s*([0-9]+)?\s*\|\|\s*quote\s*:\s*([\s\S]*?)\]\]/g;

/** Extract every `[[page:N||quote:…]]` marker from a cell summary. */
export function parseInlineCitations(summary: string): CellCitation[] {
  if (!summary) return [];
  const out: CellCitation[] = [];
  for (const m of summary.matchAll(INLINE_CITATION_RE)) {
    const page = m[1] ? Number(m[1]) : null;
    const quote = (m[2] ?? "").trim();
    if (quote) {
      out.push({ page: Number.isFinite(page as number) ? page : null, quote });
    }
  }
  return out;
}

/** Verify each citation's quote appears in the cell's source document text. */
export function verifyCellCitations(
  markers: CellCitation[],
  documentText: string,
): CellCitation[] {
  return markers.map((c) => ({
    ...c,
    verified: quoteAppears(c.quote, documentText),
  }));
}

/** Parse a summary's citations and verify them against the source in one step. */
export function extractVerifiedCitations(
  summary: string,
  documentText: string,
): CellCitation[] {
  return verifyCellCitations(parseInlineCitations(summary), documentText);
}
