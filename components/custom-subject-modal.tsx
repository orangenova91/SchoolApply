"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CUSTOM_GROUP_FALLBACK,
  CUSTOM_TRACK_DEFAULT,
  TRACK_ORDER,
  normalizeSubjectName,
  type SubjectDraft,
  type SubjectRow,
} from "@/components/subject-shared";

const SUBJECT_NAME_MAX = 40;

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export function CustomSubjectModal({
  initial,
  editingId,
  groupOptions,
  rows,
  onClose,
  onSubmit,
  onUseExisting,
}: {
  initial?: Partial<SubjectDraft>;
  editingId?: string;
  groupOptions: string[];
  rows: SubjectRow[];
  onClose: () => void;
  onSubmit: (draft: SubjectDraft) => void;
  onUseExisting?: (id: string) => void;
}) {
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [group, setGroup] = useState(initial?.group ?? CUSTOM_GROUP_FALLBACK);
  const [track, setTrack] = useState(initial?.track ?? CUSTOM_TRACK_DEFAULT);
  const [submitted, setSubmitted] = useState(false);

  const trimmed = subject.trim();
  const duplicate = trimmed
    ? rows.find((row) => row.id !== editingId && normalizeSubjectName(row.subject) === normalizeSubjectName(trimmed))
    : undefined;
  const error = !trimmed ? "과목명을 입력하세요" : duplicate ? `이미 있는 과목입니다: ${duplicate.subject}` : "";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (error) return;
    onSubmit({ subject: trimmed, group, track });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-subject-title"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <h3 id="custom-subject-title" className="text-base font-semibold text-zinc-900">
          {editingId ? "과목 수정" : "과목 추가"}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">목록에 없는 과목을 이 조사에 추가합니다.</p>

        <label className="mt-4 block text-xs font-medium text-zinc-500" htmlFor="custom-subject-name">
          과목명
        </label>
        <input
          id="custom-subject-name"
          type="text"
          autoFocus
          maxLength={SUBJECT_NAME_MAX}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
          autoComplete="off"
          className={FIELD_CLASS}
        />
        {(submitted || duplicate) && error ? (
          <div className="mt-1.5 flex items-center gap-2">
            <p role="alert" className="text-xs font-medium text-red-600">
              {error}
            </p>
            {duplicate && onUseExisting ? (
              <button
                type="button"
                onClick={() => onUseExisting(duplicate.id)}
                className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                기존 과목 담기
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500" htmlFor="custom-subject-group">
              교과(군)
            </label>
            <select
              id="custom-subject-group"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className={FIELD_CLASS}
            >
              {groupOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500" htmlFor="custom-subject-track">
              과목구분
            </label>
            <select
              id="custom-subject-track"
              value={track}
              onChange={(event) => setTrack(event.target.value)}
              className={FIELD_CLASS}
            >
              {TRACK_ORDER.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            취소
          </button>
          <button
            type="submit"
            className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800"
          >
            {editingId ? "저장" : "추가"}
          </button>
        </div>
      </form>
    </div>
  );
}
