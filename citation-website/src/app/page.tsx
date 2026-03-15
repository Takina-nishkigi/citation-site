"use client";

import { useMemo, useState } from "react";
import { parseBibliographyText } from "@/lib/citations/parse";
import { renderBibliography, renderInText, exportAs } from "@/lib/citations/render";
import type { CitationRecord } from "@/lib/citations/types";

const STYLE_OPTIONS = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "chicago-author-date", label: "Chicago (Author-Date)" },
  { id: "ieee", label: "IEEE" },
  { id: "harvard-cite-them-right", label: "Harvard" },
  { id: "vancouver", label: "Vancouver" },
];

// ── shared types ──────────────────────────────────────────────────────────────

type ExtractedCitation = {
  id: string;
  raw: string;
  source: "crossref" | "semantic_scholar" | "open_library";
  doi?: string;
  url?: string;
  verifyUrl?: string;
  title?: string;
  author?: Array<{ given?: string; family?: string; literal?: string }>;
  year?: number;
  journal?: string;
  publisher?: string;
  abstract?: string;
  type?: string;
  confidence: "high" | "medium" | "low";
  missingFields: string[];
  csl?: any;
};

type LookupResult = ExtractedCitation & { semanticScholarUrl?: string; crossrefUrl?: string; isbn?: string };

// ── helpers ───────────────────────────────────────────────────────────────────

function sourceLabel(source: string) {
  if (source === "crossref") return "Crossref";
  if (source === "semantic_scholar") return "Semantic Scholar";
  if (source === "open_library") return "Open Library";
  return source;
}

function sourceBadgeColor(source: string) {
  if (source === "crossref") return "bg-blue-100 text-blue-700";
  if (source === "semantic_scholar") return "bg-purple-100 text-purple-700";
  if (source === "open_library") return "bg-green-100 text-green-700";
  return "bg-zinc-100 text-zinc-600";
}

function confidenceColor(c: string) {
  if (c === "high") return "text-emerald-600";
  if (c === "medium") return "text-amber-500";
  return "text-red-500";
}

function formatAuthor(a: { given?: string; family?: string; literal?: string }) {
  if (a.literal) return a.literal;
  return [a.family, a.given].filter(Boolean).join(", ");
}

// ── Search / Lookup tab ───────────────────────────────────────────────────────

function LookupTab() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "paper" | "book">("all");
  const [styleId, setStyleId] = useState("apa");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelected(new Set());
    try {
      const doiMatch = query.trim().match(/\b10\.\d{4,9}\/\S+/);
      const params = new URLSearchParams({ kind });
      if (doiMatch) params.set("doi", doiMatch[0]);
      else params.set("query", query.trim());
      const res = await fetch(`/api/lookup-citation?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "查询失败"); return; }
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) setError("未找到相关文献，请尝试更换关键词。");
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedResults = results.filter((r) => selected.has(r.id));

  const renderedBibliography = useMemo(() => {
    if (selectedResults.length === 0) return [];
    try {
      const Cite = require("citation-js");
      const items = selectedResults.map((r) => r.csl).filter(Boolean);
      const cite = new Cite(items);
      const STYLE_MAP: Record<string, string> = {
        apa: "apa", mla: "modern-language-association",
        "chicago-author-date": "chicago-author-date", ieee: "ieee",
        "harvard-cite-them-right": "harvard1", vancouver: "vancouver",
      };
      return (cite.format("bibliography", { format: "text", template: STYLE_MAP[styleId], lang: "en-US" }) as string)
        .split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    } catch { return []; }
  }, [selectedResults, styleId]);

  const handleExportSelected = (kind2: "ris" | "bibtex" | "csl-json") => {
    if (selectedResults.length === 0) return;
    try {
      const Cite = require("citation-js");
      const items = selectedResults.map((r) => r.csl).filter(Boolean);
      const cite = new Cite(items);
      let text = "";
      if (kind2 === "ris") text = cite.format("ris");
      else if (kind2 === "bibtex") text = cite.format("bibtex");
      else text = cite.format("data", { format: "string" });
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `citations.${kind2 === "csl-json" ? "json" : kind2}`; a.click();
      URL.revokeObjectURL(url);
    } catch { }
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-zinc-700">
          输入标题、作者、关键词或 DOI — 系统将通过 Crossref、Semantic Scholar、Open Library 联网查找
        </div>
        <div className="flex gap-2">
          <input
            className="h-10 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
            placeholder="e.g. attention is all you need  /  Smith 2020 machine learning  /  10.1145/..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none"
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
          >
            <option value="all">论文 + 书籍</option>
            <option value="paper">仅论文</option>
            <option value="book">仅书籍</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="h-10 rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "查询中…" : "查找"}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-zinc-700">找到 {results.length} 条结果 — 勾选后生成引用</span>
            <select
              className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs outline-none"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
            >
              {STYLE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {selectedResults.length > 0 && (
              <div className="flex gap-2">
                {(["ris", "bibtex", "csl-json"] as const).map((k) => (
                  <button key={k} onClick={() => handleExportSelected(k)}
                    className="h-7 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-50">
                    导出 {k.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.id}
                className={`rounded-xl border p-4 transition-colors ${selected.has(r.id) ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-zinc-900"
                    checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sourceBadgeColor(r.source)}`}>
                        {sourceLabel(r.source)}
                      </span>
                      <span className={`text-[11px] font-medium ${confidenceColor(r.confidence)}`}>
                        {r.confidence === "high" ? "✓ 高可信" : r.confidence === "medium" ? "△ 中等可信" : "✗ 低可信"}
                      </span>
                      {r.type && <span className="text-[11px] text-zinc-400">{r.type}</span>}
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 leading-snug">{r.title ?? "(无标题)"}</p>
                    {r.author && r.author.length > 0 && (
                      <p className="text-xs text-zinc-600">
                        {r.author.slice(0, 5).map(formatAuthor).join("; ")}
                        {r.author.length > 5 ? ` 等 ${r.author.length} 人` : ""}
                        {r.year ? ` · ${r.year}` : ""}
                      </p>
                    )}
                    {r.journal && <p className="text-xs text-zinc-500 italic">{r.journal}</p>}
                    {r.publisher && <p className="text-xs text-zinc-500">出版商：{r.publisher}</p>}
                    {r.abstract && (
                      <p className="text-[11px] text-zinc-500 line-clamp-2">{r.abstract}</p>
                    )}
                    {/* Verification links */}
                    <div className="flex flex-wrap gap-3 pt-1">
                      {r.doi && (
                        <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 underline underline-offset-2 hover:text-blue-800">
                          🔗 DOI: {r.doi}
                        </a>
                      )}
                      {r.verifyUrl && r.verifyUrl !== `https://doi.org/${r.doi}` && (
                        <a href={r.verifyUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 underline underline-offset-2 hover:text-blue-800">
                          🔗 在线查看
                        </a>
                      )}
                      {r.crossrefUrl && (
                        <a href={r.crossrefUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 underline underline-offset-2 hover:text-zinc-600">
                          Crossref 元数据
                        </a>
                      )}
                    </div>
                    {r.missingFields.length > 0 && (
                      <p className="text-[10px] text-amber-600">缺失字段：{r.missingFields.join("、")}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Formatted bibliography for selected */}
          {renderedBibliography.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-800">已选引用 — {STYLE_OPTIONS.find(s=>s.id===styleId)?.label} 格式</h3>
                <button
                  onClick={() => { navigator.clipboard.writeText(renderedBibliography.join("\n")); }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 underline"
                >复制全部</button>
              </div>
              <ol className="space-y-1 text-xs text-zinc-700 list-decimal list-inside">
                {renderedBibliography.map((b, i) => <li key={i}>{b}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Extract tab ───────────────────────────────────────────────────────────────

function ExtractTab() {
  const [articleText, setArticleText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExtractedCitation[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ dois: number; authorYear: number; numbered: number } | null>(null);
  const [styleId, setStyleId] = useState("apa");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [docxUploading, setDocxUploading] = useState(false);

  const handleExtract = async () => {
    if (!articleText.trim()) return;
    setLoading(true);
    setWarnings([]);
    setResults([]);
    setSelected(new Set());
    try {
      const res = await fetch("/api/extract-citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: articleText }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
      setWarnings(data.warnings ?? []);
      setStats(data.stats ?? null);
    } catch {
      setWarnings(["提取失败，请检查网络后重试。"]);
    } finally {
      setLoading(false);
    }
  };

  const handleDocxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocxUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "extract");
      const res = await fetch("/api/docx", { method: "POST", body: fd });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.text === "string") setArticleText(data.text);
    } finally {
      setDocxUploading(false);
      e.target.value = "";
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(results.map((r) => r.id)));
  const clearAll = () => setSelected(new Set());

  const selectedResults = results.filter((r) => selected.has(r.id));

  const renderedBibliography = useMemo(() => {
    if (selectedResults.length === 0) return [];
    try {
      const Cite = require("citation-js");
      const items = selectedResults.map((r) => r.csl).filter(Boolean);
      if (items.length === 0) return [];
      const cite = new Cite(items);
      const STYLE_MAP: Record<string, string> = {
        apa: "apa", mla: "modern-language-association",
        "chicago-author-date": "chicago-author-date", ieee: "ieee",
        "harvard-cite-them-right": "harvard1", vancouver: "vancouver",
      };
      return (cite.format("bibliography", { format: "text", template: STYLE_MAP[styleId], lang: "en-US" }) as string)
        .split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    } catch { return []; }
  }, [selectedResults, styleId]);

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700">
            粘贴文章正文 — 系统自动识别引用标注并联网查找完整信息
          </label>
          <label className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100">
            {docxUploading ? "解析中…" : "📄 从 Word 导入"}
            <input type="file" accept=".docx" onChange={handleDocxImport} className="hidden" />
          </label>
        </div>
        <textarea
          className="h-56 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
          placeholder={`粘贴你的论文/文章正文到这里。支持以下引用格式：\n• 作者年份格式：(Smith, 2020)、(Smith & Jones, 2019)、(Smith et al., 2018)\n• DOI 直接嵌入：10.1145/3306618.3314236\n• 数字编号格式：[1]、[2,3]（需同时粘贴参考文献列表）`}
          value={articleText}
          onChange={(e) => setArticleText(e.target.value)}
        />
        <button
          onClick={handleExtract}
          disabled={loading || !articleText.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? (
            <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> 联网查找中…</>
          ) : "🔍 提取并查找引用"}
        </button>
        {warnings.map((w, i) => (
          <p key={i} className="text-xs text-amber-600">⚠ {w}</p>
        ))}
        {stats && (
          <p className="text-[11px] text-zinc-400">
            检测到：DOI {stats.dois} 个 · 作者年份 {stats.authorYear} 个 · 数字引用 {stats.numbered} 个
          </p>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-zinc-700">找到 {results.length} 条引用</span>
            <button onClick={selectAll} className="text-xs text-zinc-500 underline hover:text-zinc-800">全选</button>
            <button onClick={clearAll} className="text-xs text-zinc-500 underline hover:text-zinc-800">取消全选</button>
            <select
              className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs outline-none"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
            >
              {STYLE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {results.map((r, idx) => (
              <div key={r.id}
                className={`rounded-xl border p-4 transition-colors ${selected.has(r.id) ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-zinc-900"
                    checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-400">#{idx + 1}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sourceBadgeColor(r.source)}`}>
                        {sourceLabel(r.source)}
                      </span>
                      <span className={`text-[11px] font-medium ${confidenceColor(r.confidence)}`}>
                        {r.confidence === "high" ? "✓ 高可信" : r.confidence === "medium" ? "△ 中等可信" : "✗ 低可信"}
                      </span>
                    </div>
                    <div className="rounded border border-dashed border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-400">
                      原文标注：{r.raw}
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 leading-snug">{r.title ?? "(无标题)"}</p>
                    {r.author && r.author.length > 0 && (
                      <p className="text-xs text-zinc-600">
                        {r.author.slice(0, 5).map(formatAuthor).join("; ")}
                        {r.author.length > 5 ? ` 等 ${r.author.length} 人` : ""}
                        {r.year ? ` · ${r.year}` : ""}
                      </p>
                    )}
                    {r.journal && <p className="text-xs text-zinc-500 italic">{r.journal}</p>}
                    {/* Verification links */}
                    <div className="flex flex-wrap gap-3 pt-1">
                      {r.doi && (
                        <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 underline underline-offset-2 hover:text-blue-800">
                          🔗 DOI: {r.doi}
                        </a>
                      )}
                      {r.verifyUrl && r.verifyUrl !== `https://doi.org/${r.doi}` && (
                        <a href={r.verifyUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 underline underline-offset-2 hover:text-blue-800">
                          🔗 在线查看
                        </a>
                      )}
                    </div>
                    {r.missingFields.length > 0 && (
                      <p className="text-[10px] text-amber-600">缺失字段：{r.missingFields.join("、")}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {renderedBibliography.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-800">
                  已选 {selectedResults.length} 条 — {STYLE_OPTIONS.find(s => s.id === styleId)?.label} 格式参考文献
                </h3>
                <button onClick={() => navigator.clipboard.writeText(renderedBibliography.join("\n"))}
                  className="text-[11px] text-zinc-500 underline hover:text-zinc-800">复制全部</button>
              </div>
              <ol className="space-y-1.5 text-xs text-zinc-700 list-decimal list-inside">
                {renderedBibliography.map((b, i) => <li key={i}>{b}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Organise tab (original functionality) ────────────────────────────────────

function OrganiseTab() {
  const [input, setInput] = useState("");
  const [styleId, setStyleId] = useState<string>("apa");
  const [records, setRecords] = useState<CitationRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [docxUploading, setDocxUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlStatus, setUrlStatus] = useState<string | null>(null);

  const parsed = useMemo(() => ({ records, warnings }), [records, warnings]);
  const bibliography = useMemo(() => renderBibliography(parsed, styleId as any), [parsed, styleId]);
  const inText = useMemo(() => renderInText(parsed, styleId as any), [parsed, styleId]);

  const handleParse = () => {
    const result = parseBibliographyText(input);
    setRecords(result.records);
    setWarnings(result.warnings);
  };

  const handleRecordChange = (id: string, patch: Partial<CitationRecord>) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleUrlFetch = async () => {
    if (!urlInput.trim()) return;
    setUrlStatus("正在抓取 URL 与 Crossref 元数据…");
    try {
      const res = await fetch(`/api/url-metadata?url=${encodeURIComponent(urlInput.trim())}`);
      if (!res.ok) { setUrlStatus("抓取失败，请检查 URL 或稍后重试。"); return; }
      const data = await res.json();
      const meta = data.meta as { title?: string; doi?: string };
      const msg: string[] = [];
      if (meta.title) msg.push(`标题: ${meta.title}`);
      if (meta.doi) msg.push(`DOI: ${meta.doi}`);
      if (data.crossref) msg.push("Crossref: 已找到匹配记录。");
      setUrlStatus(msg.length > 0 ? msg.join(" ｜ ") : "抓取完成，但没有发现明显的标题或 DOI。");
    } catch {
      setUrlStatus("抓取失败，请检查网络。");
    }
  };

  const handleExport = (kind: "ris" | "bibtex" | "csl-json") => {
    const text = exportAs(parsed, kind);
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "ris" ? "citations.ris" : kind === "bibtex" ? "citations.bib" : "citations.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDocxExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocxUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("mode", "extract");
      const res = await fetch("/api/docx", { method: "POST", body: fd });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.text === "string") setInput(data.text);
    } finally { setDocxUploading(false); e.target.value = ""; }
  };

  const handleDocxExport = async () => {
    if (bibliography.length === 0) return;
    const fd = new FormData();
    fd.append("mode", "bibliography");
    fd.append("bibliography", bibliography.join("\n"));
    const res = await fetch("/api/docx", { method: "POST", body: fd });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "references.docx"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <label className="flex items-center justify-between text-sm font-medium text-zinc-700">
            输入参考文献列表
            <span className="text-xs font-normal text-zinc-500">支持普通列表、RIS、BibTeX、CSL-JSON</span>
          </label>
          <textarea
            className="h-64 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
            placeholder={`示例：\n1. Smith, J. (2020). Title. Journal, 10(2), 123-145.\n2. 张三. (2019). 一本书的标题. 北京: 某出版社。`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleParse}
              className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              解析参考文献
            </button>
            <label className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
              {docxUploading ? "解析中…" : "从 Word (.docx) 导入"}
              <input type="file" accept=".docx" onChange={handleDocxExtract} className="hidden" />
            </label>
          </div>
          {warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-600">
              {warnings.map((w, i) => <li key={i}>· {w}</li>)}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-zinc-700">引用格式</div>
              <select
                className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400"
                value={styleId} onChange={(e) => setStyleId(e.target.value)}>
                {STYLE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-zinc-700">导出</div>
              <div className="flex flex-wrap gap-2">
                {(["ris", "bibtex", "csl-json"] as const).map((k) => (
                  <button key={k} onClick={() => handleExport(k)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    {k.toUpperCase()}
                  </button>
                ))}
                <button onClick={handleDocxExport} disabled={bibliography.length === 0}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                  Word 参考文献页
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-medium text-zinc-700">选填：输入网页 URL 辅助补全标题/DOI</div>
            <div className="flex gap-2">
              <input
                className="h-8 flex-1 rounded border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-zinc-400"
                placeholder="https://example.com/article"
                value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
              <button onClick={handleUrlFetch}
                className="h-8 rounded-full bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800">
                抓取 URL
              </button>
            </div>
            {urlStatus && <p className="text-[10px] text-zinc-600">{urlStatus}</p>}
          </div>

          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">文内引用（In-text）</h2>
              <span className="text-xs text-zinc-500">共 {inText.length} 条</span>
            </div>
            <div className="space-y-1 text-xs text-zinc-700">
              {inText.length === 0 && <p className="text-zinc-400">解析后将在这里显示文内引用。</p>}
              {inText.map((c, i) => <p key={i}>[{i + 1}] {c}</p>)}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">参考文献表（Bibliography）</h2>
              <span className="text-xs text-zinc-500">共 {bibliography.length} 条</span>
            </div>
            <div className="space-y-1 text-xs text-zinc-700">
              {bibliography.length === 0 && <p className="text-zinc-400">解析后将在这里生成参考文献条目。</p>}
              {bibliography.map((b, i) => <p key={i}>[{i + 1}] {b}</p>)}
            </div>
          </div>
        </div>
      </div>

      {records.length > 0 && (
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-800">引用审阅与校正</h2>
            <p className="text-xs text-zinc-500">检查缺失字段后再导出</p>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-2 text-xs">
            {records.map((r, idx) => (
              <div key={r.id} className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700">#{idx + 1}</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {r.confidence === "high" ? "HIGH" : r.confidence === "medium" ? "MEDIUM" : "LOW"} CONFIDENCE
                  </span>
                </div>
                <div className="rounded border border-dashed border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600">{r.raw}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(["title", "year", "doi", "url"] as const).map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700 capitalize">{field}</label>
                      <input
                        className="h-7 w-full rounded border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-zinc-400"
                        value={(r as any)[field] ?? ""}
                        onChange={(e) => handleRecordChange(r.id, { [field]: field === "year" ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                {r.missingFields.length > 0 && (
                  <div className="text-[10px] text-amber-700">缺失字段：{r.missingFields.join("、")}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

type Tab = "extract" | "lookup" | "organise";

export default function Home() {
  const [tab, setTab] = useState<Tab>("extract");

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: "extract", label: "📄 从文章提取", desc: "上传/粘贴文章，自动识别引用并联网补全" },
    { id: "lookup", label: "🔍 查找文献", desc: "通过标题、作者、DOI 搜索并生成引用" },
    { id: "organise", label: "📋 整理引用", desc: "手动粘贴引用列表进行格式转换" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Citation Website · 智能引用助手
          </h1>
          <p className="max-w-2xl text-sm text-zinc-500">
            从文章中提取引用 · 通过互联网查找文献 · 多格式（APA / MLA / Chicago / IEEE / Harvard / Vancouver）输出 · 附验证链接
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <div>{t.label}</div>
              <div className={`mt-0.5 text-[10px] font-normal ${tab === t.id ? "text-zinc-500" : "text-zinc-400"}`}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "extract" && <ExtractTab />}
        {tab === "lookup" && <LookupTab />}
        {tab === "organise" && <OrganiseTab />}
      </main>
    </div>
  );
}
