import { EDITOR_LABEL, type PublishedSurvey } from "@/lib/published-survey";
import { STATE_LABEL, type SurveyResults } from "@/lib/result-summary";
import { classLabel } from "@/lib/roster";

export type ResultTableType = "students" | "matrix" | "subjects" | "missing";

export const RESULT_TABLES: { type: ResultTableType; label: string; filename: string; byClass: boolean }[] = [
  { type: "students", label: "학생별 응답", filename: "학생별응답", byClass: true },
  { type: "matrix", label: "학생별 과목 선택(1/0)", filename: "학생별과목선택", byClass: true },
  { type: "subjects", label: "과목별 집계", filename: "과목별집계", byClass: false },
  { type: "missing", label: "미제출 명단", filename: "미제출명단", byClass: true },
];

export function isResultTableType(value: unknown): value is ResultTableType {
  return RESULT_TABLES.some((table) => table.type === value);
}

/** text: 글자(학번도 글자로), number: 숫자, datetime: ISO 시각 */
export type TableColumn = { label: string; kind: "text" | "number" | "datetime"; width?: number };
export type TableCell = string | number | null;
export type ResultTable = { columns: TableColumn[]; rows: TableCell[][]; frozenColumns: number };

/** 학번·이름·반·상태 */
const STUDENT_COLUMNS: TableColumn[] = [
  { label: "학번", kind: "text", width: 9 },
  { label: "이름", kind: "text", width: 10 },
  { label: "반", kind: "text", width: 11 },
  { label: "상태", kind: "text", width: 14 },
];

export function buildResultTable(
  type: ResultTableType,
  results: SurveyResults,
  published: PublishedSurvey,
  classFilter = "",
): ResultTable {
  const students = classFilter
    ? results.students.filter((student) => student.classKey === classFilter)
    : results.students;
  const subjectName = new Map(
    published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject] as const)),
  );
  const head = (student: (typeof students)[number]) => [
    student.studentNo,
    student.name,
    classLabel(student.classKey),
    STATE_LABEL[student.state],
  ];

  if (type === "students") {
    return {
      frozenColumns: 2,
      columns: [
        ...STUDENT_COLUMNS,
        { label: "제출 시각", kind: "datetime", width: 17 },
        { label: "수정 시각", kind: "datetime", width: 17 },
        { label: "수정자", kind: "text", width: 8 },
        ...published.questions.map((question, index): TableColumn => ({
          label: `${index + 1}. ${question.title}`,
          kind: "text",
          width: 40,
        })),
      ],
      rows: students.map((student) => [
        ...head(student),
        student.submittedAt,
        student.updatedAt,
        student.editedBy ? EDITOR_LABEL[student.editedBy] : null,
        ...published.questions.map((question) =>
          student.state === "missing"
            ? null
            : (student.picks[question.groupId] ?? []).map((id) => subjectName.get(id) ?? id).join(" / "),
        ),
      ]),
    };
  }

  if (type === "matrix") {
    const subjects = published.questions.flatMap((question, index) =>
      question.subjects.map((subject) => ({ groupId: question.groupId, id: subject.id, label: `${index + 1}. ${subject.subject}` })),
    );
    return {
      frozenColumns: 2,
      columns: [...STUDENT_COLUMNS, ...subjects.map((subject): TableColumn => ({ label: subject.label, kind: "number", width: 12 }))],
      rows: students.map((student) => [
        ...head(student),
        ...subjects.map((subject) =>
          student.state === "submitted" ? ((student.picks[subject.groupId] ?? []).includes(subject.id) ? 1 : 0) : null,
        ),
      ]),
    };
  }

  if (type === "subjects") {
    return {
      frozenColumns: 0,
      columns: [
        { label: "문항", kind: "number", width: 6 },
        { label: "문항 제목", kind: "text", width: 26 },
        { label: "선택수", kind: "number", width: 8 },
        { label: "과목명", kind: "text", width: 22 },
        { label: "과목구분", kind: "text", width: 11 },
        { label: "신청 인원", kind: "number", width: 10 },
        { label: "비율(%)", kind: "number", width: 9 },
      ],
      rows: results.questions.flatMap((question, index) =>
        question.subjects.map((subject) => [
          index + 1,
          question.title,
          question.pickCount,
          subject.subject,
          subject.track,
          subject.count,
          results.submitted ? Math.round((subject.count / results.submitted) * 1000) / 10 : 0,
        ]),
      ),
    };
  }

  return {
    frozenColumns: 2,
    columns: STUDENT_COLUMNS,
    rows: students.filter((student) => student.state !== "submitted").map(head),
  };
}
