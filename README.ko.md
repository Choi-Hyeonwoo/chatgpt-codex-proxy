# ChatGPT Codex Proxy

> **Claude Code**를 **ChatGPT Plus/Pro 구독**으로 실행하세요 — 워크플로우 변경 없이.

[🇺🇸 English](./README.md) | 🇰🇷 한국어

## 무엇인가?

이 프록시는 Claude Code가 Anthropic API 대신 ChatGPT의 Codex 백엔드로 요청을 보낼 수 있게 합니다.
`claude` 명령어, 슬래시 커맨드, MCP 툴, CLAUDE.md — 모든 것이 그대로 동작하고, 추론만 GPT가 처리합니다.

```
Claude Code  ──POST /v1/messages──>  chatgpt-codex-proxy  ──POST /codex/responses──>  ChatGPT
             <──Anthropic 응답──                           <──Codex SSE 응답──
```

## 언제 쓰면 좋은가

| 상황 | 이 프록시가 해결해 주는가? |
|---|---|
| Anthropic 할당량 소진 / 속도 제한 | ✅ 환경변수 하나로 GPT로 전환 |
| Claude Code를 벗어나지 않고 GPT 모델 사용해보기 | ✅ 동일한 워크플로우, 다른 백엔드 |
| 놀고 있는 ChatGPT Plus/Pro 구독 활용 | ✅ API 키 비용 없음 |
| MCP 툴(Stitch, Linear 등)을 GPT와 함께 사용 | ✅ 이 기능을 지원하는 유일한 프록시 |
| 다른 클라이언트용 OpenAI 호환 엔드포인트 필요 | [ChatMock](https://github.com/RayBytes/ChatMock) 사용 권장 |
| Ollama 호환 엔드포인트 필요 | [ChatMock](https://github.com/RayBytes/ChatMock) 사용 권장 |

## 왜 ChatMock이나 유사 도구 대신 이걸 쓰는가

**ChatMock** 같은 도구들은 OpenAI/Ollama 호환 API를 노출합니다. 범용 클라이언트에는 좋지만, Claude Code를 완전히 포기해야 합니다.

**이 프록시**는 Claude Code를 위해 만들어졌습니다:

- **워크플로우 변경 없음** — `claude` 명령어, 단축키, CLAUDE.md, 슬래시 커맨드가 모두 그대로 동작합니다.
- **MCP 툴이 GPT까지 전달됨** — Claude Code의 MCP 서버(Stitch, Linear, Chrome DevTools 등)는 원래 Claude 백엔드에서만 사용 가능합니다. 이 프록시는 시작 시 `~/.claude.json`을 읽어 MCP 서버에 연결하고, 툴 스키마를 모든 GPT 요청에 주입합니다. GPT도 Claude와 동일한 툴 접근 권한을 갖게 됩니다.
- **병렬 툴 호출 안전 처리** — 뮤테이팅 툴(Edit, Write, Delete, Bash)을 감지하면 자동으로 `parallel_tool_calls`를 비활성화해 파일 충돌을 방지합니다.
- **Claude 모델명 그대로 사용** — `--model claude-sonnet-4-20250514`처럼 평소대로 지정하면 프록시가 자동으로 Codex 모델에 매핑합니다. 또는 passthrough 모드에서 GPT 모델명을 직접 지정할 수도 있습니다.

## 실행 예시

![chatgpt-codex-proxy 실행 예시](./chatgpt-codex-proxy.png)

## 기능

- Anthropic Messages API 호환 (`POST /v1/messages`)
- OAuth 2.0 인증 — API 키 불필요, ChatGPT 구독만 있으면 됨
- 요청/응답 자동 변환 (Anthropic ↔ Codex)
- SSE 스트리밍
- Claude → Codex 모델 자동 매핑 (환경변수 오버라이드 지원)
- **MCP 툴 주입** (아래 참조)

## 빠른 시작

```bash
git clone <repo-url>
cd chatgpt-codex-proxy
npm install && npm run build

# ChatGPT 계정으로 로그인 (브라우저가 열립니다)
npm run login

# 프록시 시작
npm run dev
```

다른 터미널에서:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:19080
export ANTHROPIC_API_KEY=dummy   # 값은 사용하지 않지만 변수는 설정해야 함
claude
```

끝입니다. Claude Code가 이제 GPT 위에서 실행됩니다.

### 쉘 함수로 더 편리하게

`.zshrc`/`.bashrc`에 추가하면 `gpt` 명령어로 빠르게 실행할 수 있습니다:

```bash
gpt() {
  emulate -L zsh
  local proxy_port="${CHATGPT_CODEX_PROXY_PORT:-19080}"
  local token="${ANTHROPIC_AUTH_TOKEN:-${ANTHROPIC_API_KEY:-dummy}}"

  export ANTHROPIC_BASE_URL="http://127.0.0.1:${proxy_port}"
  export ANTHROPIC_AUTH_TOKEN="$token"
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$token}"
  export API_TIMEOUT_MS="${API_TIMEOUT_MS:-90000}"
  export PASSTHROUGH_MODE="${PASSTHROUGH_MODE:-true}"
  unset CLAUDE_CONFIG_DIR

  echo "Using local Codex proxy on :${proxy_port}"
  claude "$@"
}
```

## MCP 툴 주입

Claude Code의 MCP 툴은 원래 Claude 백엔드에서만 사용 가능합니다. 이 프록시는 그 간극을 메웁니다.

```
Claude Code                    chatgpt-codex-proxy                ChatGPT Codex API
   │  tools: [Edit, Bash, ...]       │  tools: [Edit, Bash, ...       │
   │  (deferred: stitch, qmd, ...)   │          + mcp__stitch__*      │
   │                                 │          + mcp__qmd__*  ]      │
   │ ───────────────────────────────>│ ─────────────────────────────> │
```

**동작 방식:**
1. 시작 시 `~/.claude.json` → `mcpServers` 읽기
2. 활성 서버마다 MCP 핸드셰이크(`initialize` → `tools/list`) 실행
3. 스키마를 프로세스 생명주기 동안 메모리에 캐싱
4. 매 `/v1/messages` 요청마다 캐시된 툴을 Codex `tools` 배열에 추가 (툴 이름: `mcp__서버명__툴명`)
5. GPT가 툴을 호출하면 Claude Code가 `tool_use` 응답을 받아 실제 MCP 호출을 수행하고, 결과를 프록시를 통해 되돌려 줌

HTTP(`type: http`)와 stdio(`command`) 방식 MCP 서버 모두 지원.

**설정** — `.env`에서 `PROXY_MCP_SERVERS` 지정:

```env
# 특정 서버만 활성화 (이름은 ~/.claude.json의 키와 일치해야 함)
PROXY_MCP_SERVERS=stitch,linear

# ~/.claude.json에 등록된 모든 서버
PROXY_MCP_SERVERS=all

# 비활성화 (기본값)
PROXY_MCP_SERVERS=
```

시작 시 로그:
```
[mcp-registry] connecting to: stitch, linear
[mcp-registry] stitch: 8 tools loaded
[mcp-registry] linear: 6 tools loaded
[mcp-registry] ready: 14 total MCP tools
```

## 설정

### `.env` 준비

```bash
cp .env.example .env
```

### 모델 매핑

기본값(`PASSTHROUGH_MODE=true`)에서는 Claude Code가 보내는 모델명을 그대로 Codex에 전달합니다.
`PASSTHROUGH_MODE=false`로 설정하면 Claude → Codex 자동 매핑이 활성화됩니다:

| Claude 모델 | Codex 모델 |
|---|---|
| `claude-sonnet-4-20250514` | `gpt-5.2-codex` |
| `claude-3-5-sonnet-20241022` | `gpt-5.2-codex` |
| `claude-3-haiku-20240307` | `gpt-5.3-codex-spark` |
| `claude-3-opus-20240229` | `gpt-5.3-codex-xhigh` |
| (기본값) | `gpt-5.2-codex` |

모델 패밀리별 오버라이드:

```env
ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-5.3-codex-spark
ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-5.2-codex
ANTHROPIC_DEFAULT_OPUS_MODEL=gpt-5.2-codex
```

### 사용 가능한 Codex 모델

| 모델 | Effort | 비고 |
|---|---|---|
| `gpt-5.4` | high | 플래그십 (2026) |
| `gpt-5` | high | |
| `gpt-5-codex` | high | 에이전틱 코딩 특화 |
| `gpt-5-codex-mini` | medium | |
| `gpt-5.3-codex` | high | |
| `gpt-5.3-codex-xhigh` | xhigh | |
| `gpt-5.3-codex-medium` | medium | |
| `gpt-5.3-codex-low` | low | |
| `gpt-5.3-codex-spark` | low | 속도 최적화, >1000 tok/s |
| `gpt-5.2-codex` | high | 프록시 기본값 |
| `gpt-5.2-codex-xhigh` | xhigh | |
| `gpt-5.2-codex-medium` | medium | |
| `gpt-5.2-codex-low` | low | |
| `gpt-5.1-codex` | high | |
| `gpt-5.1-codex-max` | xhigh | |
| `gpt-5.1-codex-mini` | medium | |

단축 별칭: `gpt-5.3` → `gpt-5.3-codex`, `gpt-5.2` → `gpt-5.2-codex`, `gpt-5.1` → `gpt-5.1-codex`

### Effort 제어

Claude Code의 effort 슬라이더는 GPT 모델 사용 시 API 요청에 포함되지 않습니다. 다음 방법으로 제어하세요:

**방법 1 — 모델명에 suffix 포함** (권장)

```bash
export ANTHROPIC_DEFAULT_SONNET_MODEL="gpt-5.3-codex-xhigh"  # xhigh
export ANTHROPIC_DEFAULT_HAIKU_MODEL="gpt-5.3-codex-spark"   # low
```

**방법 2 — 전역 설정**

```env
PROXY_DEFAULT_EFFORT=high
```

우선순위: 요청의 `thinking.budget_tokens` → 모델명 suffix/테이블 → `PROXY_DEFAULT_EFFORT` → `medium`

## CLI 명령어

| 명령어 | 설명 |
|---|---|
| `npm run login` | OAuth 로그인 (브라우저) |
| `npm run logout` | 저장된 토큰 삭제 |
| `npm run status` | 인증 상태 확인 |
| `npm run dev` | 개발 서버 실행 (hot reload) |
| `npm run start` | 프로덕션 서버 실행 |

## API 호환성

| 기능 | 지원 여부 | 비고 |
|---|---:|---|
| 기본 채팅 | ✅ | |
| 스트리밍 | ✅ | SSE |
| 멀티턴 대화 | ✅ | |
| 시스템 프롬프트 | ✅ | `instructions`로 매핑 |
| Tool Calling | ✅ | tool_use/tool_result 전체 사이클 지원 |
| 이미지 입력 | ⚠️ | 제한적 |
| Temperature | ❌ | Codex 백엔드 미지원 |
| Max Tokens | ❌ | Codex 백엔드 미지원 |

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `PORT` | `19080` | 서버 포트 |
| `PROXY_JSON_LIMIT` | `20mb` | JSON 본문 크기 제한 |
| `CODEX_BASE_URL` | `https://chatgpt.com/backend-api` | Codex API URL |
| `PASSTHROUGH_MODE` | `true` | `false`면 Claude→Codex 모델 매핑 활성화 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | - | Haiku → Codex 모델 매핑 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | - | Sonnet → Codex 모델 매핑 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | - | Opus → Codex 모델 매핑 |
| `PROXY_DEFAULT_EFFORT` | _(자동)_ | `low` / `medium` / `high` / `xhigh` |
| `PROXY_MCP_SERVERS` | _(비활성)_ | `all` 또는 `~/.claude.json` 키 이름(쉼표 구분) |

## 문제 해결

```bash
# 프록시 상태 확인
curl -fsS http://127.0.0.1:19080/health

# 포트 충돌 확인
lsof -tiTCP:19080 -sTCP:LISTEN -nP

# Passthrough 모드 테스트
gpt --model gpt-5.2

# 매핑 모드 테스트
PASSTHROUGH_MODE=false gpt --model claude-sonnet-4-20250514

# 최근 로그
tail -n 120 /tmp/chatgpt-codex-proxy.log

# Tool calling 스모크 테스트
python3 scripts/tool_calling_smoke.py --base-url http://127.0.0.1:19080 --model gpt-5.2
```

## 프로젝트 구조

```
chatgpt-codex-proxy/
├── src/
│   ├── index.ts           # 진입점
│   ├── server.ts          # Express 서버
│   ├── cli.ts             # CLI 명령
│   ├── auth.ts            # OAuth 인증
│   ├── routes/
│   │   └── messages.ts    # /v1/messages 엔드포인트
│   ├── transformers/
│   │   ├── request.ts     # Anthropic → Codex 변환
│   │   └── response.ts    # Codex → Anthropic 변환
│   ├── codex/
│   │   ├── client.ts      # Codex API 클라이언트
│   │   └── models.ts      # 모델 매핑
│   ├── mcp/
│   │   ├── config.ts      # ~/.claude.json MCP 서버 설정 읽기
│   │   ├── client.ts      # HTTP + stdio MCP 클라이언트
│   │   └── registry.ts    # 툴 스키마 캐시 (싱글턴)
│   ├── types/
│   │   └── anthropic.ts   # 타입 정의
│   └── utils/
│       └── errors.ts      # 에러 처리
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## 보안

**개인 로컬 머신에서만 사용하도록 설계**되었습니다.

```bash
npm run dev  # localhost에만 바인드됨
export ANTHROPIC_BASE_URL=http://127.0.0.1:19080
```

서버에 배포할 경우: 인증 추가, CORS 제한, 레이트 리미팅, 토큰 파일 권한 `600` 설정, 모니터링 추가가 필수입니다.

`0.0.0.0`에 바인드하지 마세요.

## 라이선스

MIT
