import Cite from "citation-js";
import type { CitationRecord, ParseResult } from "./types";

const STYLE_MAP: Record<string, string> = {
  apa: "apa",
  mla: "modern-language-association",
  "chicago-author-date": "chicago-author-date",
  ieee: "ieee",
  "harvard-cite-them-right": "harvard1",
  vancouver: "vancouver",
};

function toCslItems(records: CitationRecord[]): any[] {
  return records.map((r) => r.csl || { title: r.title ?? r.raw });
}

export function renderBibliography(
  parsed: ParseResult,
  styleId: keyof typeof STYLE_MAP
): string[] {
  const items = toCslItems(parsed.records);
  if (items.length === 0) return [];
  const cite = new (Cite as any)(items);
  const style = STYLE_MAP[styleId];
  const result: string = cite.format("bibliography", {
    format: "text",
    template: style,
    lang: "en-US",
  });
  return result
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function renderInText(
  parsed: ParseResult,
  styleId: keyof typeof STYLE_MAP
): string[] {
  const items = toCslItems(parsed.records);
  if (items.length === 0) return [];
  const cite = new (Cite as any)(items);
  const style = STYLE_MAP[styleId];
  const result: string = cite.format("citation", {
    format: "text",
    template: style,
    lang: "en-US",
  });
  return result
    .split(/;\s*/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function exportAs(
  parsed: ParseResult,
  kind: "ris" | "bibtex" | "csl-json"
): string {
  const items = toCslItems(parsed.records);
  if (items.length === 0) return "";
  const cite = new (Cite as any)(items);
  if (kind === "ris") {
    return cite.format("ris");
  }
  if (kind === "bibtex") {
    return cite.format("bibtex");
  }
  return cite.format("data", { format: "string" });
}

