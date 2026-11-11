import {
  blockLabel,
  teacherCount,
  type AssignmentSection,
  type AssignmentStudent,
  type SurveyAssignment,
} from "@/lib/assignment";
import type { PublishedSurvey } from "@/lib/published-survey";
import type { ResultTable } from "@/lib/result-tables";
import { classKey, classLabel } from "@/lib/roster";

export type AssignmentTableType = "sections" | "rosters" | "timetable" | "unplaced";

/** term: 학기로 거름, section: 학기·반으로 거름, class: 학급으로 거름 */
export type AssignmentTableFilterKind = "term" | "section" | "class";

export const ASSIGNMENT_TABLES: {
  type: AssignmentTableType;
  label: string;
  filename: string;
  filter: AssignmentTableFilterKind;
}[] = [
  { type: "sections", label: "개설 현황", filename: "개설현황", filter: "term" },
  { type: "rosters", label: "반별 명단", filename: "반별명단", filter: "section" },
  { type: "timetable", label: "학생별 수강표", filename: "학생별수강표", filter: "class" },
  { type: "unplaced", label: "미배정", filename: "미배정", filter: "term" },
];

export function isAssignmentTableType(value: unknown): value is AssignmentTableType {
  return ASSIGNMENT_TABLES.some((table) => table.type === value);
}

export type AssignmentTableFilter = { termId?: string; sectionId?: string; classKey?: string };

export type AssignmentTableSource = {
  published: PublishedSurvey;
  students: AssignmentStudent[];
  assignment: SurveyAssignment;
};

const UNPLACED_REASON = { closed: "개설 안 함", conflict: "시간 겹침·자리 없음" } as const;

/** 학기 순서, 블록, 반 이름 순 */
export function orderedSections(assignment: SurveyAssignment, termId = "") {
  return assignment.settings.terms
    .filter((term) => !termId || term.id === termId)
    .flatMap((term) =>
      assignment.sections
        .filter((section) => section.termId === term.id)
        .sort((left, right) => left.block - right.block || left.label.localeCompare(right.label, "ko")),
    );
}

/** 학생별 수강표·학급 필터에 쓰는 학급 목록 */
export function assignmentClasses(students: AssignmentStudent[]) {
  return [...new Set(students.map((student) => classKey(student.studentNo)))].sort();
}

function rosterRows(sections: AssignmentSection[], termLabel: Map<string, string>, nameByStudent: Map<string, string>) {
  return sections.flatMap((section) =>
    section.studentNos.map((studentNo) => [
      termLabel.get(section.termId) ?? "",
      blockLabel(section.block),
      section.label,
      studentNo,
      nameByStudent.get(studentNo) ?? "",
      classLabel(classKey(studentNo)),
    ]),
  );
}

export const ROSTER_COLUMNS: ResultTable["columns"] = [
  { label: "학기", kind: "text", width: 10 },
  { label: "블록", kind: "text", width: 8 },
  { label: "반", kind: "text", width: 24 },
  { label: "학번", kind: "text", width: 10 },
  { label: "이름", kind: "text", width: 12 },
  { label: "학급", kind: "text", width: 12 },
];

export function buildAssignmentTable(
  type: AssignmentTableType,
  { published, students, assignment }: AssignmentTableSource,
  filter: AssignmentTableFilter = {},
): ResultTable {
  const { settings, unplaced } = assignment;
  const termId = filter.termId ?? "";
  const nameByStudent = new Map(students.map((student) => [student.studentNo, student.name]));
  const subjectName = new Map(
    published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject])),
  );
  const termLabel = new Map(settings.terms.map((term) => [term.id, term.label]));

  if (type === "sections") {
    return {
      columns: [
        { label: "학기", kind: "text", width: 10 },
        { label: "블록", kind: "text", width: 8 },
        { label: "반", kind: "text", width: 24 },
        { label: "과목", kind: "text", width: 22 },
        { label: "인원", kind: "number", width: 8 },
        { label: "최대 인원", kind: "number", width: 10 },
        { label: "과목 교사 수", kind: "number", width: 12 },
      ],
      rows: orderedSections(assignment, termId).map((section) => [
        termLabel.get(section.termId) ?? "",
        blockLabel(section.block),
        section.label,
        subjectName.get(section.subjectId) ?? "",
        section.studentNos.length,
        settings.maxSize,
        teacherCount(settings, section.subjectId),
      ]),
      frozenColumns: 0,
    };
  }

  if (type === "rosters") {
    const sections = orderedSections(assignment, termId).filter(
      (section) => !filter.sectionId || section.id === filter.sectionId,
    );
    return { columns: ROSTER_COLUMNS, rows: rosterRows(sections, termLabel, nameByStudent), frozenColumns: 0 };
  }

  if (type === "timetable") {
    const slots = settings.terms.flatMap((term) =>
      Array.from({ length: term.blockCount }, (_, block) => ({
        termId: term.id,
        block,
        header: `${term.label} ${blockLabel(block)}`,
      })),
    );
    const sectionAt = new Map<string, string>();
    for (const section of assignment.sections) {
      for (const studentNo of section.studentNos) {
        sectionAt.set(`${studentNo}|${section.termId}|${section.block}`, section.label);
      }
    }
    return {
      columns: [
        { label: "학번", kind: "text", width: 10 },
        { label: "이름", kind: "text", width: 12 },
        { label: "학급", kind: "text", width: 12 },
        ...slots.map((slot) => ({ label: slot.header, kind: "text" as const, width: 20 })),
      ],
      rows: students
        .filter((student) => !filter.classKey || classKey(student.studentNo) === filter.classKey)
        .map((student) => [
          student.studentNo,
          student.name,
          classLabel(classKey(student.studentNo)),
          ...slots.map((slot) => sectionAt.get(`${student.studentNo}|${slot.termId}|${slot.block}`) ?? ""),
        ]),
      frozenColumns: 2,
    };
  }

  return {
    columns: [
      { label: "학기", kind: "text", width: 10 },
      { label: "학번", kind: "text", width: 10 },
      { label: "이름", kind: "text", width: 12 },
      { label: "과목", kind: "text", width: 22 },
      { label: "사유", kind: "text", width: 20 },
    ],
    rows: unplaced
      .filter((item) => !termId || item.termId === termId)
      .map((item) => [
        termLabel.get(item.termId) ?? "",
        item.studentNo,
        nameByStudent.get(item.studentNo) ?? "",
        subjectName.get(item.subjectId) ?? "",
        UNPLACED_REASON[item.reason],
      ]),
    frozenColumns: 0,
  };
}

/** 반별 명단을 반마다 따로 만든다 (반별 시트 다운로드) */
export function buildRosterTablesBySection(source: AssignmentTableSource, termId = "") {
  const nameByStudent = new Map(source.students.map((student) => [student.studentNo, student.name]));
  const termLabel = new Map(source.assignment.settings.terms.map((term) => [term.id, term.label]));
  return orderedSections(source.assignment, termId).map((section) => ({
    section,
    table: {
      columns: ROSTER_COLUMNS,
      rows: rosterRows([section], termLabel, nameByStudent),
      frozenColumns: 0,
    } satisfies ResultTable,
  }));
}
