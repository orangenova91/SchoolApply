"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { DistributionStatusCard } from "@/components/distribution-status-card";
import { SlipPrintModal } from "@/components/slip-print-modal";
import type { RespondentView } from "@/lib/respondents";
import type { SurveyStatus, SurveyTiming } from "@/lib/survey-types";
import {
  STUDENT_NO_FORMATS,
  classKey,
  classLabel,
  parseRosterText,
  suggestStudentNoFormat,
  type StudentNoFormat,
} from "@/lib/roster";

type ImportSource = "paste" | "csv";

const STATUS_TEXT: Record<SurveyStatus, string> = {
  preparing: "배포 전",
  open: "신청 중",
  closed: "마감",
  assigned: "배정 완료",
};

const PASTE_PLACEHOLDER: Record<StudentNoFormat, string> = {
  "5": "20101\t김가온\n20102\t나하늘\n20103\t도윤서",
  "4": "2101\t김가온\n2102\t나하늘\n2103\t도윤서",
};

function formatInfo(format: StudentNoFormat) {
  return STUDENT_NO_FORMATS.find((item) => item.value === format)!;
}

function downloadRosterTemplate() {
  const blob = new Blob(["\uFEFF학번,이름\r\n"], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "학생명단_양식.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function readCsvFile(file: File) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

function classCounts(studentNos: string[]) {
  const counts = new Map<string, number>();
  for (const studentNo of studentNos) {
    const key = classKey(studentNo);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function RosterImport({
  hasRoster,
  savedFormat,
  saving,
  onCancel,
  onSave,
}: {
  hasRoster: boolean;
  savedFormat: StudentNoFormat;
  saving: boolean;
  onCancel: () => void;
  onSave: (students: { studentNo: string; name: string }[], format: StudentNoFormat) => void;
}) {
  const [source, setSource] = useState<ImportSource>("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState(savedFormat);
  const lines = useMemo(() => parseRosterText(text, format), [text, format]);
  const suggestion = useMemo(() => suggestStudentNoFormat(text), [text]);
  const formatChanged = hasRoster && format !== savedFormat;
  const valid = lines.filter((line) => !line.error);
  const invalid = lines.length - valid.length;
  const cleanedCount = valid.filter((line) => line.cleaned).length;
  const counts = classCounts(valid.map((line) => line.studentNo));

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await readCsvFile(file));
  }

  function save() {
    if (
      formatChanged &&
      !window.confirm(
        `학번 형식을 ${formatInfo(format).label}로 바꾸면 기존 학생은 모두 삭제되고 새 명단의 학생에게 접속 코드가 새로 발급됩니다. 저장할까요?`,
      )
    ) {
      return;
    }
    onSave(
      valid.map(({ studentNo, name }) => ({ studentNo, name })),
      format,
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">학번 형식</span>
        {STUDENT_NO_FORMATS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFormat(option.value)}
            aria-pressed={format === option.value}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
              format === option.value
                ? "bg-violet-700 text-white ring-violet-700"
                : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {option.label} <span className="opacity-75">({option.rule}, 예 {option.example})</span>
          </button>
        ))}
      </div>
      {text.trim() && suggestion && suggestion !== format ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            입력한 학번이 {formatInfo(suggestion).label}(예 {formatInfo(suggestion).example})로 보입니다.
          </span>
          <button
            type="button"
            onClick={() => setFormat(suggestion)}
            className="rounded-md bg-white px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            {formatInfo(suggestion).label}로 바꾸기
          </button>
        </div>
      ) : null}
      {formatChanged ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          학번 형식이 바뀌면 기존 학생은 모두 삭제되고, 새 명단의 학생에게 접속 코드가 새로 발급됩니다.
        </p>
      ) : null}
      <div className="flex gap-1 rounded-lg bg-zinc-200/70 p-1 text-sm font-medium">
        {(["paste", "csv"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSource(option)}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              source === option ? "bg-white text-violet-700 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {option === "paste" ? "엑셀에서 붙여넣기" : "CSV 파일 올리기"}
          </button>
        ))}
      </div>

      {source === "paste" ? (
        <>
          <p className="mt-3 text-xs text-zinc-500">엑셀에서 학번과 이름 두 열을 복사해 아래에 붙여 넣으세요.</p>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder={PASTE_PLACEHOLDER[format]}
            aria-label="명단 붙여넣기"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              첫 열 학번, 둘째 열 이름인 CSV 파일을 고르세요. 엑셀에서 저장한 파일(CP949)도 읽을 수 있습니다.
            </p>
            <button
              type="button"
              onClick={downloadRosterTemplate}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              CSV 양식 내려받기
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            양식의 첫 줄(학번, 이름)은 그대로 두고, 둘째 줄부터 학생을 한 줄에 한 명씩 입력해 저장하세요.
          </p>
          <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-600 hover:border-violet-300">
            <span className="rounded-md bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">파일 선택</span>
            <span className="truncate">{fileName || "선택한 파일이 없습니다"}</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="sr-only" />
          </label>
        </>
      )}

      {lines.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm">
            <span className="font-medium text-zinc-900">정상 {valid.length}명</span>
            {invalid > 0 ? <span className="ml-2 font-medium text-red-600">오류 {invalid}줄 (저장에서 제외)</span> : null}
          </p>
          {cleanedCount > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              학번 칸의 보이지 않는 공백·기호를 정리했습니다 ({cleanedCount}줄).
            </p>
          ) : null}
          {counts.length > 0 ? (
            <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-600">
              {counts.map(([key, count]) => (
                <span key={key} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-zinc-200">
                  {classLabel(key)} {count}명
                </span>
              ))}
            </p>
          ) : null}
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="w-12 px-3 py-1.5 font-medium">줄</th>
                  <th className="w-20 px-3 py-1.5 font-medium">학번</th>
                  <th className="px-3 py-1.5 font-medium">이름</th>
                  <th className="px-3 py-1.5 font-medium">확인</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.line} className={line.error ? "bg-red-50 text-red-700" : "border-t border-zinc-100"}>
                    <td className="px-3 py-1 text-zinc-400">{line.line}</td>
                    <td className="px-3 py-1 font-mono">{line.studentNo}</td>
                    <td className="px-3 py-1">{line.name}</td>
                    <td className="px-3 py-1">
                      {line.error ?? (line.cleaned ? <span className="text-zinc-500">정상 · 정리함</span> : "정상")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {hasRoster ? (
        <p className="mt-3 text-xs text-amber-700">
          기존 학생의 접속 코드는 그대로 유지되고 새 학생만 코드가 발급됩니다. 새 명단에 없는 학생은 삭제됩니다.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        {hasRoster ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            취소
          </button>
        ) : null}
        <button
          type="button"
          disabled={valid.length === 0 || saving}
          onClick={save}
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중…" : `명단 저장 (${valid.length}명)`}
        </button>
      </div>
    </div>
  );
}

export function DistributionPanel({
  surveyId,
  formTitle,
  surveyUrl,
  qrDataUrl,
  initialRespondents,
  initialFormat,
  status,
  timing,
  hasPublished,
  responseCount,
  imported = false,
}: {
  imported?: boolean;
  status: SurveyStatus;
  timing: SurveyTiming;
  hasPublished: boolean;
  responseCount: number;
  initialFormat: StudentNoFormat;
  surveyId: string;
  formTitle: string;
  surveyUrl: string;
  qrDataUrl: string;
  initialRespondents: RespondentView[];
}) {
  const router = useRouter();
  const [respondents, setRespondents] = useState(initialRespondents);
  const [studentNoFormat, setStudentNoFormat] = useState(initialFormat);
  const [importing, setImporting] = useState(initialRespondents.length === 0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [showCodes, setShowCodes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const closePrinting = useCallback(() => setPrinting(false), []);

  const counts = classCounts(respondents.map((respondent) => respondent.studentNo));
  const visible = classFilter
    ? respondents.filter((respondent) => classKey(respondent.studentNo) === classFilter)
    : respondents;
  const classQuery = classFilter ? `?class=${classFilter}` : "";

  async function saveRoster(
    students: { studentNo: string; name: string }[],
    format: StudentNoFormat,
    confirmRemoval = false,
  ) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/respondents`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students, format, confirmRemoval }),
      });
      const data = (await response.json()) as {
        respondents?: RespondentView[];
        summary?: { added: number; kept: number; removed: number };
        error?: string;
        needsConfirm?: boolean;
      };
      if (data.needsConfirm && !confirmRemoval) {
        setSaving(false);
        if (window.confirm(`${data.error} 계속할까요?`)) await saveRoster(students, format, true);
        return;
      }
      if (!response.ok || !data.respondents || !data.summary) {
        setMessage({ tone: "error", text: data.error ?? "명단을 저장하지 못했습니다." });
        return;
      }
      setRespondents(data.respondents);
      setStudentNoFormat(format);
      setImporting(false);
      setClassFilter("");
      const { added, kept, removed } = data.summary;
      setMessage({
        tone: "ok",
        text: `명단을 저장했습니다. 새로 추가 ${added}명 · 유지 ${kept}명${removed ? ` · 삭제 ${removed}명` : ""}`,
      });
    } catch {
      setMessage({ tone: "error", text: "명단을 저장하지 못했습니다. 네트워크 연결을 확인해 주세요." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoster(confirmRemoval = false) {
    if (
      !confirmRemoval &&
      !window.confirm(`학생 ${respondents.length}명의 명단과 접속 코드를 모두 삭제할까요? 되돌릴 수 없습니다.`)
    ) {
      return;
    }
    setDeleting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/respondents${confirmRemoval ? "?confirm=1" : ""}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        removed?: number;
        deletedResponses?: number;
        error?: string;
        needsConfirm?: boolean;
      };
      if (data.needsConfirm && !confirmRemoval) {
        setDeleting(false);
        if (window.confirm(`${data.error} 계속할까요?`)) await deleteRoster(true);
        return;
      }
      if (!response.ok) {
        setMessage({ tone: "error", text: data.error ?? "명단을 삭제하지 못했습니다." });
        return;
      }
      setRespondents([]);
      setImporting(true);
      setClassFilter("");
      setShowCodes(false);
      setMessage({
        tone: "ok",
        text: `명단을 삭제했습니다. 학생 ${data.removed ?? 0}명${data.deletedResponses ? ` · 응답 ${data.deletedResponses}건` : ""}`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "명단을 삭제하지 못했습니다. 네트워크 연결을 확인해 주세요." });
    } finally {
      setDeleting(false);
    }
  }

  async function reissue(studentNos: string[], label: string) {
    if (!window.confirm(`${label}의 접속 코드를 다시 발급할까요? 이전 코드는 바로 쓸 수 없게 됩니다.`)) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/respondents/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentNos }),
      });
      const data = (await response.json()) as { respondents?: RespondentView[]; reissued?: number; error?: string };
      if (!response.ok || !data.respondents) {
        setMessage({ tone: "error", text: data.error ?? "코드를 다시 발급하지 못했습니다." });
        return;
      }
      setRespondents(data.respondents);
      setShowCodes(true);
      setMessage({ tone: "ok", text: `${label}의 접속 코드를 다시 발급했습니다 (${data.reissued}명).` });
    } catch {
      setMessage({ tone: "error", text: "코드를 다시 발급하지 못했습니다. 네트워크 연결을 확인해 주세요." });
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">① 학생 명단</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {respondents.length > 0
                ? `${respondents.length}명 · ${counts.length}개 반 · 학번 ${formatInfo(studentNoFormat).label}`
                : "설문에 응답할 학생의 학번과 이름을 올려 주세요."}
            </p>
          </div>
          {respondents.length > 0 && !importing && !imported ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImporting(true)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                명단 다시 올리기
              </button>
              <button
                type="button"
                disabled={deleting || status === "open" || status === "assigned"}
                title={
                  status === "open"
                    ? "신청 중에는 삭제할 수 없습니다"
                    : status === "assigned"
                      ? "배정이 끝난 조사는 삭제할 수 없습니다"
                      : undefined
                }
                onClick={() => deleteRoster()}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "삭제 중…" : "명단 삭제"}
              </button>
            </div>
          ) : null}
        </div>

        {importing ? (
          <RosterImport
            hasRoster={respondents.length > 0}
            savedFormat={studentNoFormat}
            saving={saving}
            onCancel={() => setImporting(false)}
            onSave={saveRoster}
          />
        ) : null}

        {respondents.length > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setClassFilter("")}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                  classFilter === "" ? "bg-violet-700 text-white ring-violet-700" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
                }`}
              >
                전체 {respondents.length}
              </button>
              {counts.map(([key, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClassFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                    classFilter === key ? "bg-violet-700 text-white ring-violet-700" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  {classLabel(key)} {count}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={showCodes}
                  onChange={(event) => setShowCodes(event.target.checked)}
                  className="size-4 accent-violet-700"
                />
                접속 코드 보기
              </label>
            </div>
            <div className="mt-3 max-h-96 overflow-y-auto rounded-xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="w-24 px-4 py-2 font-medium">학번</th>
                    <th className="px-4 py-2 font-medium">이름</th>
                    <th className="w-28 px-4 py-2 font-medium">반</th>
                    <th className="w-32 px-4 py-2 font-medium">접속 코드</th>
                    <th className="w-20 px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((respondent) => (
                    <tr key={respondent.studentNo} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-1.5 font-mono text-zinc-800">{respondent.studentNo}</td>
                      <td className="px-4 py-1.5 text-zinc-900">{respondent.name}</td>
                      <td className="px-4 py-1.5 text-zinc-500">{classLabel(classKey(respondent.studentNo))}</td>
                      <td className="px-4 py-1.5 font-mono tracking-widest text-zinc-800">
                        {showCodes ? respondent.code : "••••••"}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => reissue([respondent.studentNo], `${respondent.name}(${respondent.studentNo})`)}
                          className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                        >
                          재발급
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">② 설문 주소와 접속 코드 쪽지</h2>
        <p className="mt-1 text-sm text-zinc-500">
          학생은 이 주소에 접속해 학번과 접속 코드로 로그인합니다. 배포를 시작한 뒤부터 접속할 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="설문 주소 QR 코드" className="size-24 rounded-lg border border-zinc-200" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-500">설문 주소</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 truncate rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-800">{surveyUrl}</code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
          </div>
        </div>

        {respondents.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
            <p className="mr-auto text-sm text-zinc-600">
              {classFilter ? `${classLabel(classFilter)} ${visible.length}명` : `전체 ${respondents.length}명`}의 접속 코드
              <span className="ml-1 text-xs text-zinc-400">(위 명단에서 반을 고르면 그 반만)</span>
            </p>
            <button
              type="button"
              onClick={() => setPrinting(true)}
              className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800"
            >
              쪽지 인쇄
            </button>
            <a
              href={`/api/surveys/${surveyId}/respondents/export${classQuery}`}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              CSV 내려받기
            </a>
            <button
              type="button"
              onClick={() =>
                reissue(
                  visible.map((respondent) => respondent.studentNo),
                  classFilter ? classLabel(classFilter) : "전체 학생",
                )
              }
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              코드 모두 재발급
            </button>
          </div>
        ) : null}
      </section>

      <DistributionStatusCard
        surveyId={surveyId}
        surveyUrl={surveyUrl}
        status={status}
        timing={timing}
        respondentCount={respondents.length}
        responseCount={responseCount}
        imported={imported}
      />

      <div className="sticky bottom-0 z-10 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            {respondents.length > 0
              ? `명단 ${respondents.length}명 · 응답 ${responseCount}명 · ${STATUS_TEXT[status]}`
              : "학생 명단을 올려 주세요"}
          </p>
          <div className="flex gap-2">
            <Link
              href={`/surveys/${surveyId}/form`}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ← 이전: 설문지 양식
            </Link>
            {hasPublished ? (
              <Link
                href={`/surveys/${surveyId}/results`}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
              >
                다음: 응답 확인 →
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {printing ? (
        <SlipPrintModal
          formTitle={formTitle}
          surveyUrl={surveyUrl}
          qrDataUrl={qrDataUrl}
          respondents={respondents}
          classCounts={counts}
          initialClass={classFilter}
          onClose={closePrinting}
        />
      ) : null}
    </div>
  );
}
