import { NextResponse } from "next/server";

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 엑셀에서 바로 열리도록 UTF-8 BOM을 붙인 CSV 응답 */
export function csvResponse(filename: string, rows: (string | number)[][]) {
  const body = rows.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(`\uFEFF${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
