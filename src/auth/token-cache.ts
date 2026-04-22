/**
 * [파일 목적]
 * 인메모리 토큰 캐시 + 동시 refresh 중복 제거(dedup)를 담당한다.
 * - 만료 5분 전 pre-refresh (BUFFER_MS)
 * - 동시 N개 요청이 동일 만료 토큰 발견 시 refresh는 1회만 실행,
 *   나머지는 진행 중인 Promise를 공유해 대기 후 같은 결과 수신.
 *
 * [주요 흐름]
 * 1. getValidToken 호출
 * 2. 캐시 유효 → 즉시 반환
 * 3. 이미 refresh 진행 중 → 기존 Promise 반환 (dedup)
 * 4. refresh 필요 → refreshFn()으로 새 토큰 획득, 캐시 갱신
 *
 * [외부 연결]
 * - refreshFn: 외부에서 주입 (순환 참조 방지). oauth.ts가 setRefreshFn으로 등록.
 * - token-storage.ts: loadTokens, saveTokens, TokenData
 *
 * [수정시 주의]
 * - BUFFER_MS를 바꾸면 oauth.ts의 5분 버퍼 설명과 일치시켜야 한다.
 * - refreshPromise 리셋은 finally에서 반드시 실행되어야 실패 후 재시도가 가능하다.
 * - 테스트에서 _resetCache()로 모듈 상태를 초기화할 수 있다.
 */

import { type TokenData } from "./token-storage.js";

/** 만료 5분 전에 미리 갱신 */
export const BUFFER_MS = 5 * 60 * 1000;

let cached: TokenData | null = null;
let refreshPromise: Promise<TokenData> | null = null;

/** 주입된 refresh 함수 타입 */
export type RefreshFn = () => Promise<TokenData>;

let _refreshFn: RefreshFn | null = null;

/**
 * refresh 함수를 외부에서 주입 (순환 참조 방지용 DI).
 * oauth.ts 초기화 시점에 한 번 호출.
 */
export function setRefreshFn(fn: RefreshFn): void {
  _refreshFn = fn;
}

/**
 * 실제 refresh 수행
 */
async function doRefresh(): Promise<TokenData> {
  if (!_refreshFn) {
    throw new Error("token-cache: refreshFn not set. Call setRefreshFn() first.");
  }
  return _refreshFn();
}

/**
 * 유효한 토큰 반환.
 * - 인메모리 캐시가 유효하면 즉시 반환
 * - refresh 진행 중이면 동일 Promise 반환 (dedup)
 * - 그 외 refresh 실행 후 캐시 갱신
 */
export async function getValidToken(): Promise<TokenData> {
  // 캐시 유효성 확인 (buffer 포함)
  if (cached !== null && cached.expires_at - BUFFER_MS > Date.now()) {
    return cached;
  }

  // 이미 진행 중인 refresh가 있으면 공유 (dedup)
  if (refreshPromise !== null) {
    return refreshPromise;
  }

  // 새 refresh 시작
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });

  try {
    cached = await refreshPromise;
    return cached;
  } catch (err) {
    // refresh 실패 시 캐시 무효화
    cached = null;
    throw err;
  }
}

/**
 * 캐시를 명시적으로 설정 (외부에서 새 토큰을 받았을 때 사용)
 */
export function setCachedToken(token: TokenData): void {
  cached = token;
}

/**
 * @internal 테스트 전용 — 모듈 인메모리 상태 초기화
 */
export function _resetCache(): void {
  cached = null;
  refreshPromise = null;
  _refreshFn = null;
}
