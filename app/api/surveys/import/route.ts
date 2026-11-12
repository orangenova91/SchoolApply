import { NextResponse } from "next/server";
import { loadCurriculumCatalog } from "@/lib/curriculum";
import { replaceRoster } from "@/lib/respondents";
import { insertImportedResponses } from "@/lib/responses";
import { getSessionFromRequest } from "@/lib/session";
import { catalogRows } from "@/lib/subject-rows";
import { createImportedSurvey, deleteSurvey } from "@/lib/surveys";
import { isSurveyRound, MAX_SURVEY_NOTE, type SurveyRound } from "@/lib/survey-types";
import {
  buildTimetableImport,
  parseTimetableWorkbook,
  timetablePreview,
} from "@/lib/timetable-import";
import type { TimetableImportQuestionConfig } from "@/lib/timetable-import-types";

export const maxDuration = 60;

function integer(value: FormDataEntryValue | null) {
  return typeof value === "string" ? Number(value) : NaN;
}

function uploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "업로드 내용을 읽지 못했습니다." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!uploadedFile(file)) {
    return NextResponse.json({ error: "timetable_form 엑셀 파일을 선택해 주세요." }, { status: 400 });
  }

  try {
    const parsed = await parseTimetableWorkbook(file, catalogRows(await loadCurriculumCatalog()));
    if (formData.get("action") === "preview") {
      return NextResponse.json({ preview: timetablePreview(parsed) });
    }
    if (formData.get("action") !== "create") {
      return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
    }

    const academicYear = integer(formData.get("academicYear"));
    const grade = integer(formData.get("grade"));
    const semester = integer(formData.get("semester"));
    const round = integer(formData.get("round"));
    const note = typeof formData.get("note") === "string" ? String(formData.get("note")).trim() : "";
    if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2100) {
      return NextResponse.json({ error: "학년도는 2000~2100 사이의 정수여야 합니다." }, { status: 400 });
    }
    if (!Number.isInteger(grade) || grade < 1 || grade > 3) {
      return NextResponse.json({ error: "학년은 1, 2, 3 중에서 선택해 주세요." }, { status: 400 });
    }
    if (semester !== 1 && semester !== 2) {
      return NextResponse.json({ error: "학기는 1학기 또는 2학기입니다." }, { status: 400 });
    }
    if (!isSurveyRound(round)) {
      return NextResponse.json({ error: "차수는 1차부터 10차까지 선택할 수 있습니다." }, { status: 400 });
    }
    if (note.length > MAX_SURVEY_NOTE) {
      return NextResponse.json({ error: `비고는 ${MAX_SURVEY_NOTE}자 이하여야 합니다.` }, { status: 400 });
    }

    let questionConfig: TimetableImportQuestionConfig[];
    try {
      const raw = JSON.parse(String(formData.get("questions") ?? ""));
      if (!Array.isArray(raw)) throw new Error();
      questionConfig = raw as TimetableImportQuestionConfig[];
    } catch {
      return NextResponse.json({ error: "문항 설정을 읽지 못했습니다. 파일을 다시 분석해 주세요." }, { status: 400 });
    }
    const built = buildTimetableImport(
      parsed,
      questionConfig,
      { academicYear, grade, semester },
    );
    const survey = await createImportedSurvey({
      ownerId: session.accountId,
      school: session.username,
      academicYear,
      grade,
      semester,
      round: round as SurveyRound,
      note,
      arrangement: built.arrangement,
      form: built.form,
      published: built.published,
      studentNoFormat: built.studentNoFormat,
    });
    if (!survey) {
      return NextResponse.json(
        { error: "같은 학년도, 학년, 학기의 이 차수 조사가 이미 있습니다." },
        { status: 409 },
      );
    }

    try {
      await replaceRoster(survey.id, built.students);
      await insertImportedResponses(survey.id, built.responses);
    } catch (error) {
      await deleteSurvey(session.accountId, survey.id).catch(() => undefined);
      throw error;
    }
    return NextResponse.json(
      {
        survey,
        imported: built.responses.length,
        excluded: built.excluded.length,
        excludedExamples: built.excluded.slice(0, 20),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "엑셀을 가져오지 못했습니다.";
    const expected = !message.includes("Mongo") && !message.includes("ECONN");
    if (!expected) console.error("timetable import failed:", error);
    return NextResponse.json(
      { error: expected ? message : "엑셀을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요." },
      { status: expected ? 400 : 503 },
    );
  }
}
