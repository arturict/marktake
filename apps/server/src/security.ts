import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, saltRaw, expectedRaw] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltRaw || !expectedRaw) {
    return false;
  }
  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(expectedRaw, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function normalizeDisplayFilename(value: string): string {
  const base = value.replaceAll("\\", "/").split("/").at(-1) ?? "video";
  let withoutControls = "";
  for (const character of base.normalize("NFKC")) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 31 && code !== 127) withoutControls += character;
  }
  const cleaned = withoutControls
    .replace(/[<>:"|?*]/gu, "_")
    .trim()
    .slice(0, 160);
  return cleaned || "video";
}
