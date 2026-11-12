import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { TIMETABLE_FORM } from "@/lib/timetable-import-types";

const SAMPLE_QUESTIONS = [
  {
    title: "1. 1학기 선택과목 조사 (총 4과목) [택2]",
    subjects: ["(사회) 세계사(성취도+5등급)", "(사회) 정치(성취도+5등급)", "(과학) 물리학(성취도+5등급)", "(과학) 화학(성취도+5등급)"],
  },
  {
    title: "2. 2학기 선택과목 조사 (총 3과목) [택1]",
    subjects: ["(국어) 문학과 영상(성취도+5등급)", "(수학) 미적분 II(성취도+5등급)", "(영어) 심화 영어(성취도+5등급)"],
  },
];

/** 과목 열 순서대로 1을 표시할 위치 */
const SAMPLE_STUDENTS = [
  { studentNo: "20101", name: "김하늘", picks: [1, 1, 0, 0, 1, 0, 0] },
  { studentNo: "20102", name: "이바다", picks: [0, 0, 1, 1, 0, 1, 0] },
  { studentNo: "20201", name: "박가람", picks: [1, 0, 1, 0, 0, 0, 1] },
];

const GUIDE = [
  ["timetable_form 작성 방법"],
  [],
  ["가져오기는 첫 번째 시트만 읽습니다. 이 안내 시트는 지워도 되고 남겨 두어도 됩니다."],
  [],
  ["위치", "내용"],
  ["1행 (E열부터)", "문항 제목. \"1. \"처럼 번호와 점으로 시작합니다. 같은 문항의 과목 칸마다 같은 제목을 적습니다 (셀 병합 대신)."],
  ["1행 제목의 학기", "제목에 \"1학기\" 또는 \"2학기\"를 넣어야 반 편성에서 학기가 나뉩니다."],
  ["1행 제목의 [택N]", "학생당 선택 개수입니다. 없으면 가장 많은 학생이 고른 개수를 씁니다. 가져올 때 고칠 수 있습니다."],
  ["2행 (E열부터)", "과목명. \"(사회) 세계사\"처럼 앞 괄호에 교과를 적습니다. 뒤쪽 괄호 내용은 무시합니다."],
  ["3행", "읽지 않습니다. 원본 양식처럼 \"금액\" 줄을 두거나 비워 두세요."],
  ["4행부터", "B열 학번, C열 이름, 학생이 선택한 과목 칸에 1을 적습니다. A열(순번)과 D열(반배정)은 읽지 않습니다."],
  ["학번", "5자리(20315) 또는 4자리(2315)를 한 파일 안에서 같은 형식으로 씁니다."],
  ["선택 개수", "문항의 선택 개수와 1의 개수가 다른 학생은 명단에만 들어가고, 응답 확인에서 교사가 입력하면 됩니다."],
];

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "스쿨어플라이(SchoolApply)";
  const sheet = workbook.addWorksheet("응답", {
    views: [{ state: "frozen", xSplit: TIMETABLE_FORM.firstSubjectColumn - 1, ySplit: TIMETABLE_FORM.firstStudentRow - 1 }],
  });

  const leading = ["순번", "학번", "이름", "반배정"];
  const columns = SAMPLE_QUESTIONS.flatMap((question) =>
    question.subjects.map((subject) => ({ title: question.title, subject })),
  );
  sheet.getRow(TIMETABLE_FORM.questionRow).values = [...leading, ...columns.map((column) => column.title)];
  sheet.getRow(TIMETABLE_FORM.subjectRow).values = [...leading, ...columns.map((column) => column.subject)];
  sheet.getRow(TIMETABLE_FORM.firstStudentRow - 1).values = ["순번", "학번", "이름", "금액", ...columns.map(() => 0)];
  SAMPLE_STUDENTS.forEach((student, index) => {
    const row = sheet.getRow(TIMETABLE_FORM.firstStudentRow + index);
    row.getCell(1).value = index + 1;
    row.getCell(TIMETABLE_FORM.studentNoColumn).value = student.studentNo;
    row.getCell(TIMETABLE_FORM.nameColumn).value = student.name;
    student.picks.forEach((picked, offset) => {
      if (picked) row.getCell(TIMETABLE_FORM.firstSubjectColumn + offset).value = "1";
    });
  });

  sheet.columns.forEach((column, index) => {
    column.width = index < TIMETABLE_FORM.firstSubjectColumn - 1 ? 9 : 22;
  });
  for (const rowNo of [TIMETABLE_FORM.questionRow, TIMETABLE_FORM.subjectRow]) {
    const row = sheet.getRow(rowNo);
    row.font = { bold: true };
    row.alignment = { wrapText: true, vertical: "top" };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
  }
  sheet.getRow(TIMETABLE_FORM.questionRow).height = 45;
  sheet.getRow(TIMETABLE_FORM.subjectRow).height = 30;

  const guide = workbook.addWorksheet("작성 방법");
  guide.columns = [{ width: 20 }, { width: 100 }];
  for (const line of GUIDE) guide.addRow(line);
  guide.getRow(1).font = { bold: true, size: 13 };
  guide.getRow(5).font = { bold: true };
  guide.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("timetable_form_양식.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
