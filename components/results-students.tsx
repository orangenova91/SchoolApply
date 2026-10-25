"use client";

import { useMemo, useState } from "react";
import {
  STATE_TONE,
  StudentResponseModal,
  TeacherEditBadge,
  formatDateTime,
} from "@/components/student-response-modal";
import type { PublishedSurvey } from "@/lib/published-survey";
import { STATE_LABEL, type ClassResult, type ResponseState, type StudentResult } from "@/lib/result-summary";
import { classLabel } from "@/lib/roster";

export function ResultsStudents({
  surveyId,
  published,
  students,
  classes,
  classFilter,
  editable,
  onClassFilterChange,
}: {
  surveyId: string;
  published: PublishedSurvey;
  students: StudentResult[];
  classes: ClassResult[];
  classFilter: string;
  editable: boolean;
  onClassFilterChange: (key: string) => void;
}) {
  const [stateFilter, setStateFilter] = useState<"" | ResponseState>("");
  const [query, setQuery] = useState("");
  const [openStudentNo, setOpenStudentNo] = useState<string | null>(null);
  const openStudent = openStudentNo ? students.find((student) => student.studentNo === openStudentNo) : undefined;
  const subjectName = useMemo(
    () =>
      new Map(
        published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject] as const)),
      ),
    [published],
  );

  const keyword = query.trim();
  const visible = students.filter(
    (student) =>
      (!classFilter || student.classKey === classFilter) &&
      (!stateFilter || student.state === stateFilter) &&
      (!keyword || student.name.includes(keyword) || student.studentNo.includes(keyword)),
  );

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold text-zinc-900">③ 학생별 응답</h2>
        <select
          value={classFilter}
          onChange={(event) => onClassFilterChange(event.target.value)}
          aria-label="반"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800"
        >
          <option value="">전체 반</option>
          {classes.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value as "" | ResponseState)}
          aria-label="제출 상태"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800"
        >
          <option value="">전체 상태</option>
          <option value="submitted">제출</option>
          <option value="missing">미제출</option>
          <option value="invalid">다시 제출 필요</option>
        </select>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름·학번 검색"
          aria-label="이름·학번 검색"
          className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {visible.length}명 · 줄을 누르면 응답을 자세히 볼 수 있습니다
        {editable ? ". 응답 수정과 미제출 학생 대신 입력도 그 창에서 합니다." : "."}
      </p>
      <div className="mt-2 max-h-[32rem] overflow-auto rounded-xl border border-zinc-200">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">학번</th>
              <th className="px-3 py-2 font-medium">이름</th>
              <th className="px-3 py-2 font-medium">반</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 font-medium">제출·수정</th>
              {published.questions.map((question, index) => (
                <th key={question.groupId} className="max-w-56 px-3 py-2 font-medium" title={question.title}>
                  {index + 1}. {question.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((student) => (
              <tr
                key={student.studentNo}
                onClick={() => setOpenStudentNo(student.studentNo)}
                className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-violet-50/50"
              >
                <td className="px-3 py-1.5 font-mono text-zinc-800">{student.studentNo}</td>
                <td className="px-3 py-1.5 text-zinc-900">{student.name}</td>
                <td className="px-3 py-1.5 text-zinc-500">{classLabel(student.classKey)}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATE_TONE[student.state]}`}>
                      {STATE_LABEL[student.state]}
                    </span>
                    {student.editedBy === "teacher" ? <TeacherEditBadge /> : null}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-xs text-zinc-500">{formatDateTime(student.updatedAt)}</td>
                {published.questions.map((question) => (
                  <td key={question.groupId} className="max-w-56 truncate px-3 py-1.5 text-xs text-zinc-700">
                    {student.state === "missing"
                      ? ""
                      : (student.picks[question.groupId] ?? []).map((id) => subjectName.get(id) ?? id).join(", ")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">조건에 맞는 학생이 없습니다.</p> : null}
      </div>

      {openStudent ? (
        <StudentResponseModal
          surveyId={surveyId}
          student={openStudent}
          published={published}
          editable={editable}
          onClose={() => setOpenStudentNo(null)}
        />
      ) : null}
    </section>
  );
}
