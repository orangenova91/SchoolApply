import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ResponseAnswer, ResponseEditor, ResponseHistoryEntry } from "@/lib/published-survey";

export type ResponseDocument = {
  surveyId: string;
  studentNo: string;
  answers: ResponseAnswer[];
  submittedAt: string;
  updatedAt: string;
  revision: number;
  /** 없으면 학생이 저장한 응답이다 (교사 수정 기능 이전 자료). */
  editedBy?: ResponseEditor;
  /** 오래된 것부터, 최대 HISTORY_LIMIT개 */
  history?: ResponseHistoryEntry[];
};

const HISTORY_LIMIT = 20;

declare global {
  var _responseIndexesPromise: Promise<unknown> | undefined;
}

async function responsesCollection(): Promise<Collection<ResponseDocument>> {
  const db = await getDb();
  const collection = db.collection<ResponseDocument>("responses");
  global._responseIndexesPromise ??= collection
    .createIndex({ surveyId: 1, studentNo: 1 }, { unique: true })
    .catch((error) => {
      global._responseIndexesPromise = undefined;
      throw error;
    });
  await global._responseIndexesPromise;
  return collection;
}

export async function getResponse(surveyId: string, studentNo: string) {
  const collection = await responsesCollection();
  return collection.findOne({ surveyId, studentNo }, { projection: { _id: 0 } });
}

/**
 * 응답을 저장하고, 고치기 전 응답은 history에 남긴다. 저장하지 못하면 null.
 * expectedRevision: 생략하면 확인하지 않고, null이면 아직 응답이 없을 때만, 숫자면 그 revision일 때만 저장한다.
 */
export async function saveResponse(
  surveyId: string,
  studentNo: string,
  answers: ResponseAnswer[],
  editedBy: ResponseEditor,
  expectedRevision?: number | null,
) {
  const collection = await responsesCollection();
  const now = new Date().toISOString();
  const filter =
    expectedRevision === undefined
      ? { surveyId, studentNo }
      : expectedRevision === null
        ? { surveyId, studentNo, revision: { $exists: false } }
        : { surveyId, studentNo, revision: expectedRevision };
  const previous = { answers: "$answers", editedBy: { $ifNull: ["$editedBy", "student"] }, savedAt: "$updatedAt" };
  try {
    return await collection.findOneAndUpdate(
      filter,
      [
        {
          $set: {
            history: {
              $cond: [
                { $eq: [{ $type: "$answers" }, "missing"] },
                [],
                { $slice: [{ $concatArrays: [{ $ifNull: ["$history", []] }, [previous]] }, -HISTORY_LIMIT] },
              ],
            },
            answers: { $literal: answers },
            editedBy: { $literal: editedBy },
            submittedAt: { $ifNull: ["$submittedAt", now] },
            updatedAt: now,
            revision: { $add: [{ $ifNull: ["$revision", 0] }, 1] },
          },
        },
      ],
      { upsert: typeof expectedRevision !== "number", returnDocument: "after", projection: { _id: 0 } },
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

export async function listResponses(surveyId: string) {
  const collection = await responsesCollection();
  return collection.find({ surveyId }, { projection: { _id: 0 } }).toArray();
}

/** 새로 만든 가져오기 조사에 검사를 마친 응답을 한 번에 넣는다. */
export async function insertImportedResponses(
  surveyId: string,
  responses: { studentNo: string; answers: ResponseAnswer[] }[],
) {
  if (responses.length === 0) return 0;
  const collection = await responsesCollection();
  const now = new Date().toISOString();
  const result = await collection.insertMany(
    responses.map((response) => ({
      surveyId,
      studentNo: response.studentNo,
      answers: response.answers,
      submittedAt: now,
      updatedAt: now,
      revision: 1,
      editedBy: "teacher" as const,
      history: [],
    })),
  );
  return result.insertedCount;
}

export async function countResponses(surveyId: string) {
  const collection = await responsesCollection();
  return collection.countDocuments({ surveyId });
}

export async function respondedStudentNos(surveyId: string, studentNos?: string[]) {
  const collection = await responsesCollection();
  const filter = studentNos ? { surveyId, studentNo: { $in: studentNos } } : { surveyId };
  const documents = await collection.find(filter, { projection: { _id: 0, studentNo: 1 } }).toArray();
  return documents.map((document) => document.studentNo);
}

export async function deleteResponses(surveyId: string, studentNos?: string[]) {
  const collection = await responsesCollection();
  await collection.deleteMany(studentNos ? { surveyId, studentNo: { $in: studentNos } } : { surveyId });
}
