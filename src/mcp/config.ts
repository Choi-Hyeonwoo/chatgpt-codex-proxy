/*
[파일 목적]
~/.claude.json 에서 MCP 서버 설정을 읽고,
PROXY_MCP_SERVERS 환경변수 기반으로 활성화할 서버 이름 목록을 반환한다.

[외부 연결]
- ~/.claude.json: Claude Code가 관리하는 MCP 서버 설정 파일

[수정시 주의]
- 설정 파일 경로나 key 이름(mcpServers)이 Claude Code 버전에 따라 바뀔 수 있음
*/
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface McpServerConfig {
  type?: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/*
[목적]
~/.claude.json 의 mcpServers 섹션을 읽어 반환한다.

[출력]
- 서버 이름 → 설정 맵 (읽기 실패 시 빈 객체)
*/
export function readMcpServerConfigs(): Record<string, McpServerConfig> {
  const configPath = join(homedir(), ".claude.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, McpServerConfig> };
    return parsed.mcpServers ?? {};
  } catch {
    return {};
  }
}

/*
[목적]
PROXY_MCP_SERVERS 환경변수를 파싱해 실제 연결할 서버 이름 목록을 반환한다.

[입력]
- allNames: ~/.claude.json 에 있는 모든 서버 이름

[출력]
- 빈 배열: PROXY_MCP_SERVERS 미설정 → MCP 기능 비활성
- string[]: 활성화할 서버 이름 목록

[환경변수]
- PROXY_MCP_SERVERS=all          → 모든 서버 사용
- PROXY_MCP_SERVERS=stitch,linear → 지정 서버만 사용
- 미설정                          → MCP 비활성
*/
export function getEnabledServerNames(allNames: string[]): string[] {
  const envVal = process.env.PROXY_MCP_SERVERS?.trim();
  if (!envVal) return [];
  if (envVal === "all") return allNames;
  return envVal
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allNames.includes(s));
}
