import { readFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { SCHOOLAPPLY_DB_NAME } from "@/lib/mongodb";
import { isSurveyRound, type Survey, type SurveyRound } from "@/lib/survey-types";
import { ensureSurveyIndexes, type SurveyDocument } from "@/lib/surveys";

loadLocalEnv();

const SOURCE_FILE = path.join(process.cwd(), ".data", "surveys.json");
const COMPARED_FIELDS = [
  "ownerId",
  "school",
  "academicYear",
  "grade",
  "semester",
  "round",
  "note",
  "status",
  "createdAt",
] as const;

type StoredSurvey = Omit<Survey, "round" | "note"> & { round?: number; note?: string };

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

/** 파일 저장 시절 읽을 때마다 하던 차수·비고 보정을 이전 시점에 한 번 적용한다. */
function withRounds(stored: StoredSurvey[]): Survey[] {
  const groups = new Map<string, StoredSurvey[]>();
  for (const survey of stored) {
    const key = [survey.ownerId, survey.school, survey.academicYear, survey.grade, survey.semester].join("\0");
    groups.set(key, [...(groups.get(key) ?? []), survey]);
  }
  const surveys: Survey[] = [];
  for (const group of groups.values()) {
    const used = new Set<SurveyRound>();
    for (const survey of group) {
      if (isSurveyRound(survey.round ?? NaN)) used.add(survey.round as SurveyRound);
    }
    const ordered = [...group].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    for (const survey of ordered) {
      let round = isSurveyRound(survey.round ?? NaN) ? (survey.round as SurveyRound) : undefined;
      round ??= ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).find((value) => !used.has(value));
      if (!round) continue;
      used.add(round);
      surveys.push({ ...survey, round, note: typeof survey.note === "string" ? survey.note : "" });
    }
  }
  return surveys;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI 환경변수가 없습니다. .env.local을 확인하세요.");

  const stored = JSON.parse(readFileSync(SOURCE_FILE, "utf8")) as StoredSurvey[];
  const surveys = withRounds(stored);
  if (surveys.length !== stored.length) {
    throw new Error(`차수를 정할 수 없는 조사가 있어 중단합니다 (${stored.length - surveys.length}개).`);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client.db(SCHOOLAPPLY_DB_NAME).collection<SurveyDocument>("surveys");
    await ensureSurveyIndexes(collection);

    for (const survey of surveys) {
      await collection.updateOne({ id: survey.id }, { $set: survey }, { upsert: true });
    }

    let mismatches = 0;
    for (const survey of surveys) {
      const saved = await collection.findOne({ id: survey.id });
      const differs = !saved || COMPARED_FIELDS.some((field) => saved[field] !== survey[field]);
      if (differs) mismatches += 1;
      console.log(
        `${differs ? "불일치" : "확인"} · ${survey.school} ${survey.academicYear}학년도 ${survey.grade}학년 ${survey.semester}학기 ${survey.round}차`,
      );
    }
    const total = await collection.countDocuments();
    console.log(`파일 ${surveys.length}개 → MongoDB ${total}개, 불일치 ${mismatches}개`);
    if (mismatches > 0) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("이전 중 오류:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
