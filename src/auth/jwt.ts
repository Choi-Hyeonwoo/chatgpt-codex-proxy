/**
 * [파일 목적]
 * JWT 디코딩과 TokenData 조립 관련 순수 함수 모음.
 * OAuth flow 또는 파일 IO와 독립적이며 외부 의존성이 없다.
 *
 * [주요 흐름]
 * 1. decodeJWT: 3-segment JWT 문자열에서 payload를 JSON으로 반환.
 * 2. buildTokenData: OAuth 응답과 이전 TokenData를 조합해 최종 TokenData를 만든다.
 *
 * [외부 연결]
 * - 없음 (node:buffer만 사용)
 *
 * [수정시 주의]
 * - JWT payload 디코딩 실패는 예외 대신 null을 반환해야 한다.
 * - buildTokenData의 우선순위(response > JWT > previous)는 refresh 호출에서 필수.
 */

import type { TokenData } from "./token-storage.js";

/**
 * Decode JWT to extract payload
 */
export function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = Buffer.from(payload ?? "", "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Build TokenData from OAuth token response.
 * Deduplicates the field assembly logic used by both
 * exchangeCodeForTokens and refreshAccessToken (#4).
 *
 * - expires_at = Date.now() + expires_in * 1000
 * - account_id: response > JWT claim > previous (in that order)
 * - refresh_token / id_token (if added later): response > previous
 */
export function buildTokenData(
  resp: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
    account_id?: string;
  },
  previous?: TokenData
): TokenData {
  const decoded = decodeJWT(resp.access_token);
  const authClaim = decoded?.["https://api.openai.com/auth"] as
    | { chatgpt_account_id?: string }
    | undefined;
  const jwtAccountId = authClaim?.chatgpt_account_id;

  return {
    access_token: resp.access_token,
    refresh_token: resp.refresh_token ?? previous?.refresh_token ?? "",
    expires_at: Date.now() + resp.expires_in * 1000,
    chatgpt_account_id:
      resp.account_id ?? jwtAccountId ?? previous?.chatgpt_account_id,
  };
}

/** @internal Exposed for unit testing only. */
export const __testing__ = { buildTokenData };
