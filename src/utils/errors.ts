/**
 * [파일 목적]
 * 이 파일은 프록시 전역에서 사용하는 에러 타입과 Express 에러 처리기를 제공한다.
 * 내부 예외를 Anthropic 호환 에러 응답 형식으로 정규화하는 책임을 가진다.
 *
 * [주요 흐름]
 * 1. ProxyError로 상태 코드/에러 타입/세부 정보를 함께 보관한다.
 * 2. notFoundHandler가 미등록 경로를 404 형식으로 변환한다.
 * 3. errorHandler가 body parser 오류와 일반 예외를 공통 응답으로 변환한다.
 *
 * [외부 연결]
 * - server.ts: 전역 에러 핸들러 체인 등록
 * - routes/messages.ts: 비즈니스 예외를 ProxyError로 전달
 *
 * [수정시 주의]
 * - error body 구조를 바꾸면 Anthropic 클라이언트 호환성이 깨질 수 있다.
 * - 상태 코드 매핑을 바꾸면 클라이언트 재시도/에러 처리 동작이 달라진다.
 */
import type { NextFunction, Request, Response } from "express";

export class ProxyError extends Error {
  public readonly statusCode: number;
  public readonly errorType: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    errorType = "proxy_error",
    details?: unknown
  ) {
    super(message);
    this.name = "ProxyError";
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.details = details;
  }
}

interface AnthropicErrorBody {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

export function formatErrorResponse(error: ProxyError): AnthropicErrorBody {
  return {
    type: "error",
    error: {
      type: error.errorType,
      message: error.message
    }
  };
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ProxyError("Not Found", 404, "not_found_error"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isBodyTooLarge =
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large";

  const isBodySyntaxError =
    err instanceof SyntaxError &&
    typeof err === "object" &&
    err !== null &&
    "body" in err;

  const proxyError = err instanceof ProxyError
    ? err
    : isBodyTooLarge
      ? new ProxyError(
          "Request body too large. Reduce image size or increase PROXY_JSON_LIMIT.",
          413,
          "request_too_large",
        )
      : isBodySyntaxError
        ? new ProxyError("Invalid JSON body", 400, "invalid_request_error")
        : new ProxyError("Internal Server Error", 500, "internal_server_error", {
            name: err instanceof Error ? err.name : undefined,
            message: err instanceof Error ? err.message : String(err),
          });

  if (proxyError.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error("[ERROR]", proxyError);
  }

  res.status(proxyError.statusCode).json(formatErrorResponse(proxyError));
}
