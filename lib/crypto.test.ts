import test from "node:test";
import assert from "node:assert/strict";
import { decryptToken, encryptToken, generateKeyBase64, loadKey } from "./crypto.ts";

test("round-trips and authenticates", () => {
  const key = loadKey({ TOKEN_ENCRYPTION_KEY: generateKeyBase64() });
  const ct = encryptToken("access-sandbox-123", key);
  assert.equal(decryptToken(ct, key), "access-sandbox-123");
  assert.notEqual(Buffer.from(encryptToken("access-sandbox-123", key)).equals(ct), true, "fresh iv each time");
  const tampered = Buffer.from(ct);
  tampered[tampered.length - 1] ^= 0x01;
  assert.throws(() => decryptToken(tampered, key));
  const otherKey = loadKey({ TOKEN_ENCRYPTION_KEY: generateKeyBase64() });
  assert.throws(() => decryptToken(ct, otherKey));
});

test("loadKey insists on 32 bytes", () => {
  assert.throws(() => loadKey({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }));
  assert.throws(() => loadKey({}));
});
