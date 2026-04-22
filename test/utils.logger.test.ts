/**
 * Unit tests for src/utils/logger.ts
 *
 * Validates level gating via LOG_LEVEL, scope prefix rendering, invalid-level
 * fallback warning, and sanitizer chaining (no raw Bearer / token in output).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createLogger, __testing__ } from "../src/utils/logger.js";

interface Captured {
  log: string[];
  err: string[];
  warn: string[];
}

function captureConsole(): { captured: Captured; restore: () => void } {
  const captured: Captured = { log: [], err: [], warn: [] };
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  console.log = (...args: unknown[]): void => {
    captured.log.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  console.error = (...args: unknown[]): void => {
    captured.err.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  console.warn = (...args: unknown[]): void => {
    captured.warn.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  return {
    captured,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
      console.warn = origWarn;
    },
  };
}

test("LOG_LEVEL=error gates out info/warn/debug", () => {
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "error";
  const { captured, restore } = captureConsole();
  try {
    const log = createLogger();
    log.info("info-msg");
    log.warn("warn-msg");
    log.debug("debug-msg");
    log.error("error-msg");
  } finally {
    restore();
    process.env.LOG_LEVEL = prev;
  }

  const allLog = captured.log.join("\n");
  const allErr = captured.err.join("\n");
  assert.ok(!allLog.includes("info-msg"), `info leaked: ${allLog}`);
  assert.ok(!allLog.includes("warn-msg"), `warn leaked: ${allLog}`);
  assert.ok(!allLog.includes("debug-msg"), `debug leaked: ${allLog}`);
  assert.ok(allErr.includes("error-msg"), `error missing: ${allErr}`);
  assert.ok(allErr.includes("[ERROR]"), `error label missing: ${allErr}`);
});

test("LOG_LEVEL=debug emits all levels with correct labels", () => {
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "debug";
  const { captured, restore } = captureConsole();
  try {
    const log = createLogger();
    log.debug("deep-trace");
    log.info("info-trace");
    log.warn("warn-trace");
    log.error("err-trace");
  } finally {
    restore();
    process.env.LOG_LEVEL = prev;
  }

  const joined = captured.log.join("\n") + "\n" + captured.err.join("\n");
  assert.ok(joined.includes("[DEBUG]"), `DEBUG label missing: ${joined}`);
  assert.ok(joined.includes("deep-trace"), `debug body missing: ${joined}`);
  assert.ok(joined.includes("info-trace"), `info body missing: ${joined}`);
  assert.ok(joined.includes("warn-trace"), `warn body missing: ${joined}`);
  assert.ok(joined.includes("err-trace"), `error body missing: ${joined}`);
});

test("default LOG_LEVEL (unset) behaves like info", () => {
  const prev = process.env.LOG_LEVEL;
  delete process.env.LOG_LEVEL;
  const { captured, restore } = captureConsole();
  try {
    const log = createLogger();
    log.info("visible-default");
    log.debug("hidden-default");
  } finally {
    restore();
    if (prev === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prev;
  }

  const joined = captured.log.join("\n");
  assert.ok(joined.includes("visible-default"), `info missing at default level: ${joined}`);
  assert.ok(!joined.includes("hidden-default"), `debug leaked at default level: ${joined}`);
});

test("sanitizer chaining removes Bearer tokens and JWTs", () => {
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "info";
  const { captured, restore } = captureConsole();
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcSigValue";
  try {
    const log = createLogger();
    log.info("auth ok", { authorization: "Bearer abc123SecretXyz" });
    log.info(`raw bearer path Authorization: Bearer ${jwt}`);
    log.info("url=http://host/cb?code=VERYSECRETCODE&state=STATEVAL");
  } finally {
    restore();
    process.env.LOG_LEVEL = prev;
  }

  const joined = captured.log.join("\n");
  assert.ok(!joined.includes("abc123SecretXyz"), `Bearer token leaked: ${joined}`);
  assert.ok(!joined.includes(jwt), `JWT leaked: ${joined}`);
  assert.ok(!joined.includes("VERYSECRETCODE"), `oauth code leaked: ${joined}`);
  assert.ok(!joined.includes("STATEVAL"), `oauth state leaked: ${joined}`);
  assert.ok(
    joined.includes("Bearer ***") || joined.includes('"authorization":"***"'),
    `no Bearer redaction marker: ${joined}`,
  );
  assert.ok(joined.includes("code=***"), `code= redaction marker missing: ${joined}`);
});

test("createLogger scope prefix and invalid LOG_LEVEL fallback", () => {
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "not-a-real-level";
  __testing__.resetInvalidLevelWarned();
  const { captured, restore } = captureConsole();
  try {
    const log = createLogger("widget");
    log.info("scoped-hello");
    log.debug("scoped-debug-hidden"); // should be gated by fallback "info"
  } finally {
    restore();
    process.env.LOG_LEVEL = prev;
  }

  const infoJoined = captured.log.join("\n");
  const warnJoined = captured.warn.join("\n");
  assert.ok(infoJoined.includes("[widget]"), `scope prefix missing: ${infoJoined}`);
  assert.ok(infoJoined.includes("scoped-hello"), `scoped info missing: ${infoJoined}`);
  assert.ok(!infoJoined.includes("scoped-debug-hidden"), `debug leaked after fallback: ${infoJoined}`);
  assert.ok(
    warnJoined.includes('Invalid LOG_LEVEL="not-a-real-level"'),
    `fallback warning not emitted: ${warnJoined}`,
  );
});
