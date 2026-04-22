/**
 * [파일 목적]
 * SSE 응답 스트림의 backpressure를 처리한다.
 * res.write()가 false를 반환하면 'drain' 이벤트를 기다린 후 resolve한다.
 *
 * [주요 흐름]
 * 1. write() 호출 → 반환값이 true면 즉시 resolve
 * 2. false면 drain 이벤트 대기
 * 3. error 이벤트 발생 시 reject
 *
 * [수정시 주의]
 * - Promise는 항상 settle되어야 함(drain/error 중 하나는 반드시 수신)
 * - 한 번만 resolve/reject 되도록 once() 사용
 */
import type { Writable } from "node:stream";

export function writeEvent(res: Writable, chunk: string | Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (res.write(chunk)) {
      resolve();
      return;
    }
    const onDrain = () => {
      res.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      res.off("drain", onDrain);
      reject(err);
    };
    res.once("drain", onDrain);
    res.once("error", onError);
  });
}
