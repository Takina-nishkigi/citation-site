import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function crossrefByDoi(doi: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": "CitationWebsite/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.message ?? null;
  } catch { return null; }
}

async function crossrefSearch(query: string): Promise<any[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=5&select=DOI,title,author,issued,type,publisher,container-title,URL`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "CitationWebsite/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.message?.items ?? [];
  } catch { return []; }
}

async function semanticScholarSearch(query: string): Promise<any[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=5&fields=title,authors,year,externalIds,url,publicationVenue,openAccessPdf,abstract`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.data ?? [];
  } catch { return []; }
}

async function openLibrarySearch(query: string): Promise<any[]> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=key,title,author_name,first_publish_year,isbn,publisher`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.docs ?? [];
  } catch { return []; }
}

function normalizeCrossref(item: any, query: string) {
  const doi = item.DOI as string | undefined;
  const title = Array.isArray(item.title) ? item.title[0] : item.title;
  const authors = Array.isArray(item.author)
    ? item.author.map((a: any) => ({ given: a.given, family: a.family, literal: a.name }))
    : [];
  const issued = item.issued?.["date-parts"]?.[0];
  const year = Array.isArray(issued) ? issued[0] : undefined;
  const journal = Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"];
  return {
    id: crypto.randomUUID(),
    raw: query,
    source: "crossref",
    doi,
    url: doi ? `https://doi.org/${doi}` : item.URL,
    verifyUrl: doi ? `https://doi.org/${doi}` : item.URL,
    title,
    author: authors,
    year,
    journal,
    publisher: item.publisher,
    type: item.type ?? "article-journal",
    confidence: "high",
    missingFields: [...(!authors.length ? ["author"] : []), ...(!year ? ["year"] : []), ...(!title ? ["title"] : [])],
    csl: {
      id: doi ?? crypto.randomUUID(),
      type: item.type ?? "article-journal",
      title,
      author: authors,
      issued: year ? { "date-parts": [[year]] } : undefined,
      DOI: doi,
      URL: doi ? `https://doi.org/${doi}` : item.URL,
      "container-title": journal,
      publisher: item.publisher,
    },
  };
}

function normalizeSemanticScholar(item: any, query: string) {
  const doi = item.externalIds?.DOI as string | undefined;
  const url = item.url as string | undefined;
  const pdfUrl = item.openAccessPdf?.url as string | undefined;
  const authors = Array.isArray(item.authors)
    ? item.authors.map((a: any) => {
        const parts = (a.name as string || "").split(" ");
        return { given: parts.slice(0, -1).join(" "), family: parts.at(-1) ?? "" };
      })
    : [];
  return {
    id: crypto.randomUUID(),
    raw: query,
    source: "semantic_scholar",
    doi,
    url: pdfUrl ?? url,
    verifyUrl: url,
    title: item.title,
    author: authors,
    year: item.year,
    journal: item.publicationVenue?.name,
    abstract: item.abstract,
    type: "article-journal",
    confidence: doi ? "high" : "medium",
    missingFields: [...(!authors.length ? ["author"] : []), ...(!item.year ? ["year"] : []), ...(!item.title ? ["title"] : [])],
    csl: {
      id: doi ?? crypto.randomUUID(),
      type: "article-journal",
      title: item.title,
      author: authors,
      issued: item.year ? { "date-parts": [[item.year]] } : undefined,
      DOI: doi,
      URL: pdfUrl ?? url,
    },
  };
}

function normalizeOpenLibrary(item: any, query: string) {
  const authors = Array.isArray(item.author_name)
    ? item.author_name.map((name: string) => {
        const parts = name.split(" ");
        return { given: parts.slice(0, -1).join(" "), family: parts.at(-1) ?? name };
      })
    : [];
  const isbn = Array.isArray(item.isbn) ? item.isbn[0] : undefined;
  const olUrl = item.key ? `https://openlibrary.org${item.key}` : undefined;
  return {
    id: crypto.randomUUID(),
    raw: query,
    source: "open_library",
    doi: undefined,
    url: olUrl,
    verifyUrl: olUrl,
    title: item.title,
    author: authors,
    year: item.first_publish_year,
    publisher: Array.isArray(item.publisher) ? item.publisher[0] : item.publisher,
    isbn,
    type: "book",
    confidence: "medium",
    missingFields: [...(!authors.length ? ["author"] : []), ...(!item.first_publish_year ? ["year"] : []), ...(!item.title ? ["title"] : [])],
    csl: {
      id: isbn ?? crypto.randomUUID(),
      type: "book",
      title: item.title,
      author: authors,
      issued: item.first_publish_year ? { "date-parts": [[item.first_publish_year]] } : undefined,
      publisher: Array.isArray(item.publisher) ? item.publisher[0] : item.publisher,
      ISBN: isbn,
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const doi = searchParams.get("doi");
  const query = searchParams.get("query");
  const kind = searchParams.get("kind") ?? "all"; // "all" | "paper" | "book"

  if (!doi && !query) {
    return NextResponse.json({ error: "需要 doi 或 query 参数" }, { status: 400 });
  }

  const results: any[] = [];

  if (doi) {
    const item = await crossrefByDoi(doi);
    if (item) results.push(normalizeCrossref(item, doi));
  }

  if (query) {
    const searchQuery = query;
    const promises: Promise<void>[] = [];

    if (kind !== "book") {
      promises.push(
        crossrefSearch(searchQuery).then((items) => {
          items.slice(0, 3).forEach((it) => results.push(normalizeCrossref(it, searchQuery)));
        }),
        semanticScholarSearch(searchQuery).then((items) => {
          items.slice(0, 3).forEach((it) => results.push(normalizeSemanticScholar(it, searchQuery)));
        })
      );
    }

    if (kind !== "paper") {
      promises.push(
        openLibrarySearch(searchQuery).then((items) => {
          items.slice(0, 2).forEach((it) => results.push(normalizeOpenLibrary(it, searchQuery)));
        })
      );
    }

    await Promise.all(promises);
  }

  // Deduplicate by DOI
  const seen = new Set<string>();
  const deduped = results.filter((r) => {
    const key = r.doi ?? r.title ?? r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ results: deduped });
}
