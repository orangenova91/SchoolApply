import { MongoClient, type Db } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI 환경변수가 없습니다. .env.local을 확인하세요.");
  }
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri).connect();
  }
  return global._mongoClientPromise;
}

/** SchoolBlock과 계정을 공유하지 않도록 데이터베이스 이름을 고정한다. */
export const SCHOOLAPPLY_DB_NAME = "schoolapply";

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(SCHOOLAPPLY_DB_NAME);
}
