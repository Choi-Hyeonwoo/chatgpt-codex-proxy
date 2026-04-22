import test from "node:test";
import assert from "node:assert/strict";

import { validateAnthropicRequest } from "../src/utils/validate.js";
import { ProxyError } from "../src/utils/errors.js";

function expectProxy400(fn: () => void, contains: string): void {
  try {
    fn();
    assert.fail("Expected ProxyError to be thrown");
  } catch (err) {
    assert.ok(err instanceof ProxyError, `expected ProxyError, got ${err}`);
    assert.equal((err as ProxyError).statusCode, 400);
    assert.equal((err as ProxyError).errorType, "invalid_request_error");
    assert.ok(
      (err as ProxyError).message.includes(contains),
      `expected message to contain "${contains}", got "${(err as ProxyError).message}"`,
    );
  }
}

test("rejects missing model", () => {
  expectProxy400(
    () =>
      validateAnthropicRequest({
        messages: [{ role: "user", content: "hi" }],
      }),
    "model",
  );
});

test("rejects empty messages array", () => {
  expectProxy400(
    () =>
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [],
      }),
    "messages",
  );
});

test("rejects tool without name", () => {
  expectProxy400(
    () =>
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ input_schema: { type: "object" } }],
      }),
    "tools[0].name",
  );
});

test("rejects invalid tool_choice type", () => {
  expectProxy400(
    () =>
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
        tool_choice: { type: "magic" },
      }),
    "tool_choice.type",
  );
});

test("rejects tool_choice=tool without name", () => {
  expectProxy400(
    () =>
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
        tool_choice: { type: "tool" },
      }),
    "tool_choice.name",
  );
});

test("rejects non-positive max_tokens (0 and -1)", () => {
  expectProxy400(
    () =>
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 0,
      }),
    "max_tokens",
  );
  expectProxy400(
    () =>
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: -1,
      }),
    "max_tokens",
  );
});

test("accepts minimal valid request", () => {
  assert.doesNotThrow(() =>
    validateAnthropicRequest({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1024,
    }),
  );
});
