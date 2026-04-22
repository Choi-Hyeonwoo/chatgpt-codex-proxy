/**
 * IO round-trip tests for the token-storage sub-module (#5).
 *
 * Uses HOME env override BEFORE importing so that TOKEN_FILE points
 * into a fresh tmp directory instead of the developer's real
 * ~/.chatgpt-codex-proxy/tokens.json.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// IMPORTANT: override HOME before importing the module under test.
const tmpHome = mkdtempSync(join(tmpdir(), "codex5-auth-"));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome; // Windows fallback

const mod = await import("../src/auth/token-storage.js");

test("saveTokens -> loadTokens round trip", () => {
  const td = {
    access_token: "at_xyz",
    refresh_token: "rt_xyz",
    expires_at: Date.now() + 60_000,
    chatgpt_account_id: "acc_test",
  };
  mod.saveTokens(td);
  const loaded = mod.loadTokens();
  assert.ok(loaded !== null);
  assert.equal(loaded?.access_token, td.access_token);
  assert.equal(loaded?.refresh_token, td.refresh_token);
  assert.equal(loaded?.expires_at, td.expires_at);
  assert.equal(loaded?.chatgpt_account_id, td.chatgpt_account_id);
});

test("loadTokens returns null when file is absent", () => {
  mod.logout(); // remove any prior file
  assert.equal(existsSync(mod.TOKEN_FILE), false);
  assert.equal(mod.loadTokens(), null);
});

test("logout is idempotent", () => {
  // First call may or may not find a file; second must not throw.
  mod.logout();
  assert.doesNotThrow(() => mod.logout());
  assert.equal(existsSync(mod.TOKEN_FILE), false);

  // Cleanup tmp home directory
  rmSync(tmpHome, { recursive: true, force: true });
});
