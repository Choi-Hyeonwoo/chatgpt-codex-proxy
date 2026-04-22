import test from "node:test";
import assert from "node:assert/strict";

import { transformCodexToAnthropic } from "../src/transformers/response.js";
import type { CodexResponse } from "../src/codex/client.js";
import type { ToolUseContentBlock, TextContentBlock } from "../src/types/anthropic.js";

function baseCodexResponse(output: CodexResponse["output"]): CodexResponse {
  return {
    id: "resp_test",
    output,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as CodexResponse;
}

test("function_call with call_id maps to tool_use block using call_id as id", () => {
  const response = baseCodexResponse([
    {
      type: "function_call",
      call_id: "call_123",
      id: "fc_abc",
      name: "Bash",
      arguments: JSON.stringify({ command: "pwd" }),
    } as unknown as CodexResponse["output"][number],
  ]);

  const anthropic = transformCodexToAnthropic(response, "claude-opus-4");
  assert.equal(anthropic.stop_reason, "tool_use");
  const toolUse = anthropic.content.find((b) => b.type === "tool_use") as ToolUseContentBlock;
  assert.ok(toolUse, "expected tool_use block");
  assert.equal(toolUse.id, "call_123");
  assert.equal(toolUse.name, "Bash");
  assert.deepEqual(toolUse.input, { command: "pwd" });
});

test("function_call without call_id falls back to item id then 'tool_call'", () => {
  const respWithItemId = baseCodexResponse([
    {
      type: "function_call",
      id: "fc_only",
      name: "X",
      arguments: "{}",
    } as unknown as CodexResponse["output"][number],
  ]);
  const a1 = transformCodexToAnthropic(respWithItemId, "m");
  const t1 = a1.content.find((b) => b.type === "tool_use") as ToolUseContentBlock;
  assert.equal(t1.id, "fc_only");

  const respWithNoIds = baseCodexResponse([
    {
      type: "function_call",
      name: "X",
      arguments: "{}",
    } as unknown as CodexResponse["output"][number],
  ]);
  const a2 = transformCodexToAnthropic(respWithNoIds, "m");
  const t2 = a2.content.find((b) => b.type === "tool_use") as ToolUseContentBlock;
  assert.equal(t2.id, "tool_call");
});

test("empty output produces a single empty text block with end_turn stop_reason", () => {
  const response = baseCodexResponse([]);
  const anthropic = transformCodexToAnthropic(response, "claude-sonnet-4");

  assert.equal(anthropic.stop_reason, "end_turn");
  assert.equal(anthropic.content.length, 1);
  const first = anthropic.content[0] as TextContentBlock;
  assert.equal(first.type, "text");
  assert.equal(first.text, "");
});

test("malformed arguments JSON becomes {raw: <original>}", () => {
  const response = baseCodexResponse([
    {
      type: "function_call",
      call_id: "call_bad",
      name: "X",
      arguments: "not-json{",
    } as unknown as CodexResponse["output"][number],
  ]);

  const anthropic = transformCodexToAnthropic(response, "m");
  const toolUse = anthropic.content.find((b) => b.type === "tool_use") as ToolUseContentBlock;
  assert.deepEqual(toolUse.input, { raw: "not-json{" });
});
