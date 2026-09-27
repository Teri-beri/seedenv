import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export function validatePassword(password: string) {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must include at least one letter and one number.";
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
