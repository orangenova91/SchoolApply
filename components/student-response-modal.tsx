"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { TrackBadge } from "@/components/subject-shared";
import { SurveyFormPreview, type PickedSubjects } from "@/components/survey-form-preview";
import { EDITOR_LABEL, type PublishedSurvey, type ResponseAnswer } from "@/lib/published-survey";
import { STATE_LABEL, type ResponseState, type StudentResult } from "@/lib/result-summary";
import { classLabel } from "@/lib/roster";

export const STATE_TONE: Record<ResponseState, string> = {
  submitted: "bg-green-50 text-green-700 ring-green-200",
  invalid: "bg-amber-50 text-amber-800 ring-amber-200",
  missing: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

export function formatDateTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TeacherEditBadge() {
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">교사 수정</span>
  );
}

/** 지금 설문에 있는 과목만 남긴다. 배포 내용이 바뀐 응답은 빠진 과목을 다시 골라야 한다. */
function editablePicks(student: StudentResult, published: PublishedSurvey): PickedSubjects {
  return Object.fromEntries(
    published.questions.map((question) => {
      const allowed = new Set(question.subjects.map((subject) => subject.id));
      return [question.groupId, (student.picks[question.groupId] ?? []).filter((id) => allowed.has(id))];
    }),
  );
}

function ResponseHistory({ student, published }: { student: StudentResult; published: PublishedSurvey }) {
  const subjectName = useMemo(
    () =>
      new Map(
        published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject] as const)),
      ),
    [published],
  );
  const questionIndex = new Map(published.questions.map((question, index) => [question.groupId, index]));
  const describe = (answer: ResponseAnswer) => {
    const index = questionIndex.get(answer.groupId);
    const label = index === undefined ? "삭제된 문항" : `${index + 1}. ${published.questions[index].title}`;
    return `${label}: ${answer.subjectIds.map((id) => subjectName.get(id) ?? id).join(", ")}`;
  };

  return (
    <details className="mt-5 rounded-xl border border-zinc-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700">
        이전 응답 기록 {student.history.length}건
      </summary>
      <ol className="divide-y divide-zinc-100 border-t border-zinc-100">
        {[...student.history].reverse().map((entry, index) => (
          <li key={`${entry.savedAt}-${index}`} className="px-3 py-2">
            <p className="text-xs text-zinc-500">
              {formatDateTime(entry.savedAt)} 저장 · {EDITOR_LABEL[entry.editedBy]}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-zinc-700">
              {entry.answers.map((answer) => (
                <li key={answer.groupId}>{describe(answer)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** 학생 한 명의 응답을 보고, 신청 중·마감 상태에서는 교사가 고치거나 대신 입력한다. */
export function StudentResponseModal({
  surveyId,
  student,
  published,
  editable,
  startEditing = false,
  onClose,
}: {
  surveyId: string;
  student: StudentResult;
  published: PublishedSurvey;
  editable: boolean;
  startEditing?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [editing, setEditing] = useState(editable && startEditing);
  const [picked, setPicked] = useState<PickedSubjects>(() => editablePicks(student, published));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const missing = student.state === "missing";
  const completed = published.questions.filter(
    (question) => (picked[question.groupId] ?? []).length === question.pickCount,
  ).length;
  const allDone = completed === published.questions.length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (editing) setEditing(false);
      else onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing, onClose]);

  function beginEdit() {
    setPicked(editablePicks(student, published));
    setError("");
    setNotice("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${surveyId}/responses/${encodeURIComponent(student.studentNo)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: published.questions.map((question) => ({
            groupId: question.groupId,
            subjectIds: picked[question.groupId] ?? [],
          })),
          expectedRevision: student.revision,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "응답을 저장하지 못했습니다.");
        if (response.status === 409) {
          setEditing(false);
          startRefresh(() => router.refresh());
        }
        return;
      }
      setEditing(false);
      setNotice(missing ? "대신 입력한 응답을 저장했습니다." : "수정한 응답을 저장했습니다.");
      startRefresh(() => router.refresh());
    } catch {
      setError("응답을 저장하지 못했습니다. 연결을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-response-title"
      onClick={editing ? undefined : onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl ${
          editing ? "max-w-xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h3 id="student-response-title" className="text-base font-semibold text-zinc-900">
              {student.studentNo} {student.name}
              {editing ? (
                <span className="ml-2 text-sm font-medium text-violet-700">{missing ? "대신 입력" : "응답 수정"}</span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-sm text-zinc-500">
              {classLabel(student.classKey)}
              {student.submittedAt ? ` · ${formatDateTime(student.submittedAt)} 제출` : ""}
              {student.updatedAt && student.updatedAt !== student.submittedAt
                ? ` · ${formatDateTime(student.updatedAt)} 수정`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {student.editedBy === "teacher" ? <TeacherEditBadge /> : null}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATE_TONE[student.state]}`}>
              {STATE_LABEL[student.state]}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <>
              <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                {missing
                  ? "학생 대신 응답을 입력합니다. 저장하면 '교사 수정'으로 표시됩니다."
                  : "저장하면 지금 응답은 이전 응답 기록에 남고, '교사 수정'으로 표시됩니다."}
              </p>
              <SurveyFormPreview
                title={published.title}
                description=""
                questions={published.questions}
                value={picked}
                onChange={setPicked}
              />
            </>
          ) : (
            <>
              {notice ? (
                <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                  {notice}
                  {refreshing ? " 화면에 반영하는 중…" : ""}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              ) : null}
              {missing ? (
                <p className="py-6 text-center text-sm text-zinc-500">아직 제출하지 않았습니다.</p>
              ) : (
                <>
                  {student.state === "invalid" ? (
                    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      배포 내용이 바뀌기 전에 제출한 응답이라 집계에서 빠졌습니다. 학생이 다시 제출하거나 선생님이
                      수정해 주세요.
                    </p>
                  ) : null}
                  <ol className="space-y-4">
                    {published.questions.map((question, index) => {
                      const chosen = new Set(student.picks[question.groupId] ?? []);
                      const subjects = question.subjects.filter((subject) => chosen.has(subject.id));
                      return (
                        <li key={question.groupId}>
                          <p className="text-sm font-semibold text-zinc-800">
                            {index + 1}. {question.title}
                            <span className="ml-1 font-normal text-zinc-400">({question.pickCount}과목 택)</span>
                          </p>
                          {subjects.length > 0 ? (
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                              {subjects.map((subject) => (
                                <li
                                  key={subject.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-sm text-zinc-800"
                                >
                                  {subject.subject}
                                  <TrackBadge track={subject.track} />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-xs text-zinc-400">선택한 과목이 없습니다.</p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
              {student.history.length > 0 ? <ResponseHistory student={student} published={published} /> : null}
            </>
          )}
        </div>

        <div className="border-t border-zinc-100 px-5 py-3">
          {editing && error ? (
            <p role="alert" className="mb-2 text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-zinc-500">
              {editing
                ? allDone
                  ? "모든 문항을 골랐습니다"
                  : `${completed}/${published.questions.length} 문항 완료`
                : editable
                  ? ""
                  : "반 배정이 끝난 조사라 응답을 수정할 수 없습니다."}
            </p>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!allDone || saving}
                  className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "저장하는 중…" : "저장"}
                </button>
              </>
            ) : (
              <>
                {editable ? (
                  <button
                    type="button"
                    onClick={beginEdit}
                    disabled={refreshing}
                    className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60"
                  >
                    {missing ? "대신 입력" : "응답 수정"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  닫기
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
