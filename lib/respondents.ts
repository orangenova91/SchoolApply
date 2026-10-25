import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { decryptAccessCode, encryptAccessCode, generateAccessCode } from "@/lib/respondent-codes";
import type { RosterStudent } from "@/lib/roster";

export type RespondentDocument = {
  surveyId: string;
  studentNo: string;
  name: string;
  codeCipher: string;
  codeIssuedAt: string;
  createdAt: string;
  failedAttempts?: number;
  lockedUntil?: string;
};

export type RespondentView = {
  studentNo: string;
  name: string;
  code: string;
  codeIssuedAt: string;
};

declare global {
  var _respondentIndexesPromise: Promise<unknown> | undefined;
}

async function respondentsCollection(): Promise<Collection<RespondentDocument>> {
  const db = await getDb();
  const collection = db.collection<RespondentDocument>("respondents");
  global._respondentIndexesPromise ??= collection
    .createIndex({ surveyId: 1, studentNo: 1 }, { unique: true })
    .catch((error) => {
      global._respondentIndexesPromise = undefined;
      throw error;
    });
  await global._respondentIndexesPromise;
  return collection;
}

function issueCode(now: string) {
  return { codeCipher: encryptAccessCode(generateAccessCode()), codeIssuedAt: now };
}

export async function listRespondents(surveyId: string): Promise<RespondentView[]> {
  const collection = await respondentsCollection();
  const documents = await collection.find({ surveyId }).sort({ studentNo: 1 }).toArray();
  return documents.map((document) => ({
    studentNo: document.studentNo,
    name: document.name,
    code: decryptAccessCode(document.codeCipher) ?? "",
    codeIssuedAt: document.codeIssuedAt,
  }));
}

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 10;

export async function findRespondent(surveyId: string, studentNo: string) {
  const collection = await respondentsCollection();
  return collection.findOne({ surveyId, studentNo }, { projection: { _id: 0 } });
}

/** 같은 학번이 연달아 틀리면 그 학번만 잠깐 잠근다. 학교는 인터넷 주소를 함께 쓰는 경우가 많아 학번 단위로 막는다. */
export async function recordLoginFailure(surveyId: string, studentNo: string) {
  const collection = await respondentsCollection();
  const updated = await collection.findOneAndUpdate(
    { surveyId, studentNo },
    { $inc: { failedAttempts: 1 } },
    { returnDocument: "after", projection: { failedAttempts: 1 } },
  );
  if ((updated?.failedAttempts ?? 0) >= LOGIN_MAX_FAILURES) {
    await collection.updateOne(
      { surveyId, studentNo },
      {
        $set: { lockedUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000).toISOString() },
        $unset: { failedAttempts: "" },
      },
    );
  }
}

export async function clearLoginFailures(surveyId: string, studentNo: string) {
  const collection = await respondentsCollection();
  await collection.updateOne({ surveyId, studentNo }, { $unset: { failedAttempts: "", lockedUntil: "" } });
}

/** 접속 코드 없이 학번·이름만 (응답 확인 단계) */
export async function listRespondentNames(surveyId: string) {
  const collection = await respondentsCollection();
  return collection
    .find({ surveyId }, { projection: { _id: 0, studentNo: 1, name: 1 } })
    .sort({ studentNo: 1 })
    .toArray();
}

export async function existingStudentNos(surveyId: string) {
  const collection = await respondentsCollection();
  return (await collection.find({ surveyId }, { projection: { studentNo: 1 } }).toArray()).map((doc) => doc.studentNo);
}

/** 명단을 통째로 바꾼다. 남아 있는 학생은 코드를 그대로 두고, 새 학생만 코드를 새로 받는다. */
export async function replaceRoster(surveyId: string, students: RosterStudent[]) {
  const collection = await respondentsCollection();
  const now = new Date().toISOString();
  const existing = new Set(await existingStudentNos(surveyId));
  const incoming = new Set(students.map((student) => student.studentNo));

  const removed = [...existing].filter((studentNo) => !incoming.has(studentNo));
  if (removed.length > 0) await collection.deleteMany({ surveyId, studentNo: { $in: removed } });

  if (students.length > 0) {
    await collection.bulkWrite(
      students.map((student) => ({
        updateOne: {
          filter: { surveyId, studentNo: student.studentNo },
          update: {
            $set: { name: student.name },
            $setOnInsert: { surveyId, studentNo: student.studentNo, createdAt: now, ...issueCode(now) },
          },
          upsert: true,
        },
      })),
    );
  }

  return {
    added: students.filter((student) => !existing.has(student.studentNo)).length,
    kept: students.filter((student) => existing.has(student.studentNo)).length,
    removed: removed.length,
    removedStudentNos: removed,
  };
}

export async function reissueCodes(surveyId: string, studentNos: string[]) {
  const collection = await respondentsCollection();
  const now = new Date().toISOString();
  const result = await collection.bulkWrite(
    studentNos.map((studentNo) => ({
      updateOne: {
        filter: { surveyId, studentNo },
        update: { $set: issueCode(now), $unset: { failedAttempts: "", lockedUntil: "" } },
      },
    })),
  );
  return result.modifiedCount;
}

export async function deleteRespondentsBySurvey(surveyId: string) {
  const collection = await respondentsCollection();
  await collection.deleteMany({ surveyId });
}
