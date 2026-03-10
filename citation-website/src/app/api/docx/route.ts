import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { Document, Packer, Paragraph } from "docx";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "需要 multipart/form-data 上传 .docx 文件" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const mode = formData.get("mode") || "extract";
  const bibliography = formData.get("bibliography");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "缺少 file 字段（.docx 文件）" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (mode === "extract") {
    const result = await mammoth.extractRawText({ buffer });
    return NextResponse.json({ text: result.value });
  }

  if (mode === "bibliography") {
    if (typeof bibliography !== "string" || !bibliography.trim()) {
      return NextResponse.json(
        { error: "缺少 bibliography 文本，用于生成参考文献页" },
        { status: 400 }
      );
    }
    const lines = bibliography
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const paragraphs = [
      new Paragraph({
        text: "References",
        spacing: { after: 200 },
      }),
      ...lines.map(
        (line) =>
          new Paragraph({
            text: line,
            spacing: { after: 120 },
          })
      ),
    ];

    const doc = new Document({
      sections: [
        {
          children: paragraphs,
        },
      ],
    });

    const docBuffer = await Packer.toBuffer(doc);
    return new NextResponse(docBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="references.docx"',
      },
    });
  }

  return NextResponse.json(
    { error: "不支持的 mode，支持 extract 或 bibliography" },
    { status: 400 }
  );
}

