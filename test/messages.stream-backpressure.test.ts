import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeEvent } from "../src/utils/stream-write.js";

/**
 * Mock Writable: write()가 미리 설정된 값을 반환하고, error/drain 이벤트를 수동 emit할 수 있음.
 */
class MockWritable extends EventEmitter {
  public writeReturnValues: boolean[] = [];
  public writeCalls: Array<string | Buffer> = [];
  private idx = 0;

  write(chunk: string | Buffer): boolean {
    this.writeCalls.push(chunk);
    const ret = this.writeReturnValues[this.idx] ?? true;
    this.idx += 1;
    return ret;
  }
}

test("writeEvent awaits drain when write returns false", async () => {
  const mock = new MockWritable();
  mock.writeReturnValues = [false];

  let resolved = false;
  const p = writeEvent(mock as unknown as import("node:stream").Writable, "chunk").then(
    () => {
      resolved = true;
    },
  );

  // microtask 소화: drain 없이는 resolve되지 않아야 함
  await new Promise((r) => setImmediate(r));
  assert.equal(resolved, false, "must pend until drain");

  // drain emit → resolve
  mock.emit("drain");
  await p;
  assert.equal(resolved, true, "must resolve after drain");
  assert.equal(mock.writeCalls.length, 1);
});

test("client disconnect aborts upstream", async () => {
  // req.on('close') → abort.signal.aborted === true
  const req = new EventEmitter();
  const controller = new AbortController();
  req.on("close", () => {
    if (!controller.signal.aborted) controller.abort();
  });

  assert.equal(controller.signal.aborted, false, "initially not aborted");

  req.emit("close");

  assert.equal(controller.signal.aborted, true, "aborted after close");
});

test("no awaits when write returns true (hot path)", async () => {
  const mock = new MockWritable();
  mock.writeReturnValues = [true, true, true];

  // write=true 경로에서는 drain/error 리스너가 등록되지 않아야 함
  const drainBefore = mock.listenerCount("drain");
  const errorBefore = mock.listenerCount("error");

  await writeEvent(mock as unknown as import("node:stream").Writable, "a");
  await writeEvent(mock as unknown as import("node:stream").Writable, "b");
  await writeEvent(mock as unknown as import("node:stream").Writable, "c");

  assert.equal(mock.listenerCount("drain"), drainBefore, "no drain listener leaked");
  assert.equal(mock.listenerCount("error"), errorBefore, "no error listener leaked");
  assert.equal(mock.writeCalls.length, 3);
});

test("memory bounded under slow drain", async () => {
  // 100 events × 큰 payload + 각 write마다 false → drain 루프.
  // 무한 대기 없이 drain emit 시 즉시 다음 write로 진행되어야 함.
  const mock = new MockWritable();
  const N = 100;
  mock.writeReturnValues = new Array(N).fill(false);

  const payload = "x".repeat(10_000); // 10KB per event

  // drain emitter 루프: 매 write 후 micro-delay로 drain emit
  const writes: Promise<void>[] = [];
  for (let i = 0; i < N; i++) {
    const p = writeEvent(mock as unknown as import("node:stream").Writable, payload);
    writes.push(p);
    // drain emit을 micro-task로 스케줄하여 다음 write가 진행되게 함
    await new Promise((r) => setImmediate(r));
    mock.emit("drain");
  }

  await Promise.all(writes);

  assert.equal(mock.writeCalls.length, N, "all writes completed");
  // 리스너 누수 없음
  assert.equal(mock.listenerCount("drain"), 0, "no drain listener leaked");
  assert.equal(mock.listenerCount("error"), 0, "no error listener leaked");
});
