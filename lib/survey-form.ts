import type { ArrangementGroup } from "@/lib/arrangement";

export type SurveyFormQuestion = {
  groupId: number;
  title: string;
  instruction: string;
};

export type SurveyFormInput = {
  title: string;
  description: string;
  questions: SurveyFormQuestion[];
};

export type SurveyForm = SurveyFormInput & {
  updatedAt: string;
  completedAt?: string;
};

export const FORM_LIMITS = {
  title: 100,
  description: 2000,
  questionTitle: 60,
  instruction: 200,
};

type SurveyIdentity = { academicYear: number; grade: number; semester: number };

export function defaultFormTitle(survey: SurveyIdentity) {
  return `${survey.academicYear}학년도 ${survey.grade}학년 ${survey.semester}학기 선택과목 수요조사`;
}

export const DEFAULT_FORM_DESCRIPTION =
  "다음 학기에 수강할 선택과목을 조사합니다.\n문항마다 안내된 수만큼 과목을 선택해 주세요.";

export function defaultInstruction(group: Pick<ArrangementGroup, "subjectIds" | "pickCount">) {
  return `${group.subjectIds.length}과목 중 ${group.pickCount}과목을 선택하세요`;
}

function defaultQuestion(group: ArrangementGroup): SurveyFormQuestion {
  return { groupId: group.id, title: group.name, instruction: defaultInstruction(group) };
}

/** 저장된 문항을 현재 편성에 맞춘다. 사라진 그룹의 문항은 빼고 새 그룹은 기본 문항으로 뒤에 붙인다. */
export function reconcileForm(
  saved: SurveyFormInput | null,
  groups: ArrangementGroup[],
  survey: SurveyIdentity,
): { form: SurveyFormInput; adjusted: number } {
  if (!saved) {
    return {
      form: { title: defaultFormTitle(survey), description: DEFAULT_FORM_DESCRIPTION, questions: groups.map(defaultQuestion) },
      adjusted: 0,
    };
  }
  const groupIds = new Set(groups.map((group) => group.id));
  const kept = saved.questions.filter((question) => groupIds.has(question.groupId));
  const keptIds = new Set(kept.map((question) => question.groupId));
  const added = groups.filter((group) => !keptIds.has(group.id)).map(defaultQuestion);
  return {
    form: { title: saved.title, description: saved.description, questions: [...kept, ...added] },
    adjusted: saved.questions.length - kept.length + added.length,
  };
}

/** 설문지 양식을 완료했고, 그 뒤로 편성의 그룹 구성이 바뀌지 않았는지 */
export function isFormCompleted(form: SurveyForm | null, groups: ArrangementGroup[]) {
  if (!form?.completedAt) return false;
  const groupIds = groups.map((group) => group.id).sort((a, b) => a - b);
  const questionIds = form.questions.map((question) => question.groupId).sort((a, b) => a - b);
  return groupIds.length === questionIds.length && groupIds.every((id, index) => id === questionIds[index]);
}

type ParseResult = { ok: true; value: SurveyFormInput } | { ok: false; error: string };

function text(value: unknown, max: number, required: boolean) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max || (required && trimmed.length === 0)) return null;
  return trimmed;
}

/** strict이면 제목과 문항 제목을 비울 수 없다 (다음 단계로 넘어갈 때). */
export function parseFormInput(body: unknown, groups: ArrangementGroup[], strict: boolean): ParseResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "설문지 형식이 올바르지 않습니다." };
  const { title, description, questions } = body as Record<string, unknown>;

  const parsedTitle = text(title, FORM_LIMITS.title, strict);
  if (parsedTitle === null) {
    return { ok: false, error: `설문지 제목을 ${strict ? "입력해 주세요" : "확인해 주세요"} (${FORM_LIMITS.title}자 이내).` };
  }
  const parsedDescription = text(description ?? "", FORM_LIMITS.description, false);
  if (parsedDescription === null) {
    return { ok: false, error: `설문지 내용은 ${FORM_LIMITS.description}자 이내로 입력해 주세요.` };
  }
  if (!Array.isArray(questions)) return { ok: false, error: "문항 형식이 올바르지 않습니다." };

  const groupIds = new Set(groups.map((group) => group.id));
  const seen = new Set<number>();
  const parsedQuestions: SurveyFormQuestion[] = [];
  for (const item of questions) {
    if (typeof item !== "object" || item === null) return { ok: false, error: "문항 형식이 올바르지 않습니다." };
    const question = item as Record<string, unknown>;
    const groupId = typeof question.groupId === "number" ? question.groupId : NaN;
    if (!groupIds.has(groupId) || seen.has(groupId)) {
      return { ok: false, error: "선택과목 편성이 바뀌었습니다. 새로고침 후 다시 저장해 주세요." };
    }
    seen.add(groupId);
    const questionTitle = text(question.title, FORM_LIMITS.questionTitle, strict);
    const instruction = text(question.instruction ?? "", FORM_LIMITS.instruction, false);
    if (questionTitle === null || instruction === null) {
      return {
        ok: false,
        error: `문항 제목(${FORM_LIMITS.questionTitle}자)과 안내 문구(${FORM_LIMITS.instruction}자)를 확인해 주세요.`,
      };
    }
    parsedQuestions.push({ groupId, title: questionTitle, instruction });
  }
  if (seen.size !== groupIds.size) {
    return { ok: false, error: "선택과목 편성이 바뀌었습니다. 새로고침 후 다시 저장해 주세요." };
  }

  return { ok: true, value: { title: parsedTitle, description: parsedDescription, questions: parsedQuestions } };
}
