/**
 * Unit tests for src/auth/token-cache.ts (#8)
 *
 * Tests:
 * 1. Fresh cache (expires_at = now + 10 min) → refresh never called
 * 2. Buffer zone (expires_at = now + 1 min, inside BUFFER_MS) → refresh called once
 * 3. 100 concurrent getValidToken() → mockRefresh called exactly once (dedup)
 * 4. Refresh failure → refreshPromise reset to null, next call retries
 * 5. Hard expired (expires_at = now - 1) → refresh called
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Import the module under test AFTER resetting state for each test
const cacheMod = await import("../src/auth/token-cache.js");

const { getValidToken, setRefreshFn, _resetCache, BUFFER_MS } = cacheMod;

function makeToken(expiresIn: number) {
  return {
    access_token: "at_test",
    refresh_token: "rt_test",
    expires_at: Date.now() + expiresIn,
    chatgpt_account_id: "acc_test",
  };
}

// Reset cache state before each test
beforeEach(() => {
  _resetCache();
});

// ── Test 1: fresh cache, no refresh ──────────────────────────────────────────
test("fresh cache (expires_at = now + 10min) returns cached token without calling refresh", async () => {
  let refreshCallCount = 0;
  const freshToken = makeToken(10 * 60 * 1000); // 10 min

  setRefreshFn(async () => {
    refreshCallCount++;
    return freshToken;
  });

  // Prime the cache with first call
  const first = await getValidToken();
  assert.equal(refreshCallCount, 1, "First call should trigger refresh");
  assert.equal(first.access_token, "at_test");

  // Second call should hit cache
  const second = await getValidToken();
  assert.equal(refreshCallCount, 1, "Second call must not trigger refresh");
  assert.equal(second.access_token, "at_test");
});

// ── Test 2: buffer zone triggers refresh ─────────────────────────────────────
test("token inside BUFFER_MS window triggers refresh", async () => {
  let refreshCallCount = 0;
  // Token that expires in 1 min (less than BUFFER_MS = 5 min) → stale
  const staleToken = makeToken(60 * 1000); // 1 min
  const newToken = makeToken(60 * 60 * 1000); // 60 min

  setRefreshFn(async () => {
    refreshCallCount++;
    return newToken;
  });

  // Manually prime cache with a stale token by calling setCachedToken
  cacheMod.setCachedToken(staleToken);

  // getValidToken should detect it's within BUFFER_MS and refresh
  const result = await getValidToken();
  assert.equal(refreshCallCount, 1, "Should refresh once for buffer-zone token");
  assert.equal(result.expires_at, newToken.expires_at);
});

// ── Test 3: 100 concurrent calls → exactly 1 refresh ────────────────────────
test("100 concurrent getValidToken() calls trigger refresh exactly once", async () => {
  let refreshCallCount = 0;
  const freshToken = makeToken(60 * 60 * 1000); // 60 min, won't expire

  setRefreshFn(async () => {
    refreshCallCount++;
    // Simulate async work (e.g., network I/O)
    await new Promise<void>((resolve) => setImmediate(resolve));
    return freshToken;
  });

  // Fire 100 concurrent calls
  const results = await Promise.all(
    Array.from({ length: 100 }, () => getValidToken())
  );

  assert.equal(refreshCallCount, 1, "Exactly 1 refresh must happen for 100 concurrent calls");
  assert.equal(results.length, 100);
  // All results should point to the same token data
  for (const r of results) {
    assert.equal(r.access_token, freshToken.access_token);
  }
});

// ── Test 4: refresh failure resets refreshPromise ────────────────────────────
test("refresh failure resets refreshPromise so next call can retry", async () => {
  let callCount = 0;
  const goodToken = makeToken(60 * 60 * 1000);

  setRefreshFn(async () => {
    callCount++;
    if (callCount === 1) {
      throw new Error("Network error");
    }
    return goodToken;
  });

  // First call — should fail
  await assert.rejects(
    () => getValidToken(),
    /Network error/,
    "First call should throw"
  );

  // refreshPromise must be null after failure so next call retries
  // Second call — should succeed
  const result = await getValidToken();
  assert.equal(callCount, 2, "Second call should trigger a new refresh attempt");
  assert.equal(result.access_token, goodToken.access_token);
});

// ── Test 5: hard expired token triggers refresh ──────────────────────────────
test("hard expired token (expires_at = now - 1ms) triggers refresh", async () => {
  let refreshCallCount = 0;
  const expiredToken = makeToken(-1); // already expired
  const newToken = makeToken(60 * 60 * 1000);

  setRefreshFn(async () => {
    refreshCallCount++;
    return newToken;
  });

  // Prime cache with expired token
  cacheMod.setCachedToken(expiredToken);

  const result = await getValidToken();
  assert.equal(refreshCallCount, 1, "Expired token must trigger refresh");
  assert.equal(result.expires_at, newToken.expires_at);
});
