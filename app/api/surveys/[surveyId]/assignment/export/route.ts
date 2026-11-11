import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { loadAssignmentContext } from "@/lib/assignment-data";
import {
  ASSIGNMENT_TABLES,
  assignmentClasses,
  buildAssignmentTable,
  buildRosterTablesBySection,
  isAssignmentTableType,
  type AssignmentTableFilter,
  type AssignmentTableSource,
} from "@/lib/assignment-tables";
import type { ResultTable } from "@/lib/result-tables";
import { classLabel } from "@/lib/roster";
import { getSessionFromRequest } from "@/lib/session";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

const SHEET_NAME_MAX = 31;

/** 엑셀 시트 이름은 31자 이내, \ / ? * [ ] : 를 쓸 수 없고 서로 달라야 한다. */
function sheetName(workbook: ExcelJS.Workbook, name: string) {
  const base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, SHEET_NAME_MAX) || "시트";
  let candidate = base;
  for (let index = 2; workbook.getWorksheet(candidate); index += 1) {
    const suffix = ` (${index})`;
    candidate = `${base.slice(0, SHEET_NAME_MAX - suffix.length)}${suffix}`;
  }
  return candidate;
}

function addTableSheet(workbook: ExcelJS.Workbook, name: string, table: ResultTable) {
  const sheet = workbook.addWorksheet(sheetName(workbook, name), {
    views: [{ state: "frozen", ySplit: 1, xSplit: table.frozenColumns }],
  });
  sheet.columns = table.columns.map((column) => ({ header: column.label, width: column.width ?? 12 }));
  for (const row of table.rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
}

/**
 * type이 없으면 표 4개를 시트로 담은 전체 파일. type이 있으면 그 표만 term·section·class로 거른다.
 * split=1이면 반별 명단을 반마다 시트로 나눈다.
 */
export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { surveyId } = await context.params;
  const data = await loadAssignmentContext(session.accountId, surveyId);
  if (!data) return NextResponse.json({ error: "조사를 찾을 수 없습니다." }, { status: 404 });
  if (!data.published || !data.assignment) {
    return NextResponse.json({ error: "반 편성 결과가 없습니다." }, { status: 409 });
  }
  const { survey, published, students, assignment } = data;
  const source: AssignmentTableSource = { published, students, assignment };

  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  if (type !== null && !isAssignmentTableType(type)) {
    return NextResponse.json({ error: "내려받을 종류를 확인해 주세요." }, { status: 400 });
  }
  const term = assignment.settings.terms.find((item) => item.id === params.get("term"));
  const section = assignment.sections.find((item) => item.id === params.get("section"));
  const requestedClass = params.get("class") ?? "";
  const classKey = assignmentClasses(students).includes(requestedClass) ? requestedClass : "";
  const filter: AssignmentTableFilter = { termId: term?.id, sectionId: section?.id, classKey: classKey || undefined };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스쿨어플라이(SchoolApply)";
  let filenameBase = "반편성";

  if (params.get("split") === "1") {
    const tables = buildRosterTablesBySection(source, term?.id);
    const termLabel = new Map(assignment.settings.terms.map((item) => [item.id, item.label]));
    for (const item of tables) {
      const prefix = term ? "" : `${termLabel.get(item.section.termId) ?? ""} `;
      addTableSheet(workbook, `${prefix}${item.section.label}`, item.table);
    }
    if (tables.length === 0) addTableSheet(workbook, "반별 명단", buildAssignmentTable("rosters", source, filter));
    filenameBase = `반별명단_반별시트${term ? `_${term.label}` : ""}`;
  } else if (type) {
    const info = ASSIGNMENT_TABLES.find((table) => table.type === type)!;
    addTableSheet(workbook, info.label, buildAssignmentTable(type, source, filter));
    const detail =
      info.filter === "class"
        ? classKey && classLabel(classKey)
        : section
          ? section.label
          : term?.label;
    filenameBase = `${info.filename}${detail ? `_${detail.replace(/\s/g, "")}` : ""}`;
  } else {
    for (const info of ASSIGNMENT_TABLES) addTableSheet(workbook, info.label, buildAssignmentTable(info.type, source));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const draft = survey.status === "assigned" ? "" : "_미확정";
  const filename = `${filenameBase}_${survey.grade}학년_${survey.semester}학기_${survey.round}차${draft}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
