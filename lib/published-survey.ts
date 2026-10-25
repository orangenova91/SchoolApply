import { ARRANGEMENT_TRACKS, type SurveyArrangement } from "@/lib/arrangement";
import type { SubjectRow } from "@/lib/subject-rows";
import type { SurveyForm } from "@/lib/survey-form";

export type PublishedQuestion = {
  groupId: number;
  title: string;
  instruction: string;
  pickCount: number;
  subjects: { id: string; subject: string; track: string }[];
};

/** 배포를 시작할 때 고정한 설문. 과목 목록 CSV가 바뀌어도 학생 화면과 응답이 어긋나지 않는다. */
export type PublishedSurvey = {
  title: string;
  description: string;
  questions: PublishedQuestion[];
  publishedAt: string;
};

export type ResponseAnswer = { groupId: number; subjectIds: string[] };

export type ResponseEditor = "student" | "teacher";

export const EDITOR_LABEL: Record<ResponseEditor, string> = { student: "학생", teacher: "교사" };

/** 응답을 고치기 직전의 내용. savedAt은 그 응답이 저장됐던 시각이다. */
export type ResponseHistoryEntry = { answers: ResponseAnswer[]; editedBy: ResponseEditor; savedAt: string };

function trackRank(track: string) {
  const index = ARRANGEMENT_TRACKS.indexOf(track);
  return index === -1 ? ARRANGEMENT_TRACKS.length : index;
}

export function buildPublishedSurvey(
  arrangement: SurveyArrangement,
  form: SurveyForm,
  catalog: SubjectRow[],
): PublishedSurvey {
  const rowById = new Map<string, Pick<SubjectRow, "id" | "subject" | "track">>([
    ...catalog.map((row) => [row.id, row] as const),
    ...arrangement.customSubjects.map((custom) => [custom.id, custom] as const),
  ]);
  const groupById = new Map(arrangement.groups.map((group) => [group.id, group]));
  const questions = form.questions.flatMap((question) => {
    const group = groupById.get(question.groupId);
    if (!group) return [];
    const subjects = group.subjectIds
      .flatMap((id) => {
        const row = rowById.get(id);
        return row ? [{ id: row.id, subject: row.subject, track: row.track }] : [];
      })
      .sort((left, right) => trackRank(left.track) - trackRank(right.track));
    return [{ groupId: group.id, title: question.title, instruction: question.instruction, pickCount: group.pickCount, subjects }];
  });
  return { title: form.title, description: form.description, questions, publishedAt: new Date().toISOString() };
}

type ParseResult = { ok: true; value: ResponseAnswer[] } | { ok: false; error: string };

/** 학생 응답을 고정한 설문에 맞춰 검사한다. 문항마다 정확히 선택수만큼 그 문항의 과목을 골라야 한다. */
export function parseAnswers(body: unknown, published: PublishedSurvey): ParseResult {
  if (!Array.isArray(body)) return { ok: false, error: "응답 형식이 올바르지 않습니다." };
  const byGroup = new Map<number, string[]>();
  for (const item of body) {
    const record = (item ?? {}) as Record<string, unknown>;
    if (typeof record.groupId !== "number" || !Array.isArray(record.subjectIds)) {
      return { ok: false, error: "응답 형식이 올바르지 않습니다." };
    }
    if (byGroup.has(record.groupId)) return { ok: false, error: "같은 문항의 응답이 두 번 들어 있습니다." };
    byGroup.set(
      record.groupId,
      record.subjectIds.filter((id): id is string => typeof id === "string"),
    );
  }

  const answers: ResponseAnswer[] = [];
  for (const [index, question] of published.questions.entries()) {
    const chosen = byGroup.get(question.groupId) ?? [];
    const allowed = new Set(question.subjects.map((subject) => subject.id));
    const unique = [...new Set(chosen)];
    if (unique.length !== chosen.length || unique.some((id) => !allowed.has(id))) {
      return { ok: false, error: `${index + 1}번 문항에 선택할 수 없는 과목이 있습니다.` };
    }
    if (unique.length !== question.pickCount) {
      return { ok: false, error: `${index + 1}번 문항은 ${question.pickCount}과목을 선택해야 합니다.` };
    }
    answers.push({ groupId: question.groupId, subjectIds: unique });
  }
  if (byGroup.size !== published.questions.length) {
    return { ok: false, error: "설문 내용이 바뀌었습니다. 새로고침 후 다시 제출해 주세요." };
  }
  return { ok: true, value: answers };
}

export function answersMatch(answers: ResponseAnswer[], published: PublishedSurvey) {
  return parseAnswers(answers, published).ok;
}
