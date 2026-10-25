import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { RESULT_TABLES, buildResultTable, isResultTableType, type ResultTable } from "@/lib/result-tables";
import { loadSurveyResults } from "@/lib/results";
import { classLabel, classKey } from "@/lib/roster";
import { getSessionFromRequest } from "@/lib/session";
import { getSurvey, getSurveyFlow } from "@/lib/surveys";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 엑셀 날짜 칸에는 시간대가 없으므로 한국 시간으로 보이도록 9시간을 더해 넣는다. */
function excelDate(iso: string) {
  return new Date(Date.parse(iso) + KST_OFFSET_MS);
}

async function workbookBuffer(sheetName: string, table: ResultTable) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스쿨어플라이(SchoolApply)";
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1, xSplit: table.frozenColumns }],
  });
  sheet.columns = table.columns.map((column) => ({
    header: column.label,
    width: column.width ?? 12,
    style: column.kind === "datetime" ? { numFmt: "yyyy-mm-dd hh:mm" } : {},
  }));
  for (const row of table.rows) {
    sheet.addRow(
      row.map((cell, index) =>
        cell !== null && table.columns[index].kind === "datetime" ? excelDate(String(cell)) : cell,
      ),
    );
  }
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
  header.alignment = { vertical: "middle" };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  return workbook.xlsx.writeBuffer();
}

/** type: students | matrix | subjects | missing, class: 반(예 203, 선택) */
export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { surveyId } = await context.params;
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  if (!isResultTableType(type)) {
    return NextResponse.json({ error: "내려받을 종류를 확인해 주세요." }, { status: 400 });
  }
  const survey = await getSurvey(session.accountId, surveyId);
  if (!survey) {
    return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
  }
  const { published } = await getSurveyFlow(session.accountId, surveyId);
  if (!published) {
    return NextResponse.json({ error: "배포를 시작한 조사만 응답을 내려받을 수 있습니다." }, { status: 409 });
  }

  const info = RESULT_TABLES.find((table) => table.type === type)!;
  const results = await loadSurveyResults(surveyId, published);
  const requestedClass = info.byClass ? (params.get("class") ?? "") : "";
  const classFilter = results.students.some((student) => classKey(student.studentNo) === requestedClass)
    ? requestedClass
    : "";
  const table = buildResultTable(type, results, published, classFilter);
  const buffer = await workbookBuffer(info.label.replace(/[\\/?*[\]:]/g, " "), table);

  const filename = `${info.filename}_${survey.round}차${classFilter ? `_${classLabel(classFilter).replace(/\s/g, "")}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
