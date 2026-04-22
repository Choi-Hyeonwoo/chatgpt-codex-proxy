import test from "node:test";
import assert from "node:assert/strict";

import { transformAnthropicToCodex } from "../src/transformers/request.js";
import type { AnthropicRequest } from "../src/types/anthropic.js";

// Ensure passthrough to avoid family mapping interference
process.env.PASSTHROUGH_MODE = "1";

function baseRequest(messages: AnthropicRequest["messages"]): AnthropicRequest {
  return {
    model: "gpt-5.4",
    max_tokens: 128,
    messages,
  };
}

test("string content becomes single input_text part", () => {
  const codex = transformAnthropicToCodex(baseRequest([{ role: "user", content: "hi" }]));

  assert.equal(codex.input.length, 1);
  const first = codex.input[0];
  assert.equal(first.type, "message");
  if (first.type !== "message") return;
  assert.equal(first.role, "user");
  assert.ok(Array.isArray(first.content));
  const parts = first.content as Array<{ type: string; text: string }>;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, "input_text");
  assert.equal(parts[0].text, "hi");
});

test("multi-block text content concatenates into one message preserving order", () => {
  const codex = transformAnthropicToCodex(
    baseRequest([
      {
        role: "user",
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      },
    ]),
  );

  assert.equal(codex.input.length, 1);
  const msg = codex.input[0];
  if (msg.type !== "message") throw new Error("expected message");
  const parts = msg.content as Array<{ type: string; text: string }>;
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, "first");
  assert.equal(parts[1].text, "second");
});

test("tool_use block becomes function_call input item with serialized arguments", () => {
  const codex = transformAnthropicToCodex(
    baseRequest([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_abc",
            name: "Bash",
            input: { command: "ls" },
          },
        ],
      },
    ]),
  );

  assert.equal(codex.input.length, 1);
  const item = codex.input[0];
  assert.equal(item.type, "function_call");
  if (item.type !== "function_call") return;
  assert.equal(item.call_id, "toolu_abc");
  assert.equal(item.name, "Bash");
  assert.equal(item.arguments, JSON.stringify({ command: "ls" }));
});

test("tool_result with string content becomes function_call_output", () => {
  const codex = transformAnthropicToCodex(
    baseRequest([
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_abc",
            content: "output line",
          },
        ],
      },
    ]),
  );

  assert.equal(codex.input.length, 1);
  const item = codex.input[0];
  assert.equal(item.type, "function_call_output");
  if (item.type !== "function_call_output") return;
  assert.equal(item.call_id, "toolu_abc");
  assert.equal(item.output, "output line");
});

test("tool_result with is_error and undefined content yields 'Tool execution failed'", () => {
  const codex = transformAnthropicToCodex(
    baseRequest([
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_err",
            is_error: true,
          },
        ],
      },
    ]),
  );

  const item = codex.input[0];
  assert.equal(item.type, "function_call_output");
  if (item.type !== "function_call_output") return;
  assert.equal(item.output, "Tool execution failed");
});

test("image block becomes input_image with data URL", () => {
  const codex = transformAnthropicToCodex(
    baseRequest([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgo=",
            },
          },
        ],
      },
    ]),
  );

  assert.equal(codex.input.length, 1);
  const msg = codex.input[0];
  if (msg.type !== "message") throw new Error("expected message");
  const parts = msg.content as Array<{ type: string; image_url?: string; text?: string }>;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, "input_image");
  assert.equal(parts[0].image_url, "data:image/png;base64,iVBORw0KGgo=");
});
