export type CitationStyleId =
  | "apa"
  | "mla"
  | "chicago-author-date"
  | "ieee"
  | "harvard-cite-them-right"
  | "vancouver";

export type CitationInputKind =
  | "paste_text"
  | "upload_docx"
  | "upload_pdf"
  | "url_page"
  | "bib_list";

export type CitationRecord = {
  id: string;
  raw: string;
  /**
   * CSL-JSON item (best-effort). When present, rendering is deterministic.
   * We intentionally keep this as unknown to avoid baking a huge type surface.
   */
  csl?: unknown;
  doi?: string;
  url?: string;
  year?: number;
  title?: string;
  author?: Array<{ given?: string; family?: string; literal?: string }>;
  confidence: "high" | "medium" | "low";
  missingFields: string[];
  evidence: Array<{ kind: "regex" | "parser"; note: string }>;
};

export type ParseResult = {
  records: CitationRecord[];
  warnings: string[];
};

