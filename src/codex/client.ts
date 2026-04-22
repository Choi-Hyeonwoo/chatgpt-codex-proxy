/**
 * [파일 목적]
 * 이 파일은 Codex Responses API와 직접 통신하는 클라이언트 계층이다.
 * 인증 토큰을 읽어 요청을 보내고, SSE 응답을 최종 CodexResponse 형태로 복원한다.
 *
 * [주요 흐름]
 * 1. getValidTokens로 access token과 account id를 확보한다.
 * 2. Anthropic 변환 결과(CodexRequest)를 Codex backend 형식으로 전송한다.
 * 3. 에러 응답은 상태 코드별로 CodexApiError로 정규화한다.
 * 4. SSE 스트림에서 delta/final event를 읽어 최종 응답 객체를 만든다.
 *
 * [외부 연결]
 * - ../auth.ts: 저장 토큰 조회/자동 갱신
 * - ../transformers/request.ts: CodexRequest 타입
 * - chatgpt.com/backend-api/codex/responses: 실제 호출 대상
 *
 * [수정시 주의]
 * - 헤더 이름(chatgpt-account-id, Authorization 등)을 바꾸면 인증이 실패할 수 있다.
 * - SSE 파싱 규칙을 바꾸면 정상 응답도 빈 응답이나 파싱 실패로 처리될 수 있다.
 * - 에러 매핑을 바꾸면 상위 라우트의 Anthropic 호환 에러 변환 결과가 달라진다.
 */
import { randomUUID } from "node:crypto";
import type { CodexRequest } from "../transformers/request.js";
import { getValidTokens } from "../auth.js";
import { redactSecrets } from "../utils/sanitize.js";

const CODEX_BASE_URL = process.env.CODEX_BASE_URL ?? "https://chatgpt.com/backend-api";
const CODEX_RESPONSES_PATH = "/codex/responses";

export interface CodexUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface CodexOutputContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  [key: string]: unknown;
}

export interface CodexOutputItem {
  id?: string;
  type?: string;
  role?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: CodexOutputContent[];
  [key: string]: unknown;
}

export interface CodexResponse {
  id: string;
  model: string;
  output: CodexOutputItem[];
  usage?: CodexUsage;
  stop_reason?: string;
  [key: string]: unknown;
}

interface SseEvent {
  event: string;
  data: string;
}

export class CodexApiError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "CodexApiError";
    this.status = status;
    this.details = details;
  }
}

function parseErrorMessage(status: number, body: unknown): string {
  const bodyObj = body as { error?: { message?: string }; message?: string };
  const apiMsg = bodyObj?.error?.message ?? bodyObj?.message;
  if (typeof apiMsg === "string" && apiMsg.length > 0) return apiMsg;

  if (status === 401) return "Invalid or expired Codex token.";
  if (status === 429) return "Codex rate limit exceeded.";
  if (status === 400) return "Invalid request for Codex API.";

  return "Codex API request failed.";
}

async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) break;

      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = rawEvent.split("\n");
      let event = "message";
      const dataParts: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataParts.push(line.slice(5).trim());
        }
      }

      const data = dataParts.join("\n");
      if (data.length === 0) continue;

      yield { event, data };
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split("\n");
    let event = "message";
    const dataParts: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataParts.push(line.slice(5).trim());
    }

    if (dataParts.length > 0) {
      yield { event, data: dataParts.join("\n") };
    }
  }
}

export class CodexClient {
  async createResponse(request: CodexRequest): Promise<CodexResponse> {
    const tokens = await getValidTokens();

    if (!tokens) {
      throw new CodexApiError("Not authenticated. Please run 'npm run login' first.", 401);
    }

    if (!tokens.chatgpt_account_id) {
      throw new CodexApiError("Could not extract ChatGPT account ID from token.", 401);
    }

    // Wrapping through redactSecrets keeps this log consistent with the
    // sanitizer contract used elsewhere; model/effort are non-sensitive today
    // but the hook lets future fields (headers, account id) be safely logged.
    console.log(
      redactSecrets(`[chatgpt-codex-proxy] Calling ${request.model} with effort=${request.reasoning.effort}`),
    );

    // Codex CLI 경로는 항상 SSE. 비스트리밍 분기는 폐기됨.
    // Codex backend는 stream:true만 지원하므로 요청에 강제로 stream:true 주입.
    // 단일 파서(parseSseStream)를 통해 delta 누적 및 response.done/completed 이벤트를 수신한다.
    const codexRequest: CodexRequest = {
      ...request,
      stream: true,
    };

    const response = await fetch(`${CODEX_BASE_URL}${CODEX_RESPONSES_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokens.access_token}`,
        "chatgpt-account-id": tokens.chatgpt_account_id,
        "OpenAI-Beta": "responses=experimental",
        "originator": "codex_cli_rs",
      },
      body: JSON.stringify(codexRequest),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }

      if (response.status === 401) {
        throw new CodexApiError("Authentication expired. Please run 'npm run login' again.", 401, parsedBody);
      }
      if (response.status === 429) {
        throw new CodexApiError("Rate limited. Please wait and try again.", 429, parsedBody);
      }
      if (response.status === 400) {
        throw new CodexApiError(`Bad request: ${body}`, 400, parsedBody);
      }

      throw new CodexApiError(parseErrorMessage(response.status, parsedBody), response.status, parsedBody);
    }

    // 단일 코드패스: Codex는 항상 SSE로 응답하므로 parseSseResponse만 사용.
    return await this.parseSseResponse(response);
  }

  private async parseSseResponse(response: Response): Promise<CodexResponse> {
    if (!response.body) {
      throw new CodexApiError("Missing SSE response body from Codex API.", 502);
    }

    return await collectSseResponse(response.body);
  }
}

/**
 * SSE stream -> CodexResponse 변환 코어.
 * - delta(output_text.delta) 누적
 * - response.done/completed 중 "마지막으로 도착한" 이벤트가 최종으로 채택됨 (덮어쓰기)
 * - 최종 이벤트가 없으면 누적된 delta로 fallback assistant 메시지 생성
 * - [DONE] sentinel 수신 시 루프 종료
 * 테스트에서 재사용하기 위해 별도 함수로 분리하고 __testing__로 노출한다.
 */
async function collectSseResponse(stream: ReadableStream<Uint8Array>): Promise<CodexResponse> {
  const outputTextParts: string[] = [];
  let finalResponse: CodexResponse | null = null;

  for await (const event of parseSseStream(stream)) {
    if (event.data === "[DONE]") break;

    let parsed: { type?: string; delta?: string; response?: CodexResponse };
    try {
      parsed = JSON.parse(event.data);
    } catch {
      continue;
    }

    // Accumulate text deltas
    if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
      outputTextParts.push(parsed.delta);
    }

    // Capture final response (last wins: response.completed가 response.done 뒤에 오면 완료가 채택됨)
    if ((parsed.type === "response.done" || parsed.type === "response.completed") && parsed.response) {
      finalResponse = parsed.response;
    }
  }

  if (finalResponse) {
    return finalResponse;
  }

  // Fallback: construct response from accumulated text
  return {
    id: randomUUID(),
    model: "codex",
    output: [
      {
        role: "assistant",
        type: "message",
        content: [{ type: "output_text", text: outputTextParts.join("") }],
      },
    ],
    stop_reason: "end_turn",
  };
}

/**
 * 테스트 전용 노출. 프로덕션 코드에서 import하지 말 것.
 */
export const __testing__ = {
  parseSseStream,
  collectSseResponse,
};
