import {
  answersMatch,
  type PublishedSurvey,
  type ResponseAnswer,
  type ResponseEditor,
  type ResponseHistoryEntry,
} from "@/lib/published-survey";
import { classKey, classLabel } from "@/lib/roster";

/** submitted: 집계에 들어가는 응답, invalid: 배포 내용이 바뀌어 다시 제출해야 하는 응답 */
export type ResponseState = "submitted" | "invalid" | "missing";

export type StudentResult = {
  studentNo: string;
  name: string;
  classKey: string;
  state: ResponseState;
  submittedAt: string | null;
  updatedAt: string | null;
  picks: Record<number, string[]>;
  /** 응답이 없으면 null. 교사 수정 때 그사이 바뀐 응답을 덮어쓰지 않도록 쓴다. */
  revision: number | null;
  editedBy: ResponseEditor | null;
  history: ResponseHistoryEntry[];
};

export type ClassResult = {
  key: string;
  label: string;
  total: number;
  submitted: number;
  pending: { studentNo: string; name: string; state: ResponseState }[];
};

export type SubjectCount = { id: string; subject: string; track: string; count: number };

export type QuestionResult = {
  groupId: number;
  title: string;
  pickCount: number;
  subjects: SubjectCount[];
};

export type SurveyResults = {
  total: number;
  submitted: number;
  invalid: number;
  missing: number;
  lastSubmittedAt: string | null;
  classes: ClassResult[];
  questions: QuestionResult[];
  students: StudentResult[];
};

export const STATE_LABEL: Record<ResponseState, string> = {
  submitted: "제출",
  invalid: "다시 제출 필요",
  missing: "미제출",
};

export function buildResults(
  published: PublishedSurvey,
  respondents: { studentNo: string; name: string }[],
  responses: {
    studentNo: string;
    answers: ResponseAnswer[];
    submittedAt: string;
    updatedAt: string;
    revision: number;
    editedBy?: ResponseEditor;
    history?: ResponseHistoryEntry[];
  }[],
): SurveyResults {
  const responseByStudent = new Map(responses.map((response) => [response.studentNo, response]));
  const students: StudentResult[] = respondents.map((respondent) => {
    const response = responseByStudent.get(respondent.studentNo);
    const state: ResponseState = !response ? "missing" : answersMatch(response.answers, published) ? "submitted" : "invalid";
    return {
      studentNo: respondent.studentNo,
      name: respondent.name,
      classKey: classKey(respondent.studentNo),
      state,
      submittedAt: response?.submittedAt ?? null,
      updatedAt: response?.updatedAt ?? null,
      picks: Object.fromEntries((response?.answers ?? []).map((answer) => [answer.groupId, answer.subjectIds])),
      revision: response?.revision ?? null,
      editedBy: response ? (response.editedBy ?? "student") : null,
      history: response?.history ?? [],
    };
  });

  const classMap = new Map<string, ClassResult>();
  for (const student of students) {
    const entry =
      classMap.get(student.classKey) ??
      { key: student.classKey, label: classLabel(student.classKey), total: 0, submitted: 0, pending: [] };
    entry.total += 1;
    if (student.state === "submitted") entry.submitted += 1;
    else entry.pending.push({ studentNo: student.studentNo, name: student.name, state: student.state });
    classMap.set(student.classKey, entry);
  }

  const counted = students.filter((student) => student.state === "submitted");
  const questions = published.questions.map((question) => {
    const counts = new Map<string, number>();
    for (const student of counted) {
      for (const id of student.picks[question.groupId] ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return {
      groupId: question.groupId,
      title: question.title,
      pickCount: question.pickCount,
      subjects: question.subjects
        .map((subject) => ({ ...subject, count: counts.get(subject.id) ?? 0 }))
        .sort((left, right) => right.count - left.count),
    };
  });

  const lastSubmittedAt =
    responses
      .filter((response) => responseByStudent.has(response.studentNo))
      .map((response) => response.updatedAt)
      .sort()
      .at(-1) ?? null;

  return {
    total: students.length,
    submitted: counted.length,
    invalid: students.filter((student) => student.state === "invalid").length,
    missing: students.filter((student) => student.state === "missing").length,
    lastSubmittedAt,
    classes: [...classMap.values()].sort((left, right) => left.key.localeCompare(right.key)),
    questions,
    students,
  };
}