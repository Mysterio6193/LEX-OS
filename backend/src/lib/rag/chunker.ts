/**
 * Structure-aware chunking (v2 Phase 1b). Pure functions — unit-tested.
 *
 * Splits a document's extracted text into parent/child chunks on semantic
 * boundaries (paragraphs, numbered paras, clauses, sections) rather than
 * blind fixed windows, preserving page numbers (from pdfjs `[Page N]` or
 * markdown `## Page N` markers) and section/para identifiers as metadata so
 * retrieval can ground answers to a span. Retrieval searches the small,
 * precise child chunks and can fetch the larger parent for context.
 */

export type DocType = "judgment" | "contract" | "statute" | "generic";

export type Chunk = {
  chunkIndex: number;
  parentIndex: number | null;
  text: string;
  docType: DocType;
  page: number | null;
  sectionNo: string | null;
  paraNo: string | null;
  metadata: Record<string, unknown>;
};

const CHILD_MAX = 900;
const PARENT_MAX = 2000;

export function detectDocType(filename: string, text: string): DocType {
  const head = text.slice(0, 4000).toLowerCase();
  if (
    /in the .*court|hon'?ble|\bversus\b|petitioner|respondent|coram|\bj\.\b/.test(
      head,
    )
  ) {
    return "judgment";
  }
  if (/\bwhereas\b|this agreement|by and between|in witness whereof/.test(head)) {
    return "contract";
  }
  if (/\bact,?\s*\d{4}\b|(?:^|\n)\s*section\s+\d+|chapter\s+[ivxl]+/.test(head)) {
    return "statute";
  }
  return "generic";
}

/** Split extracted text into pages using `[Page N]` / `## Page N` markers. */
function parsePages(text: string): { page: number | null; text: string }[] {
  const marker = /\[Page (\d+)\]|##\s*Page\s*(\d+)/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) {
    const t = text.trim();
    return t ? [{ page: null, text: t }] : [];
  }
  const pages: { page: number | null; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const page = Number(m[1] ?? m[2]);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const seg = text.slice(start, end).trim();
    if (seg) pages.push({ page: Number.isFinite(page) ? page : null, text: seg });
  }
  return pages;
}

/** Detect a leading section/para identifier for a unit, by doc type. */
function detectMarker(
  unit: string,
  docType: DocType,
): { sectionNo: string | null; paraNo: string | null } {
  const head = unit.trimStart();
  if (docType === "contract") {
    const m = head.match(/^(\d+(?:\.\d+)*)[.)]?\s+\S/);
    return { sectionNo: m ? m[1] : null, paraNo: null };
  }
  if (docType === "statute") {
    const m = head.match(/^(?:section\s+)?(\d+[A-Za-z]?)[.)]\s+\S/i);
    return { sectionNo: m ? m[1] : null, paraNo: null };
  }
  if (docType === "judgment") {
    const m = head.match(/^(\d+)[.)]\s+\S/);
    return { sectionNo: null, paraNo: m ? m[1] : null };
  }
  return { sectionNo: null, paraNo: null };
}

/** Split an oversize unit into <= CHILD_MAX pieces on sentence boundaries. */
function splitOversize(unit: string): string[] {
  if (unit.length <= CHILD_MAX) return [unit];
  const sentences = unit.split(/(?<=[.?!])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + s.length + 1 > CHILD_MAX) {
      out.push(buf.trim());
      buf = "";
    }
    // A single sentence longer than CHILD_MAX is hard-split on whitespace.
    if (s.length > CHILD_MAX) {
      if (buf) {
        out.push(buf.trim());
        buf = "";
      }
      for (let i = 0; i < s.length; i += CHILD_MAX) {
        out.push(s.slice(i, i + CHILD_MAX).trim());
      }
      continue;
    }
    buf = buf ? `${buf} ${s}` : s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

type Unit = {
  text: string;
  page: number | null;
  sectionNo: string | null;
  paraNo: string | null;
};

/**
 * Chunk a document into parent + child chunks. Children are small, precise
 * units (a paragraph / clause); each references the index of its parent,
 * a ~2000-char context window. Parents have `parentIndex: null`.
 */
export function chunkDocument(args: {
  text: string;
  filename: string;
  docType?: DocType;
}): Chunk[] {
  const text = args.text ?? "";
  if (!text.trim()) return [];
  const docType = args.docType ?? detectDocType(args.filename, text);

  // 1. Pages → 2. units (paragraphs, marker-aware, size-capped).
  const units: Unit[] = [];
  for (const { page, text: pageText } of parsePages(text)) {
    const paragraphs = pageText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const para of paragraphs) {
      const { sectionNo, paraNo } = detectMarker(para, docType);
      for (const piece of splitOversize(para)) {
        units.push({ text: piece, page, sectionNo, paraNo });
      }
    }
  }
  if (units.length === 0) return [];

  // 3. Group consecutive units into parents (~PARENT_MAX chars).
  const chunks: Chunk[] = [];
  let idx = 0;
  let i = 0;
  while (i < units.length) {
    const group: Unit[] = [];
    let size = 0;
    while (i < units.length && (group.length === 0 || size + units[i].text.length <= PARENT_MAX)) {
      group.push(units[i]);
      size += units[i].text.length + 1;
      i++;
    }
    const parentIndex = idx++;
    const parentPage = group[0].page;
    chunks.push({
      chunkIndex: parentIndex,
      parentIndex: null,
      text: group.map((u) => u.text).join("\n\n"),
      docType,
      page: parentPage,
      sectionNo: group[0].sectionNo,
      paraNo: group[0].paraNo,
      metadata: { role: "parent", child_count: group.length },
    });
    for (const u of group) {
      chunks.push({
        chunkIndex: idx++,
        parentIndex,
        text: u.text,
        docType,
        page: u.page,
        sectionNo: u.sectionNo,
        paraNo: u.paraNo,
        metadata: { role: "child" },
      });
    }
  }
  return chunks;
}
