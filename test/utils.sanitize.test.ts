/**
 * Unit tests for src/utils/sanitize.ts
 *
 * Validates that redactSecrets() / sanitizeString() / sanitizeObject()
 * mask Bearer tokens, JWTs, OAuth query params, and chatgpt-account-id
 * values while leaving non-sensitive text intact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { redactSecrets, sanitizeObject, sanitizeString } from "../src/utils/sanitize.js";

test("redacts Bearer tokens in strings", () => {
  const input = "Authorization: Bearer abc123.xyz";
  const out = sanitizeString(input);
  assert.ok(!out.includes("abc123.xyz"), `token still present: ${out}`);
  assert.ok(out.includes("Bearer ***"), `missing Bearer *** marker: ${out}`);
});

test("redacts JWT payloads", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const input = `token=${jwt}`;
  const out = sanitizeString(input);
  assert.ok(!out.includes(jwt), `jwt still present: ${out}`);
  assert.ok(/\*\*\*JWT\*\*\*|token=\*\*\*/.test(out), `no redaction marker: ${out}`);
});

test("redacts OAuth URL query params", () => {
  const input = "http://host/cb?code=secret&state=abc&access_token=xyz";
  const out = sanitizeString(input);
  assert.ok(!out.includes("secret"), `code value leaked: ${out}`);
  assert.ok(!out.includes("abc"), `state value leaked: ${out}`);
  assert.ok(!out.includes("xyz"), `access_token value leaked: ${out}`);
  assert.ok(out.includes("code=***"), `missing code=*** : ${out}`);
  assert.ok(out.includes("state=***"), `missing state=*** : ${out}`);
  assert.ok(out.includes("access_token=***"), `missing access_token=*** : ${out}`);
});

test("redacts chatgpt-account-id header values", () => {
  const obj = { headers: { "chatgpt-account-id": "uuid-value-1234" } };
  const out = redactSecrets(obj);
  assert.ok(!out.includes("uuid-value-1234"), `account id leaked: ${out}`);
  assert.ok(out.includes("***account-id***") || out.includes("***"), `no mask marker: ${out}`);
});

test("preserves non-sensitive parts", () => {
  const input = "http://host/api?page=2";
  const out = sanitizeString(input);
  assert.equal(out, input);
});

test("sanitizeObject masks access_token / refresh_token keys", () => {
  const obj = {
    access_token: "secret-access",
    refresh_token: "secret-refresh",
    user: "alice",
    nested: { authorization: "Bearer zzz.yyy.xxx" },
  };
  const out = sanitizeObject(obj);
  const json = JSON.stringify(out);
  assert.ok(!json.includes("secret-access"), `access_token leaked: ${json}`);
  assert.ok(!json.includes("secret-refresh"), `refresh_token leaked: ${json}`);
  assert.ok(!json.includes("zzz.yyy.xxx"), `nested authorization leaked: ${json}`);
  assert.ok(json.includes("alice"), `non-sensitive field dropped: ${json}`);
});
