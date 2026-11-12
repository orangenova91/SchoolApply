import ExcelJS from "exceljs";
import type { SurveyArrangement } from "@/lib/arrangement";
import type { PublishedSurvey, ResponseAnswer } from "@/lib/published-survey";
import { parseStudentNo, ROSTER_MAX, STUDENT_NAME_MAX, type RosterStudent, type StudentNoFormat } from "@/lib/roster";
import { normalizeSubjectName, type SubjectRow } from "@/lib/subject-rows";
import { DEFAULT_FORM_DESCRIPTION, FORM_LIMITS, defaultFormTitle, type SurveyForm } from "@/lib/survey-form";
import {
  TIMETABLE_FORM,
  type TimetableImportPreview,
  type TimetableImportQuestionConfig,
} from "@/lib/timetable-import-types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ISSUES = 50;

type ParsedSubject = {
  id: string;
  subject: string;
  group: string;
  track: string;
  column: number;
};

type ParsedQuestion = {
  groupId: number;
  title: string;
  suggestedPickCount: number;
  subjects: ParsedSubject[];
};

type ParsedStudent = RosterStudent & { picks: Map<number, string[]> };

type ParsedWorkbook = {
  fileName: string;
  studentNoFormat: StudentNoFormat;
  questions: ParsedQuestion[];
  students: ParsedStudent[];
  issues: string[];
};

export type TimetableImportBuild = {
  arrangement: SurveyArrangement;
  form: SurveyForm;
  published: PublishedSurvey;
  students: RosterStudent[];
  responses: { studentNo: string; answers: ResponseAnswer[] }[];
  excluded: { studentNo: string; name: string; reason: string }[];
  studentNoFormat: StudentNoFormat;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text);
  }
  return String(value);
}

/** "(수학) 미적분 II(성취도+5등급)" -> "미적분Ⅱ" */
function subjectName(header: string) {
  return header
    .replace(/^\s*\([^)]*\)\s*/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\bIII\b/g, "Ⅲ")
    .replace(/\bII\b/g, "Ⅱ")
    .replace(/\bI\b/g, "Ⅰ")
    .replace(/(?<=[가-힣])III$/, "Ⅲ")
    .replace(/(?<=[가-힣])II$/, "Ⅱ")
    .replace(/(?<=[가-힣])I$/, "Ⅰ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectGroup(header: string) {
  return /^\s*\(([^)]+)\)/.exec(header)?.[1]?.trim() ?? "가져온 과목";
}

function questionTitle(raw: string, fallback: string) {
  const withoutNumber = raw.replace(/^\s*\d+\.\s*/, "");
  const concise = withoutNumber.split(/\s*\(총|\r?\n/)[0].trim();
  return (concise || fallback).slice(0, FORM_LIMITS.questionTitle);
}

function inferredPickCount(rawTitle: string, counts: number[]) {
  const marked = /\[\s*택\s*(\d+)\s*\]/.exec(rawTitle)?.[1];
  if (marked) return Number(marked);
  const frequency = new Map<number, number>();
  for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
  return [...frequency].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0] ?? 1;
}

function formatFromStudentNos(studentNos: string[]): StudentNoFormat {
  const four = studentNos.filter((value) => value.length === 4).length;
  const five = studentNos.filter((value) => value.length === 5).length;
  return four > five ? "4" : "5";
}

function addIssue(issues: string[], issue: string) {
  if (issues.length < MAX_ISSUES) issues.push(issue);
}

export async function parseTimetableWorkbook(
  file: File,
  catalog: SubjectRow[],
): Promise<ParsedWorkbook> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("timetable_form 엑셀(.xlsx) 파일을 올려 주세요.");
  if (file.size === 0) throw new Error("빈 파일은 가져올 수 없습니다.");
  if (file.size > MAX_FILE_BYTES) throw new Error("엑셀 파일은 10MB 이하만 올릴 수 있습니다.");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load((await file.arrayBuffer()) as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("엑셀 파일을 읽지 못했습니다. timetable_form 양식인지 확인해 주세요.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("엑셀에 첫 번째 시트가 없습니다.");

  const catalogByName = new Map<string, SubjectRow>();
  for (const row of catalog) {
    const key = normalizeSubjectName(row.subject);
    if (!catalogByName.has(key)) catalogByName.set(key, row);
  }

  const rawColumns: { column: number; questionNo: number; rawTitle: string; rawSubject: string }[] = [];
  for (let column = TIMETABLE_FORM.firstSubjectColumn; column <= sheet.columnCount; column += 1) {
    const rawTitle = cellText(sheet.getRow(TIMETABLE_FORM.questionRow).getCell(column).value).trim();
    const rawSubject = cellText(sheet.getRow(TIMETABLE_FORM.subjectRow).getCell(column).value).trim();
    const match = /^(\d+)\./.exec(rawTitle);
    if (match && rawSubject) {
      rawColumns.push({ column, questionNo: Number(match[1]), rawTitle, rawSubject });
    }
  }
  if (rawColumns.length === 0) {
    throw new Error("1행의 문항과 2행의 과목을 찾지 못했습니다. timetable_form 양식인지 확인해 주세요.");
  }

  const questionNos = [...new Set(rawColumns.map((item) => item.questionNo))];
  const questions: ParsedQuestion[] = questionNos.map((questionNo, questionIndex) => {
    const columns = rawColumns.filter((item) => item.questionNo === questionNo);
    const subjects = columns.map((item, subjectIndex) => {
      const name = subjectName(item.rawSubject);
      const catalogRow = catalogByName.get(normalizeSubjectName(name));
      return {
        id: `import-q${questionIndex + 1}-s${subjectIndex + 1}`,
        subject: name,
        group: catalogRow?.group ?? subjectGroup(item.rawSubject),
        track: catalogRow?.track ?? "학교 자율",
        column: item.column,
      };
    });
    return {
      groupId: questionIndex + 1,
      title: questionTitle(columns[0].rawTitle, `${questionIndex + 1}번 선택과목`),
      suggestedPickCount: 1,
      subjects,
    };
  });

  const issues: string[] = [];
  const unvalidated: ParsedStudent[] = [];
  const seen = new Set<string>();
  for (let rowIndex = TIMETABLE_FORM.firstStudentRow; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const studentNo = cellText(row.getCell(TIMETABLE_FORM.studentNoColumn).value).trim().replace(/\.0+$/, "");
    const name = cellText(row.getCell(TIMETABLE_FORM.nameColumn).value).trim();
    if (!studentNo && !name) continue;
    if (!studentNo) {
      addIssue(issues, `${rowIndex}행: 학번이 없습니다.`);
      continue;
    }
    if (!name) addIssue(issues, `${studentNo}: 이름이 없습니다.`);
    if (name.length > STUDENT_NAME_MAX) addIssue(issues, `${studentNo}: 이름은 ${STUDENT_NAME_MAX}자 이하여야 합니다.`);
    if (seen.has(studentNo)) {
      addIssue(issues, `${studentNo}: 학번이 두 번 들어 있습니다.`);
      continue;
    }
    seen.add(studentNo);
    const picks = new Map<number, string[]>();
    for (const question of questions) {
      picks.set(
        question.groupId,
        question.subjects
          .filter((subject) => cellText(row.getCell(subject.column).value).trim() === "1")
          .map((subject) => subject.id),
      );
    }
    unvalidated.push({ studentNo, name, picks });
  }
  if (unvalidated.length === 0) throw new Error("4행부터 학생 학번과 이름을 찾지 못했습니다.");
  if (unvalidated.length > ROSTER_MAX) throw new Error(`학생은 최대 ${ROSTER_MAX}명까지 가져올 수 있습니다.`);

  const studentNoFormat = formatFromStudentNos(unvalidated.map((student) => student.studentNo));
  const students = unvalidated.filter((student) => {
    if (!parseStudentNo(student.studentNo, studentNoFormat)) {
      addIssue(issues, `${student.studentNo}: ${studentNoFormat}자리 학번 형식에 맞지 않습니다.`);
      return false;
    }
    if (!student.name || student.name.length > STUDENT_NAME_MAX) return false;
    return true;
  });
  if (students.length === 0) throw new Error("사용할 수 있는 학생이 없습니다. 학번과 이름을 확인해 주세요.");

  for (const question of questions) {
    question.suggestedPickCount = inferredPickCount(
      rawColumns.find((item) => item.questionNo === questionNos[question.groupId - 1])?.rawTitle ?? "",
      students.map((student) => student.picks.get(question.groupId)?.length ?? 0),
    );
    if (question.suggestedPickCount < 1 || question.suggestedPickCount > question.subjects.length) {
      question.suggestedPickCount = Math.max(1, Math.min(question.subjects.length, question.suggestedPickCount));
    }
  }
  return { fileName: file.name, studentNoFormat, questions, students, issues };
}

export function timetablePreview(parsed: ParsedWorkbook): TimetableImportPreview {
  return {
    fileName: parsed.fileName,
    studentCount: parsed.students.length,
    studentNoFormat: parsed.studentNoFormat,
    gradeCounts: parsed.students.reduce<Record<string, number>>((counts, student) => {
      const grade = student.studentNo[0] ?? "?";
      counts[grade] = (counts[grade] ?? 0) + 1;
      return counts;
    }, {}),
    issues: parsed.issues,
    questions: parsed.questions.map((question) => {
      const selectionCounts: Record<string, number> = {};
      for (const student of parsed.students) {
        const count = student.picks.get(question.groupId)?.length ?? 0;
        selectionCounts[count] = (selectionCounts[count] ?? 0) + 1;
      }
      return {
        groupId: question.groupId,
        title: question.title,
        suggestedPickCount: question.suggestedPickCount,
        selectionCounts,
        subjects: question.subjects.map((subject) => ({
          subject: subject.subject,
          track: subject.track,
          demand: parsed.students.filter((student) => student.picks.get(question.groupId)?.includes(subject.id)).length,
        })),
      };
    }),
  };
}

export function buildTimetableImport(
  parsed: ParsedWorkbook,
  config: TimetableImportQuestionConfig[],
  identity: { academicYear: number; grade: number; semester: number },
): TimetableImportBuild {
  if (config.length !== parsed.questions.length) throw new Error("문항 설정이 엑셀과 맞지 않습니다. 다시 분석해 주세요.");
  const byGroup = new Map(config.map((item) => [item.groupId, item]));
  const now = new Date().toISOString();
  for (const question of parsed.questions) {
    const item = byGroup.get(question.groupId);
    if (!item || !Number.isInteger(item.pickCount) || item.pickCount < 1 || item.pickCount > question.subjects.length) {
      throw new Error(`${question.title}의 선택 개수를 확인해 주세요.`);
    }
    if (!item.title.trim() || item.title.trim().length > FORM_LIMITS.questionTitle) {
      throw new Error(`문항 제목은 1~${FORM_LIMITS.questionTitle}자로 입력해 주세요.`);
    }
  }

  const arrangement: SurveyArrangement = {
    groups: parsed.questions.map((question) => ({
      id: question.groupId,
      name: byGroup.get(question.groupId)!.title.trim(),
      pickCount: byGroup.get(question.groupId)!.pickCount,
      subjectIds: question.subjects.map((subject) => subject.id),
    })),
    customSubjects: parsed.questions.flatMap((question) =>
      question.subjects.map(({ id, subject, group, track }) => ({ id, subject, group, track })),
    ),
    nextGroupId: parsed.questions.length + 1,
    updatedAt: now,
    completedAt: now,
  };
  const questions = parsed.questions.map((question) => {
    const item = byGroup.get(question.groupId)!;
    return {
      groupId: question.groupId,
      title: item.title.trim(),
      instruction: `${question.subjects.length}과목 중 ${item.pickCount}과목을 선택하세요`,
    };
  });
  const form: SurveyForm = {
    title: defaultFormTitle(identity),
    description: DEFAULT_FORM_DESCRIPTION,
    questions,
    updatedAt: now,
    completedAt: now,
  };
  const published: PublishedSurvey = {
    title: form.title,
    description: form.description,
    publishedAt: now,
    questions: questions.map((question) => ({
      ...question,
      pickCount: byGroup.get(question.groupId)!.pickCount,
      subjects: parsed.questions
        .find((item) => item.groupId === question.groupId)!
        .subjects.map(({ id, subject, track }) => ({ id, subject, track })),
    })),
  };

  const responses: TimetableImportBuild["responses"] = [];
  const excluded: TimetableImportBuild["excluded"] = [];
  for (const student of parsed.students) {
    const wrong = parsed.questions.find(
      (question) =>
        (student.picks.get(question.groupId)?.length ?? 0) !== byGroup.get(question.groupId)!.pickCount,
    );
    if (wrong) {
      const actual = student.picks.get(wrong.groupId)?.length ?? 0;
      excluded.push({
        studentNo: student.studentNo,
        name: student.name,
        reason: `${byGroup.get(wrong.groupId)!.title.trim()}: ${actual}개 선택`,
      });
      continue;
    }
    responses.push({
      studentNo: student.studentNo,
      answers: parsed.questions.map((question) => ({
        groupId: question.groupId,
        subjectIds: student.picks.get(question.groupId) ?? [],
      })),
    });
  }

  return {
    arrangement,
    form,
    published,
    students: parsed.students.map(({ studentNo, name }) => ({ studentNo, name })),
    responses,
    excluded,
    studentNoFormat: parsed.studentNoFormat,
  };
}
