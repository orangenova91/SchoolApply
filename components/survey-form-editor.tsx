"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SurveyFormPreview, type PreviewQuestion } from "@/components/survey-form-preview";
import { FORM_LIMITS, type SurveyForm, type SurveyFormInput } from "@/lib/survey-form";

export type FormGroupInfo = Omit<PreviewQuestion, "title" | "instruction"> & {
  groupName: string;
  defaultInstruction: string;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

function fieldBorder(invalid: boolean) {
  return invalid ? "border-red-300" : "border-zinc-300";
}

function formatSavedTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formIssues(form: SurveyFormInput) {
  const issues: string[] = [];
  if (!form.title.trim()) issues.push("설문지 제목을 입력해 주세요.");
  form.questions.forEach((question, index) => {
    if (!question.title.trim()) issues.push(`${index + 1}번 문항: 제목을 입력해 주세요.`);
  });
  return issues;
}

export function SurveyFormEditor({
  surveyId,
  initialForm,
  initialSavedAt,
  adjustedCount,
  groups,
}: {
  surveyId: string;
  initialForm: SurveyFormInput;
  initialSavedAt: string | null;
  adjustedCount: number;
  groups: FormGroupInfo[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialForm.title);
  const [description, setDescription] = useState(initialForm.description);
  const [questions, setQuestions] = useState(initialForm.questions);
  const [savedSnapshot, setSavedSnapshot] = useState(() => (adjustedCount > 0 ? "" : JSON.stringify(initialForm)));
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [saving, setSaving] = useState<"draft" | "next" | null>(null);
  const [saveError, setSaveError] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const [adjustedNotice, setAdjustedNotice] = useState(adjustedCount);

  const currentForm: SurveyFormInput = { title, description, questions };
  const currentSnapshot = JSON.stringify(currentForm);
  const dirty = currentSnapshot !== savedSnapshot;
  const issues = showIssues ? formIssues(currentForm) : [];
  const groupById = new Map(groups.map((group) => [group.groupId, group]));

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  function updateQuestion(groupId: number, patch: Partial<SurveyFormInput["questions"][number]>) {
    setQuestions((current) =>
      current.map((question) => (question.groupId === groupId ? { ...question, ...patch } : question)),
    );
  }

  function moveQuestion(index: number, step: number) {
    setQuestions((current) => {
      const target = index + step;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function goBack() {
    if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 선택과목 편성으로 이동할까요?")) return;
    router.push(`/surveys/${surveyId}`);
  }

  async function save(complete: boolean) {
    setSaveError("");
    if (complete) {
      setShowIssues(true);
      if (formIssues(currentForm).length > 0) return;
    }
    setSaving(complete ? "next" : "draft");
    try {
      const response = await fetch(`/api/surveys/${surveyId}/form`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form: currentForm, complete }),
      });
      const data = (await response.json()) as { form?: SurveyForm; error?: string };
      if (!response.ok || !data.form) {
        setSaveError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      setSavedSnapshot(currentSnapshot);
      setSavedAt(data.form.updatedAt);
      setAdjustedNotice(0);
      if (complete) router.push(`/surveys/${surveyId}/distribute`);
    } catch {
      setSaveError("저장하지 못했습니다. 네트워크 연결을 확인해 주세요.");
    } finally {
      setSaving(null);
    }
  }

  const previewQuestions: PreviewQuestion[] = questions.flatMap((question) => {
    const group = groupById.get(question.groupId);
    return group ? [{ ...group, title: question.title, instruction: question.instruction }] : [];
  });

  return (
    <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {adjustedNotice > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 lg:col-span-2">
          선택과목 편성이 바뀌어 문항 {adjustedNotice}개가 조정되었습니다. 확인 후 저장해 주세요.
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900">기본 정보</h2>
          <label className="mt-4 block text-xs font-medium text-zinc-500" htmlFor="survey-form-title">
            설문지 제목
          </label>
          <input
            id="survey-form-title"
            type="text"
            value={title}
            maxLength={FORM_LIMITS.title}
            onChange={(event) => setTitle(event.target.value)}
            className={`${FIELD_CLASS} ${fieldBorder(showIssues && !title.trim())}`}
          />
          <div className="mt-4 flex items-baseline justify-between">
            <label className="block text-xs font-medium text-zinc-500" htmlFor="survey-form-description">
              설문지 내용
            </label>
            <span className="text-xs text-zinc-400">
              {description.length}/{FORM_LIMITS.description}
            </span>
          </div>
          <textarea
            id="survey-form-description"
            rows={5}
            value={description}
            maxLength={FORM_LIMITS.description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="학생에게 보여 줄 안내문을 입력하세요"
            className={`${FIELD_CLASS} ${fieldBorder(false)} resize-y leading-relaxed`}
          />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">선택과목 문항</h2>
              <p className="mt-1 text-sm text-zinc-500">편성한 그룹마다 문항 하나가 만들어집니다.</p>
            </div>
            <button
              type="button"
              onClick={goBack}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              편성 수정
            </button>
          </div>
          <ol className="mt-4 space-y-3">
            {questions.map((question, index) => {
              const group = groupById.get(question.groupId);
              if (!group) return null;
              const titleInvalid = showIssues && !question.title.trim();
              return (
                <li key={question.groupId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-zinc-500">
                      <span className="font-semibold text-zinc-800">{index + 1}번 문항</span> · 그룹 {group.groupName} ·{" "}
                      {group.subjects.length}과목 중 {group.pickCount}과목 택
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, -1)}
                        disabled={index === 0}
                        aria-label={`${index + 1}번 문항 위로`}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-600 enabled:hover:bg-zinc-100 disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, 1)}
                        disabled={index === questions.length - 1}
                        aria-label={`${index + 1}번 문항 아래로`}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-600 enabled:hover:bg-zinc-100 disabled:opacity-40"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <label className="mt-2 block text-xs font-medium text-zinc-500" htmlFor={`question-title-${question.groupId}`}>
                    문항 제목
                  </label>
                  <input
                    id={`question-title-${question.groupId}`}
                    type="text"
                    value={question.title}
                    maxLength={FORM_LIMITS.questionTitle}
                    placeholder={group.groupName}
                    onChange={(event) => updateQuestion(question.groupId, { title: event.target.value })}
                    className={`${FIELD_CLASS} ${fieldBorder(titleInvalid)}`}
                  />
                  <div className="mt-2 flex items-baseline justify-between">
                    <label
                      className="block text-xs font-medium text-zinc-500"
                      htmlFor={`question-instruction-${question.groupId}`}
                    >
                      안내 문구
                    </label>
                    {question.instruction !== group.defaultInstruction ? (
                      <button
                        type="button"
                        onClick={() => updateQuestion(question.groupId, { instruction: group.defaultInstruction })}
                        className="text-xs text-violet-700 hover:underline"
                      >
                        기본 문구로
                      </button>
                    ) : null}
                  </div>
                  <input
                    id={`question-instruction-${question.groupId}`}
                    type="text"
                    value={question.instruction}
                    maxLength={FORM_LIMITS.instruction}
                    placeholder={group.defaultInstruction}
                    onChange={(event) => updateQuestion(question.groupId, { instruction: event.target.value })}
                    className={`${FIELD_CLASS} ${fieldBorder(false)}`}
                  />
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <aside className="lg:sticky lg:top-[173px]">
        <div className="flex items-baseline justify-between px-1 pb-2">
          <p className="text-sm font-semibold text-zinc-900">학생 화면 미리보기</p>
          <p className="text-xs text-zinc-400">눌러 볼 수 있으며 저장되지 않습니다</p>
        </div>
        <div className="lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto">
          <SurveyFormPreview title={title} description={description} questions={previewQuestions} />
        </div>
      </aside>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            {saveError ? (
              <p role="alert" className="font-medium text-red-600">
                {saveError}
              </p>
            ) : dirty ? (
              <p className="text-amber-700">저장하지 않은 변경이 있습니다</p>
            ) : savedAt ? (
              <p className="text-zinc-500">저장됨 {formatSavedTime(savedAt)}</p>
            ) : (
              <p className="text-zinc-400">아직 저장하지 않았습니다</p>
            )}
            {issues.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={saving !== null}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← 이전: 선택과목 편성
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving !== null}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "draft" ? "저장 중…" : "임시 저장"}
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving !== null}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "next" ? "저장 중…" : "다음: 설문 배포 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
