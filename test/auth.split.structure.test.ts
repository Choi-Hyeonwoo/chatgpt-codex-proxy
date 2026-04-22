/**
 * Structure tests for the auth.ts module split (#5).
 *
 * Ensures that the three sub-modules exist on disk and that the
 * barrel re-exports the documented public symbols so downstream
 * imports (`../auth.js` / `../auth`) keep working.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

test("src/auth/jwt.ts exists", () => {
  assert.equal(existsSync(join(repoRoot, "src/auth/jwt.ts")), true);
});

test("src/auth/token-storage.ts exists", () => {
  assert.equal(existsSync(join(repoRoot, "src/auth/token-storage.ts")), true);
});

test("src/auth/oauth.ts exists", () => {
  assert.equal(existsSync(join(repoRoot, "src/auth/oauth.ts")), true);
});

test("barrel re-exports public OAuth symbols", async () => {
  const mod = await import("../src/auth.js");
  assert.equal(typeof mod.getValidTokens, "function");
  assert.equal(typeof mod.login, "function");
  assert.equal(typeof mod.logout, "function");
  assert.equal(typeof mod.getAuthStatus, "function");
  assert.equal(typeof mod.loadTokens, "function");
  assert.equal(typeof mod.saveTokens, "function");
  assert.equal(typeof mod.decodeJWT, "function");
});
