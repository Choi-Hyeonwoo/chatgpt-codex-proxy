/**
 * [파일 목적]
 * OAuth 로그인 플로우, PKCE 생성, token exchange/refresh, 콜백 서버 관리를 담당한다.
 * jwt.ts의 buildTokenData와 token-storage.ts의 파일 IO를 조합해 로그인 전체 흐름을 구현.
 *
 * [주요 흐름]
 * 1. generatePKCE/createState: CSRF 및 PKCE 값을 만든다.
 * 2. login: 로컬 콜백 서버를 열고 브라우저 인증 URL을 연다.
 * 3. exchangeCodeForTokens: authorization code → TokenData.
 * 4. refreshAccessToken: refresh token → 새 TokenData.
 * 5. getValidTokens: 만료 시 자동 갱신 후 반환.
 * 6. getAuthStatus: 로그인 상태 요약 리턴.
 *
 * [외부 연결]
 * - OpenAI OAuth endpoint: authorize/token
 * - node:http 로컬 콜백 서버
 *
 * [수정시 주의]
 * - redirect URI, client_id, scope를 바꾸면 OAuth 로그인 자체가 깨진다.
 * - token 만료 버퍼(5분)를 바꾸면 갱신 타이밍이 달라진다.
 * - account id 추출은 jwt.buildTokenData에 위임되어 있다.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createLogger } from "../utils/logger.js";
import { buildTokenData } from "./jwt.js";
import { loadTokens, saveTokens, type TokenData } from "./token-storage.js";
import { getValidToken as _getCachedToken, setRefreshFn } from "./token-cache.js";

const log = createLogger("auth");

// OAuth Constants (from OpenAI Codex CLI)
export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export const TOKEN_URL = "https://auth.openai.com/oauth/token";
export const REDIRECT_URI = "http://localhost:1455/auth/callback";
export const SCOPE = "openid profile email offline_access";

/**
 * Generate random state for CSRF protection
 */
export function createState(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Generate PKCE verifier and challenge
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  verifier: string
): Promise<TokenData | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error(`Token exchange failed status=${res.status}`, text);
    return null;
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json?.access_token || !json?.refresh_token || !json?.expires_in) {
    log.error("Token response missing fields");
    return null;
  }

  return buildTokenData({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
  });
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenData | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error(`Token refresh failed status=${res.status}`, text);
    return null;
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!json?.access_token || !json?.refresh_token || !json?.expires_in) {
    return null;
  }

  return buildTokenData({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
  });
}

// Register the refresh function into token-cache (avoids circular import).
// This runs once at module load time.
setRefreshFn(async () => {
  const stored = loadTokens();
  if (!stored) throw new Error("No stored tokens for refresh");
  const newTokens = await refreshAccessToken(stored.refresh_token);
  if (!newTokens) throw new Error("Token refresh returned null");
  saveTokens(newTokens);
  return newTokens;
});

/**
 * Get valid tokens (refresh if needed).
 * Delegates to token-cache for in-memory caching and concurrent dedup (#8).
 * Returns null only when no stored tokens exist (not logged in).
 */
export async function getValidTokens(): Promise<TokenData | null> {
  // If there are no stored tokens, user is not logged in.
  const stored = loadTokens();
  if (!stored) return null;

  try {
    return await _getCachedToken();
  } catch {
    return null;
  }
}

/**
 * Open URL in default browser
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;

  switch (platform) {
    case "darwin":
      cmd = "open";
      break;
    case "win32":
      cmd = "start";
      break;
    default:
      cmd = "xdg-open";
  }

  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

/**
 * Start OAuth login flow
 */
export async function login(): Promise<TokenData | null> {
  const pkce = generatePKCE();
  const state = createState();

  // Build authorization URL
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "codex_cli_rs");

  log.info("========================================");
  log.info("ChatGPT Codex Proxy - OAuth Login");
  log.info("========================================");

  // Start local server FIRST, then open browser
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url?.startsWith("/auth/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const callbackUrl = new URL(req.url, REDIRECT_URI);
      const code = callbackUrl.searchParams.get("code");
      const returnedState = callbackUrl.searchParams.get("state");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e;">
            <div style="text-align: center; color: #eee;">
              <h1 style="color: #10a37f;">Authentication Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </div>
          </body>
        </html>
      `);

      if (returnedState !== state) {
        log.error("State mismatch - possible CSRF attack");
        server.close();
        resolve(null);
        return;
      }

      if (!code) {
        log.error("No authorization code received");
        server.close();
        resolve(null);
        return;
      }

      // Exchange code for tokens
      exchangeCodeForTokens(code, pkce.verifier)
        .then((tokens) => {
          if (tokens) {
            saveTokens(tokens);
            log.info("Authentication successful! Tokens saved.");
            log.info(`Account ID: ${tokens.chatgpt_account_id ?? "-"}`);
            log.info(`Token expires: ${new Date(tokens.expires_at).toLocaleString()}`);
          }
          server.close();
          resolve(tokens);
        })
        .catch((err) => {
          log.error("Token exchange error", err);
          server.close();
          resolve(null);
        });
    });

    // Start server FIRST
    server.listen(1455, () => {
      log.info("Callback server started on port 1455");
      log.info("Opening browser for authentication...");
      log.info(`If browser doesn't open, visit: ${url.toString()}`);

      // Open browser AFTER server is ready
      openBrowser(url.toString());
    });

    server.on("error", (err: Error) => {
      log.error(`Server error: ${err.message}`);
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        log.error("Port 1455 is already in use. Another login may be in progress.");
      }
      resolve(null);
    });

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      log.error("Authentication timeout");
      server.close();
      resolve(null);
    }, 5 * 60 * 1000);

    // Clear timeout if server closes early
    server.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Check authentication status
 */
export async function getAuthStatus(): Promise<{
  loggedIn: boolean;
  expired: boolean;
  hasRefreshToken: boolean;
  expiresAt?: number;
}> {
  const tokens = loadTokens();
  if (!tokens) {
    return { loggedIn: false, expired: false, hasRefreshToken: false };
  }

  const expired = Date.now() >= tokens.expires_at - 5 * 60 * 1000;
  return {
    loggedIn: !expired,
    expired,
    hasRefreshToken: Boolean(tokens.refresh_token),
    expiresAt: tokens.expires_at,
  };
}
