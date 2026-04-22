/**
 * Unit tests for buildTokenData helper (#4).
 *
 * Validates that the extracted helper correctly assembles TokenData
 * from an OAuth token response: JWT account_id extraction, absence
 * handling, expires_at math, and malformed JWT tolerance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { __testing__ } from "../src/auth.js";

const { buildTokenData } = __testing__;

/** Build a 3-segment JWT with the given payload object. */
function makeJWT(payload: Record<string, unknown>): string {
  const b64 = (s: string) =>
    Buffer.from(s, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  const header = b64(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = b64("sig");
  return `${header}.${body}.${sig}`;
}

test("buildTokenData extracts chatgpt_account_id from JWT", () => {
  const access = makeJWT({
    "https://api.openai.com/auth": { chatgpt_account_id: "acc_123" },
  });
  const td = buildTokenData({
    access_token: access,
    refresh_token: "r",
    expires_in: 3600,
  });
  assert.equal(td.chatgpt_account_id, "acc_123");
  assert.equal(td.access_token, access);
  assert.equal(td.refresh_token, "r");
});

test("buildTokenData handles missing account_id", () => {
  const access = makeJWT({ sub: "user_1" }); // no auth claim
  const td = buildTokenData({
    access_token: access,
    refresh_token: "r",
    expires_in: 60,
  });
  assert.equal(td.chatgpt_account_id, undefined);
});

test("buildTokenData computes expires_at = now + expires_in*1000", () => {
  const before = Date.now();
  const td = buildTokenData({
    access_token: makeJWT({}),
    refresh_token: "r",
    expires_in: 60,
  });
  const after = Date.now();
  assert.ok(
    td.expires_at >= before + 60_000 - 1000 &&
      td.expires_at <= after + 60_000 + 1000,
    `expires_at ${td.expires_at} outside [${before + 59_000}, ${after + 61_000}]`
  );
});

test("buildTokenData returns without account_id for malformed JWT", () => {
  // 2-segment token — decodeJWT returns null
  const td = buildTokenData({
    access_token: "header.payload",
    refresh_token: "r",
    expires_in: 60,
  });
  assert.equal(td.chatgpt_account_id, undefined);
  assert.equal(td.access_token, "header.payload");
});
