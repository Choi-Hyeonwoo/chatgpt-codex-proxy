/**
 * [파일 목적]
 * OAuth 토큰을 로컬 파일 시스템에 저장하고 불러오는 책임을 담당한다.
 * keychain 미사용, ~/.chatgpt-codex-proxy/tokens.json 파일만 사용.
 *
 * [주요 흐름]
 * 1. loadTokens: TOKEN_FILE 파일을 읽어 TokenData로 파싱. 없으면 null.
 * 2. saveTokens: 디렉토리 보장 후 JSON 저장.
 * 3. logout: 파일이 있으면 삭제 (멱등).
 *
 * [외부 연결]
 * - 파일 시스템: ~/.chatgpt-codex-proxy/tokens.json
 *
 * [수정시 주의]
 * - TokenData 필드를 바꾸면 oauth/jwt 모듈과 일치시켜야 한다.
 * - 파일 경로는 join + homedir 기반이므로 테스트 환경에서 fixture 주입이 필요하다.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../utils/logger.js";

const log = createLogger("auth");

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  chatgpt_account_id?: string;
}

export const TOKEN_FILE = join(homedir(), ".chatgpt-codex-proxy", "tokens.json");

/**
 * Load tokens from file
 */
export function loadTokens(): TokenData | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    const data = readFileSync(TOKEN_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save tokens to file
 */
export function saveTokens(tokens: TokenData): void {
  const dir = dirname(TOKEN_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

/**
 * Logout (delete tokens)
 */
export function logout(): void {
  if (existsSync(TOKEN_FILE)) {
    unlinkSync(TOKEN_FILE);
    log.info("Logged out - tokens deleted");
  }
}
