import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for provider access tokens at rest. The key lives in
 * TOKEN_ENCRYPTION_KEY (32 bytes, base64). Decrypt only in server code.
 *
 * Ciphertext layout: version(1) | iv(12) | tag(16) | data(n)
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function loadKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptToken(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, data]);
}

export function decryptToken(ciphertext: Uint8Array, key: Buffer): string {
  const buf = Buffer.from(ciphertext);
  if (buf.length < 1 + IV_BYTES + TAG_BYTES) throw new Error("Ciphertext too short");
  if (buf[0] !== VERSION) throw new Error(`Unknown ciphertext version ${buf[0]}`);
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const data = buf.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** For generating a fresh TOKEN_ENCRYPTION_KEY: `node -e "..."` in the README. */
export function generateKeyBase64(): string {
  return randomBytes(32).toString("base64");
}
