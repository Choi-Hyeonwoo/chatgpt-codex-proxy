import test from "node:test";
import assert from "node:assert/strict";

import { __testing__ } from "../src/codex/client.js";

const { parseSseStream, collectSseResponse } = __testing__;

/**
 * 문자열을 ReadableStream<Uint8Array>로 감싼다.
 * optional splitAt로 단일 청크/여러 청크 경계 테스트가 가능하지만
 * 여기서는 단일 청크로 충분.
 */
function stringToStream(s: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(s));
      controller.close();
    },
  });
}

test("parses single event with single data line", async () => {
  const payload =
    'event: response.done\n' +
    'data: {"type":"response.done","response":{"id":"r1","model":"codex","output":[]}}\n' +
    '\n';

  const events: Array<{ event: string; data: string }> = [];
  for await (const ev of parseSseStream(stringToStream(payload))) {
    events.push(ev);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0]!.event, "response.done");
  // data는 JSON.parse 가능해야 함
  const parsed = JSON.parse(events[0]!.data);
  assert.equal(parsed.type, "response.done");
  assert.equal(parsed.response.id, "r1");
});

test("parses multi-line data", async () => {
  // 두 data 라인 이어지는 이벤트 → "\n"으로 join된 하나의 data 반환
  const payload =
    'event: message\n' +
    'data: line1\n' +
    'data: line2\n' +
    '\n';

  const events: Array<{ event: string; data: string }> = [];
  for await (const ev of parseSseStream(stringToStream(payload))) {
    events.push(ev);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0]!.event, "message");
  assert.equal(events[0]!.data, "line1\nline2");
});

test("handles [DONE] sentinel", async () => {
  // stream 끝에 `data: [DONE]` → collectSseResponse는 최종 response 이벤트가 없으므로
  // fallback 경로로 빈 누적 assistant 메시지를 반환.
  const payload = 'data: [DONE]\n\n';

  const result = await collectSseResponse(stringToStream(payload));

  // Fallback 응답 구조 검증
  assert.equal(result.model, "codex");
  assert.equal(result.stop_reason, "end_turn");
  assert.equal(result.output.length, 1);
  const content = result.output[0]!.content!;
  assert.equal(content[0]!.type, "output_text");
  assert.equal(content[0]!.text, ""); // 누적된 delta 없음 → 빈 문자열
});

test("accumulates output_text deltas in order", async () => {
  // 3개 delta 이벤트 + [DONE] → 최종 text = 순서 보존한 concat
  const payload =
    'data: {"type":"response.output_text.delta","delta":"hello "}\n\n' +
    'data: {"type":"response.output_text.delta","delta":"world"}\n\n' +
    'data: {"type":"response.output_text.delta","delta":"!"}\n\n' +
    'data: [DONE]\n\n';

  const result = await collectSseResponse(stringToStream(payload));

  assert.equal(result.model, "codex");
  const content = result.output[0]!.content!;
  assert.equal(content[0]!.text, "hello world!");
});

test("prefers response.completed over response.done if both present", async () => {
  // done이 먼저, completed가 나중 → last-wins로 completed가 채택되어야 함
  const payload =
    'data: {"type":"response.done","response":{"id":"early","model":"codex-done","output":[]}}\n\n' +
    'data: {"type":"response.completed","response":{"id":"final","model":"codex-completed","output":[{"role":"assistant","type":"message","content":[{"type":"output_text","text":"final"}]}]}}\n\n';

  const result = await collectSseResponse(stringToStream(payload));

  assert.equal(result.id, "final");
  assert.equal(result.model, "codex-completed");
  assert.equal(result.output.length, 1);
  const content = result.output[0]!.content!;
  assert.equal(content[0]!.text, "final");
});
