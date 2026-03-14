/*
[파일 목적]
MCP 서버에서 수집한 tool 스키마를 프록시 생명주기 동안 캐싱하는 싱글턴 레지스트리.
수집한 툴 이름은 Claude Code 컨벤션(mcp__서버명__툴명)으로 프리픽스된다.

[주요 흐름]
1. initialize() 호출 시 PROXY_MCP_SERVERS 기반으로 활성 서버 결정
2. 각 서버에 병렬 연결 → tool 스키마 수집 → CodexTool 형식으로 변환
3. getTools()로 캐시된 툴 목록을 요청 변환 단계에서 주입

[외부 연결]
- ./config.ts: MCP 서버 설정 읽기
- ./client.ts: 실제 MCP 연결 및 툴 수집
- ../transformers/request.ts: CodexTool 타입

[수정시 주의]
- 이 레지스트리는 서버 시작 시 한 번만 초기화된다 (동적 갱신 없음)
- 툴 이름 prefix 형식을 바꾸면 Claude Code의 MCP 라우팅이 깨진다
*/
import type { CodexTool } from "../transformers/request.js";
import { readMcpServerConfigs, getEnabledServerNames } from "./config.js";
import { fetchMcpTools } from "./client.js";

class McpToolRegistry {
  private tools: CodexTool[] = [];

  /*
  [목적]
  활성화된 MCP 서버에 모두 연결해 tool 스키마를 수집하고 캐싱한다.
  서버별로 독립적으로 실패해도 나머지 서버는 정상 처리된다.

  [주의]
  - PROXY_MCP_SERVERS 미설정 시 즉시 반환 (MCP 기능 비활성)
  - 서버가 설정에 없는 이름이면 경고 후 건너뜀
  */
  async initialize(): Promise<void> {
    const configs = readMcpServerConfigs();
    const allNames = Object.keys(configs);
    const enabled = getEnabledServerNames(allNames);

    if (enabled.length === 0) {
      const envVal = process.env.PROXY_MCP_SERVERS;
      if (!envVal) {
        console.log("[mcp-registry] disabled (PROXY_MCP_SERVERS not set)");
      } else {
        console.warn(`[mcp-registry] no matching servers for PROXY_MCP_SERVERS="${envVal}"`);
      }
      return;
    }

    console.log(`[mcp-registry] connecting to: ${enabled.join(", ")}`);

    const results = await Promise.allSettled(
      enabled.map(async (name) => {
        const config = configs[name];
        if (!config) return { name, tools: [] };
        const tools = await fetchMcpTools(name, config);
        return { name, tools };
      }),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[mcp-registry] server load failed:", result.reason);
        continue;
      }
      const { name, tools } = result.value;
      console.log(`[mcp-registry] ${name}: ${tools.length} tools loaded`);

      for (const tool of tools) {
        this.tools.push({
          type: "function",
          // Claude Code의 MCP 라우팅 컨벤션: mcp__서버명__툴명
          name: `mcp__${name}__${tool.name}`,
          description: tool.description,
          parameters: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
        });
      }
    }

    console.log(`[mcp-registry] ready: ${this.tools.length} total MCP tools`);
  }

  /*
  [목적]
  캐시된 MCP tool 목록을 반환한다. 요청 변환 단계에서 Codex 요청에 주입할 때 사용.
  */
  getTools(): CodexTool[] {
    return this.tools;
  }
}

export const mcpToolRegistry = new McpToolRegistry();
