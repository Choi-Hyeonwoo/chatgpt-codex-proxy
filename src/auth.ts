/**
 * [파일 목적]
 * OAuth 인증 모듈의 barrel. 구현은 src/auth/ 하위 3개 파일로 분리됨.
 * 하위 호환을 위해 기존 import 경로 (`./auth.js`)가 계속 동작하도록 재익스포트.
 *
 * [모듈 구성]
 * - src/auth/jwt.ts        — decodeJWT, buildTokenData (순수 함수)
 * - src/auth/token-storage.ts — loadTokens, saveTokens, logout, TOKEN_FILE, TokenData
 * - src/auth/oauth.ts      — login, exchangeCodeForTokens, refreshAccessToken,
 *                            getValidTokens, getAuthStatus, PKCE/state helpers
 *
 * [수정시 주의]
 * - 새 public symbol을 추가하면 해당 서브모듈과 이 barrel에 함께 노출해야 한다.
 * - 순환 import를 피하려면 oauth → token-storage → jwt 단방향 유지.
 */

export * from "./auth/jwt.js";
export * from "./auth/token-storage.js";
export * from "./auth/oauth.js";
