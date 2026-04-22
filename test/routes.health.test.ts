import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import app from "../src/server.js";

test("GET /health returns 200 and expected shape", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const body = await new Promise<{ status: number; json: any }>((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/health" }, (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(raw) });
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on("error", reject);
    });

    assert.equal(body.status, 200);
    assert.equal(body.json.status, "ok");
    assert.ok(body.json.model_overrides, "expected model_overrides field in body");
    assert.ok("haiku" in body.json.model_overrides);
    assert.ok("sonnet" in body.json.model_overrides);
    assert.ok("opus" in body.json.model_overrides);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
