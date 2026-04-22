import test from "node:test";
import assert from "node:assert/strict";

import { __testing__ } from "../src/codex/client.js";

const { collectSseResponse, getLastOutputTextPartsRef } = __testing__;

/**
 * 문자열을 ReadableStream<Uint8Array>로 감싼다 (단일 청크).
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

/**
 * delta 이벤트 N개 + finalResponse(response.completed) 한 개를 이어붙인 SSE payload.
 */
function buildDeltaPayload(count: number, chunk: string, withFinal: boolean): string {
  const deltas: string[] = [];
  for (let i = 0; i < count; i++) {
    deltas.push(
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: chunk })}\n\n`,
    );
  }
  if (withFinal) {
    const finalEvent = {
      type: "response.completed",
      response: {
        id: "final-id",
        model: "codex",
        output: [
          {
            role: "assistant",
            type: "message",
            content: [{ type: "output_text", text: "FINAL" }],
          },
        ],
      },
    };
    deltas.push(`data: ${JSON.stringify(finalEvent)}\n\n`);
  }
  deltas.push("data: [DONE]\n\n");
  return deltas.join("");
}

test("releases outputTextParts after finalResponse", async () => {
  // delta 1000개 + response.completed → 파싱 종료 시 내부 배열이 비어 있어야 함.
  const payload = buildDeltaPayload(1000, "x".repeat(20), true);

  const result = await collectSseResponse(stringToStream(payload));

  // finalResponse가 채택되었는지 확인
  assert.equal(result.id, "final-id");

  // 내부 outputTextParts 참조가 비어있는지 검증 (메모리 해제 증거)
  const ref = getLastOutputTextPartsRef();
  assert.ok(ref, "outputTextParts reference should be captured");
  assert.equal(ref!.length, 0, "outputTextParts should be cleared after finalResponse");
});

test("memory usage stays bounded across many deltas with finalResponse", async () => {
  // 10,000 delta × 100 chars = ~1MB 누적 가능하지만 final 후 clear되어야 함.
  const payload = buildDeltaPayload(10_000, "x".repeat(100), true);

  // 파싱 전 기준 heap
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;

  const result = await collectSseResponse(stringToStream(payload));

  if (global.gc) global.gc();
  const after = process.memoryUsage().heapUsed;

  assert.equal(result.id, "final-id");

  // outputTextParts가 해제되었는지 직접 검증 (간접 heap 비교 대신 보장된 assertion)
  const ref = getLastOutputTextPartsRef();
  assert.ok(ref);
  assert.equal(ref!.length, 0, "outputTextParts must be cleared for memory to be bounded");

  // Heap 증가가 10MB를 넘어서지 않아야 함 (환경 의존적이지만 느슨한 상한)
  const deltaBytes = after - before;
  assert.ok(
    deltaBytes < 10 * 1024 * 1024,
    `heapUsed delta too high: ${deltaBytes} bytes`,
  );
});

test("fallback path preserves all deltas when no finalResponse", async () => {
  // finalResponse 없음 → 100개 delta가 모두 concat되어 fallback 응답의 text로 나와야 함.
  const chunk = "abc";
  const payload = buildDeltaPayload(100, chunk, false);

  const result = await collectSseResponse(stringToStream(payload));

  // Fallback 응답 구조 (stop_reason=end_turn)
  assert.equal(result.stop_reason, "end_turn");
  assert.equal(result.output.length, 1);
  const content = result.output[0]!.content!;
  assert.equal(content[0]!.type, "output_text");
  assert.equal(content[0]!.text, chunk.repeat(100));
  assert.equal(content[0]!.text!.length, 100 * chunk.length);
});

test("handles interleaved delta and non-delta events (final text is delta-only concat)", async () => {
  // delta / other / delta / other 순서 → 최종 text는 delta만 이어붙인 결과여야 함.
  const payload =
    'data: {"type":"response.output_text.delta","delta":"A"}\n\n' +
    'data: {"type":"response.some_other_event","foo":"bar"}\n\n' +
    'data: {"type":"response.output_text.delta","delta":"B"}\n\n' +
    'data: {"type":"response.output_item.added","item":{}}\n\n' +
    'data: {"type":"response.output_text.delta","delta":"C"}\n\n' +
    'data: [DONE]\n\n';

  const result = await collectSseResponse(stringToStream(payload));

  // finalResponse 없음 → fallback 경로, delta만 concat
  assert.equal(result.stop_reason, "end_turn");
  const content = result.output[0]!.content!;
  assert.equal(content[0]!.text, "ABC");
});
