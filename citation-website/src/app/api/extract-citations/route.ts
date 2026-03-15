import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ── helpers ──────────────────────────────────────────────────────────────────

function extractDois(text: string): string[] {
  const re = /\b10\.\d{4,9}\/[^\s"'<>),;]+/gi;
  return [...new Set([...text.matchAll(re)].map((m) => m[0].replace(/[.,)]+$/, "")))];
}

/**
 * Extract author-year style in-text citations, e.g.
 *   (Smith, 2020)  (Smith & Jones, 2019)  (Smith et al., 2018)
 * Returns unique raw strings like "Smith, 2020"
 */
function extractAuthorYearCitations(text: string): string[] {
  const re =
    /\(([A-Z][A-Za-zÀ-ÖØ-öø-ÿ\-']+(?:\s+et\s+al\.?|\s*[&,]\s*[A-Z][A-Za-zÀ-ÖØ-öø-ÿ\-']+)*),?\s*((?:19|20)\d{2}[a-z]?(?:\s*[,;]\s*(?:19|20)\d{2}[a-z]?)*)\)/g;
  const found: string[] = [];
  for (const m of text.matchAll(re)) {
    found.push(`${m[1].trim()}, ${m[2].trim()}`);
  }
  return [...new Set(found)];
}

/**
 * Extract numbered in-text citations [1], [1,2], [1-3]
 * Returns the unique numbers found.
 */
function extractNumberedRefs(text: string): number[] {
  const re = /\[(\d+(?:[,\-–]\d+)*)\]/g;
  const nums = new Set<number>();
  for (const m of text.matchAll(re)) {
    const part = m[1];
    if (part.includes("-") || part.includes("–")) {
      const [a, b] = part.split(/[-–]/).map(Number);
      for (let i = a; i <= b; i++) nums.add(i);
    } else {
      part.split(",").map(Number).forEach((n) => nums.add(n));
    }
  }
  return [...nums].sort((a, b) => a - b);
}

// ── Crossref lookup ───────────────────────────────────────────────────────────

async function lookupByDoi(doi: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": "CitationWebsite/1.0 (mailto:help@example.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.message ?? null;
  } catch {
    return null;
  }
}

async function searchCrossref(query: string): Promise<any[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3&select=DOI,title,author,issued,type,publisher,container-title,URL`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "CitationWebsite/1.0 (mailto:help@example.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.message?.items ?? [];
  } catch {
    return [];
  }
}

async function searchSemanticScholar(query: string): Promise<any[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=3&fields=title,authors,year,externalIds,url,publicationVenue,openAccessPdf`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── normalise to CitationRecord-like shape ────────────────────────────────────

function crossrefItemToRecord(raw: string, item: any) {
  const doi = item.DOI as string | undefined;
  const title = Array.isArray(item.title) ? item.title[0] : (item.title as string | undefined);
  const authors: Array<{ given?: string; family?: string; literal?: string }> =
    Array.isArray(item.author)
      ? item.author.map((a: any) => ({ given: a.given, family: a.family, literal: a.name }))
      : [];
  const issued = item.issued?.["date-parts"]?.[0];
  const year = Array.isArray(issued) ? (issued[0] as number) : undefined;
  const url = doi ? `https://doi.org/${doi}` : (item.URL as string | undefined);
  const journal = Array.isArray(item["container-title"])
    ? item["container-title"][0]
    : (item["container-title"] as string | undefined);
  const missing: string[] = [];
  if (!authors.length) missing.push("author");
  if (!year) missing.push("year");
  if (!title) missing.push("title");
  return {
    id: crypto.randomUUID(),
    raw,
    doi,
    url,
    title,
    author: authors,
    year,
    journal,
    publisher: item.publisher as string | undefined,
    type: item.type as string | undefined,
    confidence: "high" as const,
    missingFields: missing,
    source: "crossref" as const,
    verifyUrl: doi ? `https://doi.org/${doi}` : url,
    crossrefUrl: doi ? `https://api.crossref.org/works/${doi}` : undefined,
    csl: {
      id: doi ?? raw,
      type: item.type ?? "article-journal",
      title,
      author: authors,
      issued: year ? { "date-parts": [[year]] } : undefined,
      DOI: doi,
      URL: url,
      "container-title": journal,
      publisher: item.publisher,
    },
  };
}

function semanticScholarToRecord(raw: string, item: any) {
  const doi = item.externalIds?.DOI as string | undefined;
  const url = item.url as string | undefined;
  const pdfUrl = item.openAccessPdf?.url as string | undefined;
  const authors = Array.isArray(item.authors)
    ? item.authors.map((a: any) => {
        const parts = (a.name as string).split(" ");
        return { given: parts.slice(0, -1).join(" "), family: parts.at(-1) };
      })
    : [];
  const year = item.year as number | undefined;
  const title = item.title as string | undefined;
  const missing: string[] = [];
  if (!authors.length) missing.push("author");
  if (!year) missing.push("year");
  if (!title) missing.push("title");
  return {
    id: crypto.randomUUID(),
    raw,
    doi,
    url: pdfUrl ?? url,
    title,
    author: authors,
    year,
    journal: item.publicationVenue?.name as string | undefined,
    confidence: doi ? ("high" as const) : ("medium" as const),
    missingFields: missing,
    source: "semantic_scholar" as const,
    verifyUrl: url,
    semanticScholarUrl: url,
    csl: {
      id: doi ?? raw,
      type: "article-journal",
      title,
      author: authors,
      issued: year ? { "date-parts": [[year]] } : undefined,
      DOI: doi,
      URL: pdfUrl ?? url,
    },
  };
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "缺少 text 字段" }, { status: 400 });
  }

  const results: any[] = [];
  const seen = new Set<string>();

  // 1. Extract DOIs directly → lookup via Crossref
  const dois = extractDois(text);
  await Promise.all(
    dois.map(async (doi) => {
      if (seen.has(doi)) return;
      seen.add(doi);
      const item = await lookupByDoi(doi);
      if (item) results.push(crossrefItemToRecord(doi, item));
    })
  );

  // 2. Extract author-year citations → search Crossref + Semantic Scholar
  const ayRefs = extractAuthorYearCitations(text);
  await Promise.all(
    ayRefs.map(async (ref) => {
      if (seen.has(ref)) return;
      seen.add(ref);
      const [crItems, ssItems] = await Promise.all([
        searchCrossref(ref),
        searchSemanticScholar(ref),
      ]);
      if (crItems.length > 0) {
        results.push(crossrefItemToRecord(ref, crItems[0]));
      } else if (ssItems.length > 0) {
        results.push(semanticScholarToRecord(ref, ssItems[0]));
      }
    })
  );

  // 3. If numbered refs found but no author-year, flag them
  const numberedRefs = extractNumberedRefs(text);
  const extractedInTextCount = dois.length + ayRefs.length;
  const warnings: string[] = [];
  if (numberedRefs.length > 0 && extractedInTextCount === 0) {
    warnings.push(
      `检测到 ${numberedRefs.length} 处数字引用标注（如 [1]、[2]）。请同时上传或粘贴参考文献列表，系统将自动匹配。`
    );
  }
  if (results.length === 0 && extractedInTextCount === 0) {
    warnings.push("未在文章中检测到可识别的引用标注（DOI、作者年份格式、数字编号）。请确认文章包含正文引用。");
  }

  return NextResponse.json({ results, warnings, stats: { dois: dois.length, authorYear: ayRefs.length, numbered: numberedRefs.length } });
}
