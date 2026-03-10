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

export default function Home() {
  const [input, setInput] = useState("");
  const [styleId, setStyleId] = useState<string>("apa");
  const [records, setRecords] = useState<CitationRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [docxUploading, setDocxUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlStatus, setUrlStatus] = useState<string | null>(null);

  const parsed = useMemo(
    () => ({ records, warnings }),
    [records, warnings]
  );

  const bibliography = useMemo(
    () => renderBibliography(parsed, styleId as any),
    [parsed, styleId]
  );

  const inText = useMemo(
    () => renderInText(parsed, styleId as any),
    [parsed, styleId]
  );

  const handleParse = () => {
    const result = parseBibliographyText(input);
    setRecords(result.records);
    setWarnings(result.warnings);
  };

  const handleRecordChange = (id: string, patch: Partial<CitationRecord>) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const handleUrlFetch = async () => {
    if (!urlInput.trim()) return;
    setUrlStatus("正在抓取 URL 与 Crossref 元数据…");
    try {
      const res = await fetch(
        `/api/url-metadata?url=${encodeURIComponent(urlInput.trim())}`
      );
      if (!res.ok) {
        setUrlStatus("抓取失败，请检查 URL 或稍后重试。");
        return;
      }
      const data = await res.json();
      const meta = data.meta as { title?: string; doi?: string };
      const msg: string[] = [];
      if (meta.title) msg.push(`标题: ${meta.title}`);
      if (meta.doi) msg.push(`DOI: ${meta.doi}`);
      if (data.crossref) {
        msg.push("Crossref: 已找到匹配记录，可用于人工核对。");
      }
      setUrlStatus(
        msg.length > 0
          ? msg.join(" ｜ ")
          : "抓取完成，但没有发现明显的标题或 DOI。"
      );
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
    a.download =
      kind === "ris"
        ? "citations.ris"
        : kind === "bibtex"
        ? "citations.bib"
        : "citations.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDocxExtract = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocxUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "extract");
      const res = await fetch("/api/docx", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        console.error(await res.text());
        return;
      }
      const data = await res.json();
      if (typeof data.text === "string") {
        setInput(data.text);
      }
    } finally {
      setDocxUploading(false);
      e.target.value = "";
    }
  };

  const handleDocxExport = async () => {
    if (bibliography.length === 0) return;
    const fd = new FormData();
    fd.append("mode", "bibliography");
    fd.append("bibliography", bibliography.join("\n"));
    const res = await fetch("/api/docx", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      console.error(await res.text());
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "references.docx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Citation Website · 引用抽取与多格式生成
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600 md:text-base">
            粘贴你的参考文献列表（或 BibTeX/RIS/CSL-JSON），一键生成 APA / MLA / Chicago / IEEE / Harvard / Vancouver
            的文内引用与参考文献表，并导出到文献管理软件。
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm font-medium text-zinc-700">
              输入参考文献列表
              <span className="text-xs font-normal text-zinc-500">
                支持普通列表、RIS、BibTeX、CSL-JSON
              </span>
            </label>
            <textarea
              className="h-64 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
              placeholder={`示例：
1. Smith, J. (2020). Title of the article. Journal Name, 10(2), 123-145. https://doi.org/10.1234/abcd.2020.01
2. 张三. (2019). 一本书的标题. 北京: 某出版社。`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleParse}
                className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
              >
                解析参考文献
              </button>
              <label className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50">
                {docxUploading ? "正在从 Word 解析…" : "从 Word (.docx) 导入"}
                <input
                  type="file"
                  accept=".docx"
                  onChange={handleDocxExtract}
                  className="hidden"
                />
              </label>
            </div>
            {warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-600">
                {warnings.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-zinc-700">
                  引用格式
                </div>
                <select
                  className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
                  value={styleId}
                  onChange={(e) => setStyleId(e.target.value)}
                >
                  {STYLE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-zinc-700">
                  导出
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleExport("ris")}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                  >
                    RIS
                  </button>
                  <button
                    onClick={() => handleExport("bibtex")}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                  >
                    BibTeX
                  </button>
                  <button
                    onClick={() => handleExport("csl-json")}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                  >
                    CSL-JSON
                  </button>
                  <button
                    onClick={handleDocxExport}
                    disabled={bibliography.length === 0}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Word 参考文献页
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-medium text-zinc-700">
                选填：输入网页 URL，辅助补全标题/DOI（需联网）
              </div>
              <div className="flex gap-2">
                <input
                  className="h-8 flex-1 rounded border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
                  placeholder="https://example.com/article"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleUrlFetch}
                  className="h-8 rounded-full bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  抓取 URL
                </button>
              </div>
              {urlStatus && (
                <p className="text-[10px] text-zinc-600">{urlStatus}</p>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">
                  文内引用（In-text）
                </h2>
                <span className="text-xs text-zinc-500">
                  共 {inText.length} 条
                </span>
              </div>
              <div className="space-y-1 text-xs text-zinc-700">
                {inText.length === 0 && (
                  <p className="text-zinc-400">解析后将在这里显示文内引用。</p>
                )}
                {inText.map((c, i) => (
                  <p key={i}>
                    [{i + 1}] {c}
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">
                  参考文献表（Bibliography）
                </h2>
                <span className="text-xs text-zinc-500">
                  共 {bibliography.length} 条
                </span>
              </div>
              <div className="space-y-1 text-xs text-zinc-700">
                {bibliography.length === 0 && (
                  <p className="text-zinc-400">
                    解析后将在这里按所选格式生成参考文献条目。
                  </p>
                )}
                {bibliography.map((b, i) => (
                  <p key={i}>
                    [{i + 1}] {b}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {records.length > 0 && (
          <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">
                引用审阅与校正（导出前请检查）
              </h2>
              <p className="text-xs text-zinc-500">
                每条缺失的关键信息会被标出来；你确认后再复制/导出，才能保证 100% 正确。
              </p>
            </div>
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-2 text-xs">
              {records.map((r, idx) => (
                <div
                  key={r.id}
                  className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700">
                      #{idx + 1}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {r.confidence === "high"
                        ? "HIGH CONFIDENCE"
                        : r.confidence === "medium"
                        ? "MEDIUM CONFIDENCE"
                        : "LOW CONFIDENCE"}
                    </span>
                  </div>
                  <div className="rounded border border-dashed border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600">
                    {r.raw}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        标题 / Title
                      </label>
                      <input
                        className="h-7 w-full rounded border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
                        value={r.title ?? ""}
                        onChange={(e) =>
                          handleRecordChange(r.id, { title: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        年份 / Year
                      </label>
                      <input
                        className="h-7 w-full rounded border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
                        value={r.year ?? ""}
                        onChange={(e) =>
                          handleRecordChange(r.id, {
                            year: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        DOI
                      </label>
                      <input
                        className="h-7 w-full rounded border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
                        value={r.doi ?? ""}
                        onChange={(e) =>
                          handleRecordChange(r.id, { doi: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700">
                        URL
                      </label>
                      <input
                        className="h-7 w-full rounded border border-zinc-200 bg-white px-2 text-[11px] outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
                        value={r.url ?? ""}
                        onChange={(e) =>
                          handleRecordChange(r.id, { url: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  {r.missingFields.length > 0 && (
                    <div className="text-[10px] text-amber-700">
                      缺失字段：{r.missingFields.join("，")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

