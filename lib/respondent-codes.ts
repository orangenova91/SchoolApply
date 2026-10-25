import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from "node:crypto";

/** 0/O, 1/I/L처럼 헷갈리는 글자를 뺐다. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

let cachedKey: Buffer | null = null;

/** 쪽지를 다시 출력할 수 있도록 코드는 되돌릴 수 있게 암호화한다. SESSION_SECRET을 바꾸면 발급한 코드를 다시 발급해야 한다. */
function codeKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET 환경변수가 없습니다. .env.local을 확인하세요.");
  cachedKey = Buffer.from(hkdfSync("sha256", secret, "schoolapply", "respondent-access-code", 32));
  return cachedKey;
}

export function generateAccessCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function encryptAccessCode(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", codeKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptAccessCode(sealed: string): string | null {
  try {
    const [iv, tag, encrypted] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", codeKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function normalizeAccessCode(input: string) {
  return input.replace(/\s+/g, "").toUpperCase();
}
