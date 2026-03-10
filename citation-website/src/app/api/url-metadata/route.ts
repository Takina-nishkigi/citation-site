import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Fetch failed with status ${res.status}`);
  }
  return await res.text();
}

function extractMeta(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const ogTitleMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const metaDescMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const doiMatch =
    html.match(/\b10\.\d{4,9}\/\S+?(?=["'<\s])/i) ||
    html.match(/doi:\s*(10\.\d{4,9}\/\S+)/i);

  return {
    title:
      (ogTitleMatch && ogTitleMatch[1]) ||
      (titleMatch && titleMatch[1]) ||
      undefined,
    description: metaDescMatch ? metaDescMatch[1] : undefined,
    doi: doiMatch ? doiMatch[1] : undefined,
  };
}

async function fetchCrossref(doi: string) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.message;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json(
      { error: "缺少 url 参数" },
      { status: 400 }
    );
  }

  try {
    const html = await fetchHtml(target);
    const meta = extractMeta(html);
    let crossref: any = null;
    if (meta.doi) {
      crossref = await fetchCrossref(meta.doi);
    }
    return NextResponse.json({
      url: target,
      meta,
      crossref,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "抓取失败" },
      { status: 500 }
    );
  }
}

