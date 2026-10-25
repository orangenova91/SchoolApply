"use client";

import { useState } from "react";
import { TrackBadge } from "@/components/subject-shared";

export type PreviewQuestion = {
  groupId: number;
  title: string;
  instruction: string;
  pickCount: number;
  subjects: { id: string; subject: string; track: string }[];
};

export type PickedSubjects = Record<number, string[]>;

/** value/onChange를 주면 선택을 바깥에서 관리한다 (학생 응답 화면). 주지 않으면 미리보기용으로 혼자 관리한다. */
export function SurveyFormPreview({
  title,
  description,
  questions,
  value,
  onChange,
}: {
  title: string;
  description: string;
  questions: PreviewQuestion[];
  value?: PickedSubjects;
  onChange?: (next: PickedSubjects) => void;
}) {
  const [ownPicked, setOwnPicked] = useState<PickedSubjects>({});
  const picked = value ?? ownPicked;

  function toggle(question: PreviewQuestion, subjectId: string) {
    const chosen = picked[question.groupId] ?? [];
    let next = picked;
    if (chosen.includes(subjectId)) {
      next = { ...picked, [question.groupId]: chosen.filter((id) => id !== subjectId) };
    } else if (chosen.length < question.pickCount) {
      next = { ...picked, [question.groupId]: [...chosen, subjectId] };
    }
    if (onChange) onChange(next);
    else setOwnPicked(next);
  }

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-violet-50/60 px-5 py-5">
        <h2 className={`text-lg font-semibold ${title.trim() ? "text-zinc-900" : "text-zinc-300"}`}>
          {title.trim() || "설문지 제목"}
        </h2>
        {description.trim() ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600">{description}</p>
        ) : null}
      </div>
      <ol className="divide-y divide-zinc-100">
        {questions.map((question, index) => {
          const chosen = picked[question.groupId] ?? [];
          const full = chosen.length >= question.pickCount;
          return (
            <li key={question.groupId} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${question.title.trim() ? "text-zinc-900" : "text-zinc-300"}`}>
                    {index + 1}. {question.title.trim() || "문항 제목"}
                  </p>
                  {question.instruction.trim() ? (
                    <p className="mt-0.5 text-xs text-zinc-500">{question.instruction}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    full ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {chosen.length}/{question.pickCount} 선택
                </span>
              </div>
              <ul className="mt-3 space-y-1">
                {question.subjects.map((subject) => {
                  const checked = chosen.includes(subject.id);
                  const disabled = !checked && full;
                  return (
                    <li key={subject.id}>
                      <label
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          checked ? "bg-violet-50" : disabled ? "opacity-40" : "hover:bg-zinc-50"
                        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(question, subject.id)}
                          className="size-4 accent-violet-700"
                        />
                        <span className="min-w-0 flex-1 text-zinc-800">{subject.subject}</span>
                        <TrackBadge track={subject.track} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
