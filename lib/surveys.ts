import { randomBytes, randomUUID } from "node:crypto";
import type { Collection, Document, Filter } from "mongodb";
import type { SurveyArrangement } from "@/lib/arrangement";
import type { SurveyAssignment } from "@/lib/assignment";
import { getDb } from "@/lib/mongodb";
import type { PublishedSurvey } from "@/lib/published-survey";
import { deleteRespondentsBySurvey } from "@/lib/respondents";
import { deleteResponses } from "@/lib/responses";
import { DEFAULT_STUDENT_NO_FORMAT, type StudentNoFormat } from "@/lib/roster";
import type { SurveyForm } from "@/lib/survey-form";
import type { Survey, SurveyRound, SurveyStatus } from "@/lib/survey-types";

export type { Survey };

export type SurveyDistribution = { token: string; createdAt: string; studentNoFormat?: StudentNoFormat };

export type SurveyDocument = Survey & {
  arrangement?: SurveyArrangement;
  form?: SurveyForm;
  distribution?: SurveyDistribution;
  published?: PublishedSurvey;
  assignment?: SurveyAssignment;
};

const SURVEY_PROJECTION = { _id: 0, arrangement: 0, form: 0, distribution: 0, published: 0, assignment: 0 } as const;

declare global {
  var _surveyIndexesPromise: Promise<unknown> | undefined;
}

export async function ensureSurveyIndexes(collection: Collection<SurveyDocument>) {
  await Promise.all([
    collection.createIndex({ id: 1 }, { unique: true }),
    collection.createIndex(
      { ownerId: 1, academicYear: 1, grade: 1, semester: 1, round: 1 },
      { unique: true },
    ),
    collection.createIndex({ "distribution.token": 1 }, { unique: true, sparse: true }),
  ]);
}

async function surveysCollection(): Promise<Collection<SurveyDocument>> {
  const db = await getDb();
  const collection = db.collection<SurveyDocument>("surveys");
  global._surveyIndexesPromise ??= ensureSurveyIndexes(collection).catch((error) => {
    global._surveyIndexesPromise = undefined;
    throw error;
  });
  await global._surveyIndexesPromise;
  return collection;
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/** 예약 마감 시각이 지난 신청 중 조사를 마감한다. 따로 도는 작업 없이 조사를 읽을 때마다 먼저 부른다. */
async function closeExpiredSurveys(collection: Collection<SurveyDocument>, filter: Filter<SurveyDocument>) {
  await collection.updateMany({ ...filter, status: "open", closesAt: { $lte: new Date().toISOString() } }, [
    { $set: { status: "closed", closedAt: "$closesAt", closedBy: "schedule" } },
  ]);
}

export async function listSurveys(ownerId: string): Promise<Survey[]> {
  const collection = await surveysCollection();
  await closeExpiredSurveys(collection, { ownerId });
  return collection.find({ ownerId }, { projection: SURVEY_PROJECTION }).sort({ createdAt: -1 }).toArray();
}

export async function getSurvey(ownerId: string, id: string): Promise<Survey | null> {
  const collection = await surveysCollection();
  await closeExpiredSurveys(collection, { ownerId, id });
  return collection.findOne({ ownerId, id }, { projection: SURVEY_PROJECTION });
}

export async function getSurveyArrangement(ownerId: string, id: string): Promise<SurveyArrangement | null> {
  const collection = await surveysCollection();
  const document = await collection.findOne({ ownerId, id }, { projection: { _id: 0, arrangement: 1 } });
  return document?.arrangement ?? null;
}

export async function saveSurveyArrangement(
  ownerId: string,
  id: string,
  arrangement: SurveyArrangement,
): Promise<boolean> {
  const collection = await surveysCollection();
  const result = await collection.updateOne({ ownerId, id }, { $set: { arrangement } });
  return result.matchedCount > 0;
}

export async function getSurveyFlow(
  ownerId: string,
  id: string,
): Promise<{
  arrangement: SurveyArrangement | null;
  form: SurveyForm | null;
  published: PublishedSurvey | null;
}> {
  const collection = await surveysCollection();
  const document = await collection.findOne(
    { ownerId, id },
    { projection: { _id: 0, arrangement: 1, form: 1, published: 1 } },
  );
  return {
    arrangement: document?.arrangement ?? null,
    form: document?.form ?? null,
    published: document?.published ?? null,
  };
}

/** 학생이 접속할 설문 주소의 토큰. 처음 부를 때 만들고 이후로는 같은 값을 돌려준다. */
export async function ensureDistributionToken(ownerId: string, id: string): Promise<string | null> {
  const collection = await surveysCollection();
  const current = await collection.findOne({ ownerId, id }, { projection: { _id: 0, distribution: 1 } });
  if (!current) return null;
  if (current.distribution?.token) return current.distribution.token;

  const distribution: SurveyDistribution = {
    token: randomBytes(6).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  await collection.updateOne(
    { ownerId, id, "distribution.token": { $exists: false } },
    { $set: { distribution } },
  );
  const saved = await collection.findOne({ ownerId, id }, { projection: { _id: 0, distribution: 1 } });
  return saved?.distribution?.token ?? null;
}

export async function getStudentNoFormat(ownerId: string, id: string): Promise<StudentNoFormat> {
  const collection = await surveysCollection();
  const document = await collection.findOne({ ownerId, id }, { projection: { _id: 0, distribution: 1 } });
  return document?.distribution?.studentNoFormat ?? DEFAULT_STUDENT_NO_FORMAT;
}

export async function setStudentNoFormat(ownerId: string, id: string, format: StudentNoFormat) {
  const collection = await surveysCollection();
  await collection.updateOne(
    { ownerId, id, "distribution.token": { $exists: true } },
    { $set: { "distribution.studentNoFormat": format } },
  );
}

/** 학생 화면에서 설문 주소로 조사를 찾는다 (학교 확인 없이). */
export async function getSurveyByToken(token: string) {
  const collection = await surveysCollection();
  await closeExpiredSurveys(collection, { "distribution.token": token });
  return collection.findOne(
    { "distribution.token": token },
    { projection: { _id: 0, arrangement: 0, form: 0, assignment: 0 } },
  );
}

/**
 * from 상태일 때만 to로 바꾼다. 배포를 시작할 때는 고정한 설문을 함께 저장한다.
 * 마감하면 마감 시각을 남기고, 다시 열거나 되돌리면 마감 시각과 이미 지난 예약 마감을 지운다.
 */
export async function changeSurveyStatus(
  ownerId: string,
  id: string,
  from: SurveyStatus[],
  to: SurveyStatus,
  published?: PublishedSurvey,
): Promise<boolean> {
  const collection = await surveysCollection();
  const now = new Date().toISOString();
  const fields: Document =
    to === "closed"
      ? { closedAt: now, closedBy: "teacher" }
      : {
          closedAt: "$$REMOVE",
          closedBy: "$$REMOVE",
          closesAt: { $cond: [{ $lte: ["$closesAt", now] }, "$$REMOVE", "$closesAt"] },
        };
  const result = await collection.updateOne({ ownerId, id, status: { $in: from } }, [
    { $set: { status: to, ...fields, ...(published ? { published: { $literal: published } } : {}) } },
  ]);
  return result.matchedCount > 0;
}

/** 예약 마감을 정하거나(closesAt) 지운다(null). 준비·신청 중인 조사에서만 바꿀 수 있다. */
export async function setCloseSchedule(ownerId: string, id: string, closesAt: string | null): Promise<boolean> {
  const collection = await surveysCollection();
  const result = await collection.updateOne(
    { ownerId, id, status: { $in: ["preparing", "open"] } },
    closesAt ? { $set: { closesAt } } : { $unset: { closesAt: "" } },
  );
  return result.matchedCount > 0;
}

export async function saveSurveyForm(ownerId: string, id: string, form: SurveyForm): Promise<boolean> {
  const collection = await surveysCollection();
  const result = await collection.updateOne({ ownerId, id }, { $set: { form } });
  return result.matchedCount > 0;
}

export async function getSurveyAssignment(ownerId: string, id: string): Promise<SurveyAssignment | null> {
  const collection = await surveysCollection();
  const document = await collection.findOne({ ownerId, id }, { projection: { _id: 0, assignment: 1 } });
  return document?.assignment ?? null;
}

/** 반 편성은 마감한 조사에서만 바꾼다. 확정(배정 완료)한 뒤에는 확정을 풀어야 고칠 수 있다. */
export async function saveSurveyAssignment(ownerId: string, id: string, assignment: SurveyAssignment): Promise<boolean> {
  const collection = await surveysCollection();
  const result = await collection.updateOne({ ownerId, id, status: "closed" }, { $set: { assignment } });
  return result.matchedCount > 0;
}

/** 확정하면 배정 완료 상태가 되어 응답 수정과 반 편성 변경이 잠긴다. */
export async function setAssignmentConfirmed(ownerId: string, id: string, confirmed: boolean): Promise<boolean> {
  const collection = await surveysCollection();
  const result = confirmed
    ? await collection.updateOne(
        { ownerId, id, status: "closed", assignment: { $exists: true } },
        { $set: { status: "assigned", "assignment.confirmedAt": new Date().toISOString() } },
      )
    : await collection.updateOne(
        { ownerId, id, status: "assigned" },
        { $set: { status: "closed" }, $unset: { "assignment.confirmedAt": "" } },
      );
  return result.matchedCount > 0;
}

export async function countSurveysByOwners(ownerIds: string[]): Promise<Map<string, number>> {
  const collection = await surveysCollection();
  const counts = new Map(ownerIds.map((ownerId) => [ownerId, 0]));
  const rows = await collection
    .aggregate<{ _id: string; count: number }>([
      { $match: { ownerId: { $in: ownerIds } } },
      { $group: { _id: "$ownerId", count: { $sum: 1 } } },
    ])
    .toArray();
  for (const row of rows) counts.set(row._id, row.count);
  return counts;
}

export async function deleteSurvey(ownerId: string, id: string): Promise<boolean> {
  const collection = await surveysCollection();
  const result = await collection.deleteOne({ ownerId, id });
  if (result.deletedCount > 0) {
    await deleteRespondentsBySurvey(id);
    await deleteResponses(id);
  }
  return result.deletedCount > 0;
}

export async function deleteSurveysByOwner(ownerId: string): Promise<number> {
  const collection = await surveysCollection();
  const ids = (await collection.find({ ownerId }, { projection: { _id: 0, id: 1 } }).toArray()).map((doc) => doc.id);
  const result = await collection.deleteMany({ ownerId });
  for (const id of ids) {
    await deleteRespondentsBySurvey(id);
    await deleteResponses(id);
  }
  return result.deletedCount;
}

export async function createSurvey(input: {
  ownerId: string;
  school: string;
  academicYear: number;
  grade: number;
  semester: 1 | 2;
  round: SurveyRound;
  note: string;
}): Promise<Survey | null> {
  const collection = await surveysCollection();
  const survey: Survey = {
    id: randomUUID(),
    ownerId: input.ownerId,
    school: input.school,
    academicYear: input.academicYear,
    grade: input.grade,
    semester: input.semester,
    round: input.round,
    note: input.note,
    status: "preparing",
    createdAt: new Date().toISOString(),
  };
  try {
    await collection.insertOne({ ...survey });
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
  return survey;
}

/** timetable_form에서 편성·설문·응답을 바로 만들 때 쓸 마감 상태 조사 본문을 저장한다. */
export async function createImportedSurvey(input: {
  ownerId: string;
  school: string;
  academicYear: number;
  grade: number;
  semester: 1 | 2;
  round: SurveyRound;
  note: string;
  arrangement: SurveyArrangement;
  form: SurveyForm;
  published: PublishedSurvey;
  studentNoFormat: StudentNoFormat;
}): Promise<Survey | null> {
  const collection = await surveysCollection();
  const now = new Date().toISOString();
  const survey: Survey = {
    id: randomUUID(),
    ownerId: input.ownerId,
    school: input.school,
    academicYear: input.academicYear,
    grade: input.grade,
    semester: input.semester,
    round: input.round,
    note: input.note,
    status: "closed",
    origin: "timetable_import",
    createdAt: now,
    closedAt: now,
    closedBy: "teacher",
  };
  try {
    await collection.insertOne({
      ...survey,
      arrangement: input.arrangement,
      form: input.form,
      published: input.published,
      distribution: {
        token: randomBytes(6).toString("base64url"),
        createdAt: now,
        studentNoFormat: input.studentNoFormat,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
  return survey;
}
