import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/mongodb";
import { parseAnswers, type PublishedSurvey, type ResponseAnswer } from "@/lib/published-survey";
import { replaceRoster } from "@/lib/respondents";
import { saveResponse } from "@/lib/responses";
import { isSurveyRound } from "@/lib/survey-types";
import type { SurveyDocument } from "@/lib/surveys";

loadLocalEnv();

type CliOptions = {
  source?: string;
  round?: number;
  file?: string;
  pick?: string[];
  apply?: boolean;
};

function loadLocalEnv() {
  let text = "";
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { pick: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const [rawKey, valueFromEq] = argv[i].split("=", 2);
    const value = () => valueFromEq ?? argv[++i];
    switch (rawKey) {
      case "--source":
        options.source = value();
        break;
      case "--round":
        options.round = Number(value());
        break;
      case "--file":
        options.file = value();
        break;
      case "--pick":
        options.pick!.push(value());
        break;
      case "--apply":
        options.apply = true;
        break;
      default:
        console.warn(`[경고] 알 수 없는 옵션을 무시합니다: ${argv[i]}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(
    `
선택과목 응답 엑셀을 원본 조사를 복사한 새 차수 조사에 넣는 스크립트

사용 방법:
  npx tsx scripts/import-responses.ts --source <원본 조사 id> --round 2 --file <엑셀> [--pick 2:1] [--apply]

옵션:
  --source  편성·설문지를 복사할 원본 조사 id (필수)
  --round   새로 만들 조사 차수 (필수)
  --file    응답 엑셀 (1행 문항, 2행 과목명, 4행부터 순번·학번·이름·반배정·선택칸) (필수)
  --pick    그룹 선택 개수 바꾸기, "그룹id:개수" (여러 번 쓸 수 있음)
  --apply   실제로 저장 (없으면 확인만)
`.trim(),
  );
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text);
  }
  return String(value);
}

/** "(수학) 미적분 I (필수) (성취도+5등급)" -> "미적분Ⅰ" */
function normalizeSubject(header: string) {
  return header
    .replace(/^\s*\([^)]*\)\s*/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\bIII\b/g, "Ⅲ")
    .replace(/\bII\b/g, "Ⅱ")
    .replace(/\bI\b/g, "Ⅰ")
    .replace(/(?<=[가-힣])III$/, "Ⅲ")
    .replace(/(?<=[가-힣])II$/, "Ⅱ")
    .replace(/(?<=[가-힣])I$/, "Ⅰ")
    .replace(/\s+/g, "");
}

type ExcelRow = { studentNo: string; name: string; picks: string[][] };

async function readWorkbook(file: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  const questionRow = sheet.getRow(1);
  const subjectRow = sheet.getRow(2);

  const columns: { column: number; question: number; subject: string }[] = [];
  for (let column = 5; column <= sheet.columnCount; column += 1) {
    const question = cellText(questionRow.getCell(column).value).match(/^\s*(\d+)\./);
    const subject = cellText(subjectRow.getCell(column).value);
    if (question && subject) columns.push({ column, question: Number(question[1]), subject });
  }
  const questionNumbers = [...new Set(columns.map((item) => item.question))].sort((a, b) => a - b);

  const rows: ExcelRow[] = [];
  for (let index = 4; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const studentNo = cellText(row.getCell(2).value).trim();
    const name = cellText(row.getCell(3).value).trim();
    if (!studentNo) continue;
    const picks = questionNumbers.map((question) =>
      columns
        .filter((item) => item.question === question && cellText(row.getCell(item.column).value).trim() === "1")
        .map((item) => item.subject),
    );
    rows.push({ studentNo, name, picks });
  }
  return { columns, questionNumbers, rows };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source || !options.round || !options.file) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  if (!isSurveyRound(options.round)) throw new Error(`차수 ${options.round}는 쓸 수 없습니다.`);

  const db = await getDb();
  const surveys = db.collection<SurveyDocument>("surveys");
  const source = await surveys.findOne({ id: options.source }, { projection: { _id: 0 } });
  if (!source?.arrangement || !source.form || !source.published) {
    throw new Error("원본 조사가 없거나 편성·설문지·배포 설문이 갖춰지지 않았습니다.");
  }
  const duplicate = await surveys.findOne({
    ownerId: source.ownerId,
    academicYear: source.academicYear,
    grade: source.grade,
    semester: source.semester,
    round: options.round,
  });
  if (duplicate) throw new Error(`${options.round}차 조사가 이미 있습니다 (${duplicate.id}).`);

  const pickOverrides = new Map(
    options.pick!.map((item) => {
      const [groupId, count] = item.split(":").map(Number);
      return [groupId, count] as const;
    }),
  );
  const instructionFor = (subjectCount: number, pickCount: number) =>
    `${subjectCount}과목 중 ${pickCount}과목을 선택하세요`;

  const arrangement = {
    ...source.arrangement,
    groups: source.arrangement.groups.map((group) =>
      pickOverrides.has(group.id) ? { ...group, pickCount: pickOverrides.get(group.id)! } : group,
    ),
  };
  const now = new Date().toISOString();
  const form = {
    ...source.form,
    updatedAt: now,
    completedAt: now,
    questions: source.form.questions.map((question) => {
      const group = arrangement.groups.find((item) => item.id === question.groupId);
      return pickOverrides.has(question.groupId) && group
        ? { ...question, instruction: instructionFor(group.subjectIds.length, group.pickCount) }
        : question;
    }),
  };
  const published: PublishedSurvey = {
    ...source.published,
    publishedAt: now,
    questions: source.published.questions.map((question) =>
      pickOverrides.has(question.groupId)
        ? {
            ...question,
            pickCount: pickOverrides.get(question.groupId)!,
            instruction: instructionFor(question.subjects.length, pickOverrides.get(question.groupId)!),
          }
        : question,
    ),
  };

  const { columns, questionNumbers, rows } = await readWorkbook(options.file);
  if (questionNumbers.length !== published.questions.length) {
    throw new Error(`엑셀 문항 ${questionNumbers.length}개와 설문 문항 ${published.questions.length}개가 다릅니다.`);
  }

  const subjectIdByQuestion = published.questions.map((question, index) => {
    const bySubject = new Map(question.subjects.map((subject) => [normalizeSubject(subject.subject), subject.id]));
    const mapping = new Map<string, string>();
    for (const item of columns.filter((column) => column.question === questionNumbers[index])) {
      const id = bySubject.get(normalizeSubject(item.subject));
      if (!id) throw new Error(`${index + 1}번 문항에서 "${item.subject}" 과목을 설문에서 찾지 못했습니다.`);
      mapping.set(item.subject, id);
    }
    return mapping;
  });

  console.log(`원본 조사: ${source.school} ${source.academicYear}학년도 ${source.grade}학년 ${source.semester}학기 ${source.round}차`);
  for (const [index, question] of published.questions.entries()) {
    console.log(`  ${index + 1}번 ${question.title}: ${question.subjects.length}과목 중 ${question.pickCount}개`);
    for (const [header, id] of subjectIdByQuestion[index]) {
      const subject = question.subjects.find((item) => item.id === id)!.subject;
      console.log(`     ${header}  ->  ${subject}`);
    }
  }

  const students: { studentNo: string; name: string }[] = [];
  const answersByStudent = new Map<string, ResponseAnswer[]>();
  const failures: string[] = [];
  for (const row of rows) {
    students.push({ studentNo: row.studentNo, name: row.name });
    const answers = published.questions.map((question, index) => ({
      groupId: question.groupId,
      subjectIds: row.picks[index].map((header) => subjectIdByQuestion[index].get(header)!),
    }));
    const parsed = parseAnswers(answers, published);
    if (parsed.ok) answersByStudent.set(row.studentNo, parsed.value);
    else failures.push(`${row.studentNo} ${row.name}: ${parsed.error}`);
  }
  console.log(`학생 ${students.length}명, 유효한 응답 ${answersByStudent.size}명, 오류 ${failures.length}명`);
  for (const failure of failures.slice(0, 20)) console.log(`  ${failure}`);
  if (failures.length > 0) throw new Error("오류가 있는 응답이 있어 저장하지 않습니다.");

  if (!options.apply) {
    console.log(`확인만 했습니다. 저장하려면 --apply를 붙여 다시 실행하세요.`);
    return;
  }

  const id = randomUUID();
  await surveys.insertOne({
    id,
    ownerId: source.ownerId,
    school: source.school,
    academicYear: source.academicYear,
    grade: source.grade,
    semester: source.semester,
    round: options.round,
    note: "",
    status: "closed",
    createdAt: now,
    closedAt: now,
    closedBy: "teacher",
    arrangement,
    form,
    published,
    distribution: {
      token: randomBytes(6).toString("base64url"),
      createdAt: now,
      studentNoFormat: source.distribution?.studentNoFormat ?? "5",
    },
  });
  const summary = await replaceRoster(id, students);
  let saved = 0;
  for (const [studentNo, answers] of answersByStudent) {
    if (await saveResponse(id, studentNo, answers, "student", null)) saved += 1;
  }
  console.log(`${options.round}차 조사를 만들었습니다 (${id}, 마감 상태).`);
  console.log(`명단 ${summary.added}명, 응답 ${saved}건을 저장했습니다.`);
}

main()
  .catch((error) => {
    console.error("가져오기 중 오류가 발생했습니다:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
