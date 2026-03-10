import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GROBID_ENDPOINT =
  process.env.GROBID_URL || "http://localhost:8070/api/processReferences";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "需要 multipart/form-data 上传 PDF 文件" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "缺少 file 字段（PDF 文件）" },
      { status: 400 }
    );
  }

  const pdfArray = await file.arrayBuffer();

  const fd = new FormData();
  fd.append("input", new Blob([pdfArray], { type: "application/pdf" }), file.name);

  try {
    const res = await fetch(GROBID_ENDPOINT, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `GROBID 请求失败: ${res.status}` },
        { status: 502 }
      );
    }
    const xml = await res.text();
    return NextResponse.json({ xml });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "连接 GROBID 失败" },
      { status: 500 }
    );
  }
}

