/**
 * [파일 목적]
 * 이 파일은 Anthropic Messages API 요청 본문의 유효성을 엄격하게 검증한다.
 * routes/messages.ts의 얕은 검사를 대체하여 잘못된 요청을 라우터 진입 직후에 차단한다.
 *
 * [주요 흐름]
 * 1. body 가 object 인지, model/messages 가 스키마에 부합하는지 확인한다.
 * 2. tools/tool_choice/max_tokens 등 선택 필드의 형식을 확인한다.
 * 3. 위반 시 ProxyError(400, "invalid_request_error", ...) 을 던진다.
 *
 * [외부 연결]
 * - routes/messages.ts: 라우트 초입에서 호출
 * - utils/errors.ts: ProxyError 재사용
 *
 * [수정시 주의]
 * - 에러 메시지 변경 시 클라이언트 디버깅 경험이 달라진다.
 * - 규칙을 느슨하게 풀면 하위 변환기에서 런타임 오류가 발생할 수 있다.
 */
import { ProxyError } from "./errors.js";

const VALID_ROLES = new Set(["user", "assistant"]);
const VALID_TOOL_CHOICE_TYPES = new Set(["auto", "none", "any", "tool"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new ProxyError(message, 400, "invalid_request_error");
}

export function validateAnthropicRequest(body: unknown): void {
  if (!isPlainObject(body)) {
    fail("Invalid JSON body");
  }

  const { model, messages, tools, tool_choice, max_tokens } = body as Record<string, unknown>;

  // model: non-empty string
  if (typeof model !== "string" || model.length === 0) {
    fail("Invalid request: 'model' must be a non-empty string");
  }

  // messages: array with length >= 1
  if (!Array.isArray(messages) || messages.length < 1) {
    fail("Invalid request: 'messages' must be a non-empty array");
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!isPlainObject(msg)) {
      fail(`Invalid request: messages[${i}] must be an object`);
    }
    const role = (msg as Record<string, unknown>).role;
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      fail(`Invalid request: messages[${i}].role must be 'user' or 'assistant'`);
    }
    const content = (msg as Record<string, unknown>).content;
    if (content === undefined || content === null) {
      fail(`Invalid request: messages[${i}].content is required`);
    }
  }

  // tools (optional): must be array of { name, input_schema }
  if (tools !== undefined) {
    if (!Array.isArray(tools)) {
      fail("Invalid request: 'tools' must be an array");
    }
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      if (!isPlainObject(tool)) {
        fail(`Invalid request: tools[${i}] must be an object`);
      }
      const toolRecord = tool as Record<string, unknown>;
      if (typeof toolRecord.name !== "string" || toolRecord.name.length === 0) {
        fail(`Invalid request: tools[${i}].name must be a non-empty string`);
      }
      if (toolRecord.input_schema === undefined || toolRecord.input_schema === null) {
        fail(`Invalid request: tools[${i}].input_schema is required`);
      }
    }
  }

  // tool_choice (optional)
  if (tool_choice !== undefined) {
    if (!isPlainObject(tool_choice)) {
      fail("Invalid request: 'tool_choice' must be an object");
    }
    const tc = tool_choice as Record<string, unknown>;
    if (typeof tc.type !== "string" || !VALID_TOOL_CHOICE_TYPES.has(tc.type)) {
      fail("Invalid request: 'tool_choice.type' must be one of auto|none|any|tool");
    }
    if (tc.type === "tool") {
      if (typeof tc.name !== "string" || tc.name.length === 0) {
        fail("Invalid request: 'tool_choice.name' is required when tool_choice.type is 'tool'");
      }
    }
  }

  // max_tokens (optional): positive integer if provided
  if (max_tokens !== undefined) {
    if (
      typeof max_tokens !== "number" ||
      !Number.isInteger(max_tokens) ||
      max_tokens <= 0
    ) {
      fail("Invalid request: 'max_tokens' must be a positive integer");
    }
  }
}
