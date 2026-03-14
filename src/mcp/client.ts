/*
[파일 목적]
MCP(Model Context Protocol) 서버에서 tool 목록을 가져오는 클라이언트.
HTTP와 stdio 두 가지 전송 방식을 지원한다.

[주요 흐름]
1. HTTP: fetch 기반 JSON-RPC → initialize → notifications/initialized → tools/list
2. stdio: 자식 프로세스 스폰 → stdin/stdout 기반 JSON-RPC → 동일 순서

[외부 연결]
- MCP Streamable HTTP spec (2025-03-26)
- Node.js child_process (stdio 방식)

[수정시 주의]
- stdio 방식은 자식 프로세스를 시작 후 스키마 수집 즉시 SIGTERM 으로 종료한다
- HTTP 방식은 Mcp-Session-Id 헤더를 캡처해 후속 요청에 포함해야 한다
- JSON-RPC 응답이 SSE(text/event-stream) 형식일 수 있으므로 양쪽 모두 처리한다
*/
import { spawn } from "node:child_process";
import type { McpServerConfig } from "./config.js";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/*
[목적]
JSON-RPC HTTP 응답 본문에서 result 를 추출한다.
Content-Type이 text/event-stream 이면 SSE 파싱, 아니면 JSON 직접 파싱.

[입력]
- resp: fetch Response 객체
- expectedId: 매칭할 JSON-RPC request id

[출력]
- result 필드 값 (없으면 null)
*/
async function extractJsonRpcResult(resp: Response, expectedId: number): Promise<unknown> {
  const contentType = resp.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const text = await resp.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const msg = JSON.parse(line.slice(6)) as { id?: number; result?: unknown };
        if (msg.id === expectedId) return msg.result;
      } catch {
        // 파싱 실패한 줄은 무시
      }
    }
    return null;
  }

  const json = (await resp.json()) as { result?: unknown };
  return json.result ?? null;
}

/*
[목적]
HTTP 타입 MCP 서버에 연결해 tool 목록을 가져온다.

[입력]
- config: url과 선택적 headers 를 포함한 MCP 서버 설정

[출력]
- McpTool[]: 서버가 노출한 툴 목록 (실패 시 빈 배열)

[주의]
- initialize 후 Mcp-Session-Id 헤더를 캡처해 이후 요청에 포함해야 한다
- notifications/initialized 는 fire-and-forget (응답 파싱 불필요)
- 전체 작업에 대해 AbortController 타임아웃(20초) 적용
*/
async function fetchToolsHttp(config: McpServerConfig & { url: string }): Promise<McpTool[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(config.headers ?? {}),
    };

    // Step 1: initialize
    const initResp = await fetch(config.url, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "chatgpt-codex-proxy", version: "1.0.0" },
        },
      }),
      signal: controller.signal,
    });

    // Mcp-Session-Id 캡처 (스트리밍 HTTP 스펙)
    const sessionId = initResp.headers.get("mcp-session-id");
    const sessionHeaders: Record<string, string> = sessionId
      ? { ...baseHeaders, "mcp-session-id": sessionId }
      : baseHeaders;

    await extractJsonRpcResult(initResp, 1);

    // Step 2: notifications/initialized (fire-and-forget, 응답 무시)
    fetch(config.url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).catch(() => {});

    // Step 3: tools/list
    const toolsResp = await fetch(config.url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      signal: controller.signal,
    });

    const result = (await extractJsonRpcResult(toolsResp, 2)) as { tools?: McpTool[] } | null;
    return result?.tools ?? [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/*
[목적]
stdio 타입 MCP 서버 프로세스를 스폰해 tool 목록을 가져온 뒤 즉시 종료한다.

[입력]
- serverName: 로그용 서버 이름
- config: command/args/env 를 포함한 MCP 서버 설정

[출력]
- McpTool[]: 서버가 노출한 툴 목록 (실패/타임아웃 시 빈 배열)

[주의]
- JSON-RPC 메시지는 '\n' 구분자 기반 (MCP stdio 전송 스펙)
- settle() 은 최초 한 번만 실행된다 (중복 resolve 방지)
- 20초 타임아웃 후 자동으로 빈 배열로 settle
*/
async function fetchToolsStdio(serverName: string, config: McpServerConfig): Promise<McpTool[]> {
  return new Promise<McpTool[]>((resolve) => {
    let settled = false;

    const settle = (tools: McpTool[]) => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // 이미 종료된 경우 무시
      }
      resolve(tools);
    };

    const child = spawn(config.command!, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let buffer = "";

    /*
    MCP stdio 전송은 '\n' 구분 JSON-RPC 라인 프로토콜.
    initialize 응답(id=1) 수신 후 initialized 통지 + tools/list 요청 순으로 진행.
    */
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let msg: { id?: number; result?: { tools?: McpTool[] } };
        try {
          msg = JSON.parse(line) as typeof msg;
        } catch {
          continue;
        }

        if (msg.id === 1) {
          // initialize 완료 → initialized 통지 후 tools/list 요청
          child.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
          );
          child.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n",
          );
        } else if (msg.id === 2) {
          settle(msg.result?.tools ?? []);
        }
      }
    });

    child.on("error", (err) => {
      console.warn(`[mcp-client] ${serverName} process error: ${String(err)}`);
      settle([]);
    });
    child.on("exit", () => settle([]));

    // initialize 요청 전송
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "chatgpt-codex-proxy", version: "1.0.0" },
        },
      }) + "\n",
    );

    setTimeout(() => settle([]), 20_000);
  });
}

/*
[목적]
서버 설정 타입(http/stdio)에 따라 적절한 클라이언트 함수를 호출한다.

[입력]
- serverName: 로그 및 툴 이름 prefix 용
- config: MCP 서버 설정

[출력]
- McpTool[]: 수집된 툴 목록 (실패 시 빈 배열)
*/
export async function fetchMcpTools(serverName: string, config: McpServerConfig): Promise<McpTool[]> {
  if (config.type === "http" && config.url) {
    return fetchToolsHttp({ ...config, url: config.url });
  }
  if (config.command) {
    return fetchToolsStdio(serverName, config);
  }
  console.warn(`[mcp-client] ${serverName}: unsupported config (no url or command)`);
  return [];
}
