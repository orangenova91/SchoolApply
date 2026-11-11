import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { blockLabel, teacherCount } from "@/lib/assignment";
import { loadAssignmentContext } from "@/lib/assignment-data";
import { classKey, classLabel } from "@/lib/roster";
import { getSessionFromRequest } from "@/lib/session";

type RouteContext = {
  params: Promise<{ surveyId: string }>;
};

const UNPLACED_REASON = { closed: "개설 안 함", conflict: "시간 겹침·자리 없음" } as const;

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: { header: string; width: number }[],
  rows: (string | number)[][],
  frozenColumns = 0,
) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: frozenColumns }] });
  sheet.columns = columns;
  for (const row of rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

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
  const { survey, published, results, assignment } = data;
  const { settings, sections, unplaced } = assignment;
  const nameByStudent = new Map(results.students.map((student) => [student.studentNo, student.name]));
  const subjectName = new Map(
    published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject])),
  );
  const termLabel = new Map(settings.terms.map((term) => [term.id, term.label]));
  const ordered = settings.terms.flatMap((term) =>
    sections
      .filter((section) => section.termId === term.id)
      .sort((left, right) => left.block - right.block || left.label.localeCompare(right.label, "ko")),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스쿨어플라이(SchoolApply)";

  addSheet(
    workbook,
    "개설 현황",
    [
      { header: "학기", width: 10 },
      { header: "블록", width: 8 },
      { header: "반", width: 24 },
      { header: "과목", width: 22 },
      { header: "인원", width: 8 },
      { header: "최대 인원", width: 10 },
      { header: "과목 교사 수", width: 12 },
    ],
    ordered.map((section) => [
      termLabel.get(section.termId) ?? "",
      blockLabel(section.block),
      section.label,
      subjectName.get(section.subjectId) ?? "",
      section.studentNos.length,
      settings.maxSize,
      teacherCount(settings, section.subjectId),
    ]),
  );

  addSheet(
    workbook,
    "반별 명단",
    [
      { header: "학기", width: 10 },
      { header: "블록", width: 8 },
      { header: "반", width: 24 },
      { header: "학번", width: 10 },
      { header: "이름", width: 12 },
      { header: "학급", width: 12 },
    ],
    ordered.flatMap((section) =>
      section.studentNos.map((studentNo) => [
        termLabel.get(section.termId) ?? "",
        blockLabel(section.block),
        section.label,
        studentNo,
        nameByStudent.get(studentNo) ?? "",
        classLabel(classKey(studentNo)),
      ]),
    ),
  );

  const slots = settings.terms.flatMap((term) =>
    Array.from({ length: term.blockCount }, (_, block) => ({ termId: term.id, block, header: `${term.label} ${blockLabel(block)}` })),
  );
  const sectionAt = new Map<string, string>();
  for (const section of sections) {
    for (const studentNo of section.studentNos) sectionAt.set(`${studentNo}|${section.termId}|${section.block}`, section.label);
  }
  addSheet(
    workbook,
    "학생별 수강표",
    [
      { header: "학번", width: 10 },
      { header: "이름", width: 12 },
      { header: "학급", width: 12 },
      ...slots.map((slot) => ({ header: slot.header, width: 20 })),
    ],
    results.students
      .filter((student) => student.state === "submitted")
      .map((student) => [
        student.studentNo,
        student.name,
        classLabel(student.classKey),
        ...slots.map((slot) => sectionAt.get(`${student.studentNo}|${slot.termId}|${slot.block}`) ?? ""),
      ]),
    2,
  );

  addSheet(
    workbook,
    "미배정",
    [
      { header: "학기", width: 10 },
      { header: "학번", width: 10 },
      { header: "이름", width: 12 },
      { header: "과목", width: 22 },
      { header: "사유", width: 20 },
    ],
    unplaced.map((item) => [
      termLabel.get(item.termId) ?? "",
      item.studentNo,
      nameByStudent.get(item.studentNo) ?? "",
      subjectName.get(item.subjectId) ?? "",
      UNPLACED_REASON[item.reason],
    ]),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `반편성_${survey.grade}학년_${survey.semester}학기_${survey.round}차.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
