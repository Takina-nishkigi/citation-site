import Cite from "citation-js";
import type { CitationRecord, ParseResult } from "./types";

function makeBaseRecord(raw: string): CitationRecord {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    raw,
    confidence: "low",
    missingFields: [],
    evidence: [],
  };
}

function fromCslItem(raw: string, item: any): CitationRecord {
  const rec = makeBaseRecord(raw);
  rec.csl = item;
  rec.doi = item.DOI || item.doi;
  rec.url = item.URL || item.url;
  rec.title = item.title;
  if (Array.isArray(item.author)) {
    rec.author = item.author.map((a: any) => ({
      given: a.given,
      family: a.family,
      literal: a.literal,
    }));
  }
  const issued = item.issued?.["date-parts"]?.[0];
  if (Array.isArray(issued) && typeof issued[0] === "number") {
    rec.year = issued[0];
  }
  rec.confidence = "high";

  const missing: string[] = [];
  if (!rec.author || rec.author.length === 0) missing.push("author");
  if (!rec.year) missing.push("year");
  if (!rec.title) missing.push("title");
  rec.missingFields = missing;
  rec.evidence.push({ kind: "parser", note: "Parsed via citation-js" });

  return rec;
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function tryParseWithCitationJs(input: string): CitationRecord[] {
  try {
    const cite = new (Cite as any)(input);
    const items: any[] = cite.format("data", { format: "object" });
    if (!Array.isArray(items) || items.length === 0) return [];
    return items.map((it) => fromCslItem(input, it));
  } catch {
    return [];
  }
}

function parseHeuristicLine(line: string): CitationRecord {
  const rec = makeBaseRecord(line);

  const doiMatch = line.match(/\b10\.\d{4,9}\/\S+\b/i);
  if (doiMatch) {
    rec.doi = doiMatch[0].replace(/[).,]+$/, "");
    rec.evidence.push({ kind: "regex", note: "Matched DOI pattern" });
  }

  const urlMatch = line.match(/\bhttps?:\/\/\S+/i);
  if (urlMatch) {
    rec.url = urlMatch[0].replace(/[).,]+$/, "");
    rec.evidence.push({ kind: "regex", note: "Matched URL" });
  }

  const yearMatch = line.match(/\((19|20)\d{2}\)/);
  if (yearMatch) {
    rec.year = parseInt(yearMatch[0].slice(1, -1), 10);
    rec.evidence.push({ kind: "regex", note: "Matched year in parentheses" });
  }

  const plainYearMatch = line.match(/\b(19|20)\d{2}\b/);
  if (!rec.year && plainYearMatch) {
    rec.year = parseInt(plainYearMatch[0], 10);
    rec.evidence.push({ kind: "regex", note: "Matched standalone year" });
  }

  const titleCandidate = line.replace(/^\d+[\).\]]\s*/, "").split(". ")[0];
  if (titleCandidate && titleCandidate.length > 5) {
    rec.title = titleCandidate;
  }

  const missing: string[] = [];
  if (!rec.title) missing.push("title");
  if (!rec.year) missing.push("year");
  rec.missingFields = missing;
  rec.confidence =
    rec.doi || (rec.title && rec.year) ? "medium" : "low";

  return rec;
}

export function parseBibliographyText(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { records: [], warnings: [] };
  }

  const viaCsl = tryParseWithCitationJs(trimmed);
  if (viaCsl.length > 0) {
    return { records: viaCsl, warnings: [] };
  }

  const lines = splitLines(trimmed);
  const numberedBlocks: string[] = [];
  let current = "";
  let currentIndex = 0;

  const flushCurrent = () => {
    if (current.trim()) numberedBlocks.push(current.trim());
    current = "";
  };

  for (const line of lines) {
    const numStart = line.match(/^(\d+)[\).\]]\s+/);
    if (numStart) {
      const idx = parseInt(numStart[1], 10);
      if (idx > currentIndex) {
        flushCurrent();
        currentIndex = idx;
        current = line;
      } else {
        current += " " + line;
      }
    } else if (/^(References|Works Cited|Bibliography)\b/i.test(line)) {
      continue;
    } else {
      if (!current) {
        current = line;
      } else {
        current += " " + line;
      }
    }
  }
  flushCurrent();

  const units =
    numberedBlocks.length > 0 ? numberedBlocks : lines;

  const records = units.map(parseHeuristicLine);

  const warnings: string[] = [];
  if (viaCsl.length === 0) {
    warnings.push(
      "未能识别为标准 RIS/BibTeX/CSL-JSON，改用启发式解析；请在人机审阅界面中仔细检查每条引用。"
    );
  }

  return { records, warnings };
}

