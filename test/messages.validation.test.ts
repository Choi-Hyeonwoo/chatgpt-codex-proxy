import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import app from "../src/server.js";

test("POST /v1/messages returns 400 invalid_request_error for invalid body", async () => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/v1/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Invalid: missing model, empty messages
      body: JSON.stringify({ messages: [] }),
    });

    assert.equal(response.status, 400);
    const json = (await response.json()) as {
      type: string;
      error: { type: string; message: string };
    };
    assert.equal(json.type, "error");
    assert.equal(json.error.type, "invalid_request_error");
    assert.ok(typeof json.error.message === "string" && json.error.message.length > 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
