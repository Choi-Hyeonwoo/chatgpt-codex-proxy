/**
 * [파일 목적]
 * 로그 출력 전에 자격 증명을 마스킹하는 유틸리티.
 * Bearer 토큰, JWT, OAuth URL 쿼리 파라미터, chatgpt-account-id 헤더,
 * access_token / refresh_token / authorization 값을 전부 치환한다.
 *
 * [주요 흐름]
 * - redactSecrets(input): 문자열이면 모든 패턴 치환, 객체면 JSON.stringify 후 치환.
 * - sanitizeString: 단일 문자열에 대한 순수 치환.
 * - sanitizeObject: 객체의 민감 필드를 재귀적으로 마스킹한 신규 객체 반환.
 *
 * [수정시 주의]
 * - 새 패턴을 추가할 때는 기존 매치 결과에 영향이 없는지 확인한다
 *   (예: Bearer 치환 후 access_token 치환이 연쇄되면 중복 마스킹 가능).
 * - 정규식은 greedy 하지 않게 구성하여 정상 텍스트 손실을 막는다.
 */

const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/g;
const JWT_RE = /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g;
// OAuth / token URL query params (code, state, access_token, refresh_token, id_token, code_verifier, authorization)
const OAUTH_QUERY_RE =
  /([?&])(code|state|access_token|refresh_token|id_token|code_verifier|authorization)=([^&\s"'<>]+)/gi;
// "access_token":"xxx" / "refresh_token":"xxx" / "authorization":"xxx" in JSON-ish strings
const JSON_FIELD_RE =
  /("(?:access_token|refresh_token|id_token|authorization|code_verifier)"\s*:\s*")([^"]+)(")/gi;
// chatgpt-account-id header value (header line or JSON field)
const ACCOUNT_ID_HEADER_RE =
  /(["']?chatgpt-account-id["']?\s*[:=]\s*["']?)([^"',\s}>]+)/gi;

/**
 * Replace all secret-shaped substrings in a plain string.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input;
  // JWT first, before Bearer could partially consume the trailing dotted payload.
  out = out.replace(JWT_RE, "***JWT***");
  out = out.replace(BEARER_RE, "Bearer ***");
  out = out.replace(OAUTH_QUERY_RE, (_m, sep: string, key: string) => `${sep}${key}=***`);
  out = out.replace(JSON_FIELD_RE, (_m, prefix: string, _val: string, suffix: string) => `${prefix}***${suffix}`);
  out = out.replace(ACCOUNT_ID_HEADER_RE, (_m, prefix: string) => `${prefix}***account-id***`);
  return out;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "code_verifier",
  "code",
  "state",
  "chatgpt-account-id",
]);

/**
 * Return a deep-cloned object with sensitive string fields masked.
 * Non-sensitive strings are still passed through sanitizeString() so that
 * embedded Bearer tokens / JWTs / OAuth URLs get redacted.
 */
export function sanitizeObject<T>(input: T): T {
  return cloneWithRedaction(input) as T;
}

function cloneWithRedaction(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => cloneWithRedaction(v));
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    const raw = src[key];
    const keyLower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(keyLower)) {
      if (typeof raw === "string" && raw.length > 0) {
        out[key] = keyLower === "chatgpt-account-id" ? "***account-id***" : "***";
      } else {
        out[key] = raw;
      }
      continue;
    }
    out[key] = cloneWithRedaction(raw);
  }
  return out;
}

/**
 * Convenience: accept a string or object and return a redacted string
 * suitable for console.log.
 */
export function redactSecrets(input: unknown): string {
  if (input === null || input === undefined) return String(input);
  if (typeof input === "string") return sanitizeString(input);
  if (input instanceof Error) {
    return sanitizeString(`${input.name}: ${input.message}`);
  }
  try {
    const cloned = sanitizeObject(input);
    return JSON.stringify(cloned);
  } catch {
    return sanitizeString(String(input));
  }
}
