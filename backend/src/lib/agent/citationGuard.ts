/**
 * Citation guard (v2 Phase 1e). Pure verification logic — unit-tested.
 *
 * Confirms that an emitted citation's quoted text actually appears in the
 * source it points to (the retrieved document text, or the fetched case
 * judgment). Unresolved citations are reported so they can be flagged
 * "unverified" rather than presented as settled — the trust gate that
 * matters in an era of AI-fabricated-citation sanctions.
 */

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does `quote` appear in `source`? Exact (normalized) substring first; for
 * longer quotes, a leading-shingle fallback tolerates minor OCR/formatting
 * drift without matching unrelated text.
 */
export function quoteAppears(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote);
  const src = normalizeForMatch(source);
  if (q.length < 8) return false; // too short to verify meaningfully
  if (src.includes(q)) return true;

  const qWords = q.split(" ");
  if (qWords.length >= 12) {
    // Require a contiguous 8-word run from the quote to appear in source.
    const shingle = qWords.slice(0, 8).join(" ");
    return src.includes(shingle);
  }
  return false;
}

export type CitationToCheck = {
  ref: number;
  kind: "document" | "case";
  /** document_id for document cites, String(cluster_id) for case cites. */
  sourceId: string | null;
  quotes: string[];
};

export type CitationVerdict = {
  ref: number;
  kind: "document" | "case";
  verified: boolean;
  reason: string;
};

/**
 * Verify a batch of citations against the source texts available this turn.
 * `sourceText` maps sourceId → full retrieved text. A citation is verified
 * when at least one of its quotes appears in its source; a missing source
 * is reported as unverified ("source not retrieved").
 */
export function verifyCitations(
  citations: CitationToCheck[],
  sourceText: Map<string, string>,
): CitationVerdict[] {
  return citations.map((c) => {
    if (!c.sourceId) {
      return {
        ref: c.ref,
        kind: c.kind,
        verified: false,
        reason: "No source identifier on the citation.",
      };
    }
    const source = sourceText.get(c.sourceId);
    if (!source) {
      return {
        ref: c.ref,
        kind: c.kind,
        verified: false,
        reason: "Cited source was not retrieved/read this turn.",
      };
    }
    const quotes = c.quotes.filter((q) => q && q.trim());
    if (quotes.length === 0) {
      return {
        ref: c.ref,
        kind: c.kind,
        verified: false,
        reason: "Citation carries no quote to verify.",
      };
    }
    const ok = quotes.some((q) => quoteAppears(q, source));
    return {
      ref: c.ref,
      kind: c.kind,
      verified: ok,
      reason: ok
        ? "Quote found in the cited source."
        : "Quote not found in the cited source.",
    };
  });
}

export const CITATION_COVERAGE_NOTE =
  "Citation checks cover sources retrieved this turn; case-law coverage is limited to what the research source indexes (recent or unreported judgments may be absent). Verify before relying.";
