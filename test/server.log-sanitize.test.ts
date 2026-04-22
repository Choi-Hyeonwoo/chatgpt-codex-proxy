/**
 * Integration test: confirm that requests with token-shaped URL query params
 * do NOT leave the raw token in console.log output produced by the request
 * logging middleware in src/server.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import http from "node:http";

import app from "../src/server.js";

function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

test("request logger does not leak OAuth token from URL", async () => {
  const port = await pickPort();
  const server = app.listen(port);
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  const secretToken = "leakedAccessTokenAbcXyz123";
  const path = `/does-not-exist?access_token=${secretToken}&code=some-code-123`;

  try {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "GET",
          headers: { Authorization: "Bearer should-not-be-logged" },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve());
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
  } finally {
    // Give the 'finish' listener a tick to fire.
    await new Promise((r) => setTimeout(r, 20));
    console.log = origLog;
    console.error = origErr;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const joined = logs.join("\n");
  assert.ok(
    !joined.includes(secretToken),
    `access_token leaked in logs: ${joined}`,
  );
  assert.ok(
    !joined.includes("some-code-123"),
    `OAuth code leaked in logs: ${joined}`,
  );
  // Sanity: at least one [REQ] log should have been captured.
  assert.ok(
    joined.includes("[REQ] GET"),
    `request log not captured at all: ${joined}`,
  );
  assert.ok(
    joined.includes("access_token=***"),
    `sanitized access_token marker missing: ${joined}`,
  );
});
