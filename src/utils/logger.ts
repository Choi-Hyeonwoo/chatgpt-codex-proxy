/**
 * [파일 목적]
 * LOG_LEVEL 환경변수로 런타임 제어 가능한 중앙 로거.
 * error < warn < info < debug 순서로 숫자화된 우선순위로 gating 하고,
 * 출력 직전에 redactSecrets 를 적용해 토큰/JWT/account-id 등을 자동 마스킹한다.
 *
 * [주요 흐름]
 * - parseLevel(raw): 문자열을 LogLevel 로 정규화. invalid 시 'info' fallback + 경고 한 번.
 * - emit(level, scope, msg, data): 레벨 통과 시 `[ISO] [LEVEL]` 접두어로 stdout/stderr 출력.
 * - logger: 모듈 전역 기본 스코프 로거. createLogger(scope) 로 스코프 prefix 추가 가능.
 * - 기본 출력은 console.log 이며 error 는 console.error 로 분리해 stderr 보존.
 *
 * [수정시 주의]
 * - 레벨 숫자 매핑을 바꾸면 LOG_LEVEL 비교 순서가 뒤집힌다.
 * - redactSecrets 호출 순서를 바꾸면 민감 정보가 그대로 출력될 수 있다.
 * - 테스트는 console.log / console.error 를 직접 spy 하므로 출력 함수를 바꿀 때
 *   test/utils.logger.test.ts 함께 갱신해야 한다.
 */
import { redactSecrets } from "./sanitize.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_VALUE: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const VALID_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

let invalidLevelWarned = false;

function parseLevel(raw: string | undefined): LogLevel {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return "info";
  if ((VALID_LEVELS as string[]).includes(trimmed)) {
    return trimmed as LogLevel;
  }
  if (!invalidLevelWarned) {
    invalidLevelWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[${new Date().toISOString()}] [WARN] Invalid LOG_LEVEL="${raw}"; falling back to "info".`,
    );
  }
  return "info";
}

function currentLevel(): LogLevel {
  return parseLevel(process.env.LOG_LEVEL);
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_VALUE[level] <= LEVEL_VALUE[currentLevel()];
}

function formatLine(level: LogLevel, scope: string | undefined, msg: string): string {
  const ts = new Date().toISOString();
  const label = level.toUpperCase();
  const safeMsg = redactSecrets(msg);
  const scopePart = scope ? ` [${scope}]` : "";
  return `[${ts}] [${label}]${scopePart} ${safeMsg}`;
}

function formatData(data: unknown): string {
  if (data === undefined) return "";
  // For Error objects, preserve name+message+stack with secrets redacted.
  if (data instanceof Error) {
    const base = `${data.name}: ${data.message}`;
    const stack = data.stack ? `\n${data.stack}` : "";
    return ` ${redactSecrets(base + stack)}`;
  }
  return ` ${redactSecrets(data)}`;
}

function emit(
  level: LogLevel,
  scope: string | undefined,
  msg: string,
  data?: unknown,
): void {
  if (!shouldEmit(level)) return;
  const line = formatLine(level, scope, msg) + formatData(data);
  // eslint-disable-next-line no-console
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export interface Logger {
  error(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;
}

export function createLogger(scope?: string): Logger {
  return {
    error: (msg: string, data?: unknown) => emit("error", scope, msg, data),
    warn: (msg: string, data?: unknown) => emit("warn", scope, msg, data),
    info: (msg: string, data?: unknown) => emit("info", scope, msg, data),
    debug: (msg: string, data?: unknown) => emit("debug", scope, msg, data),
  };
}

export const logger: Logger = createLogger();

/**
 * Test-only helper to reset the invalid-level warn flag between tests.
 */
export const __testing__ = {
  resetInvalidLevelWarned(): void {
    invalidLevelWarned = false;
  },
  parseLevel,
};
