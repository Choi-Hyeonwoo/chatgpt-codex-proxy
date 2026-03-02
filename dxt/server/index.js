import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_BASE_URL = process.env.CODEX_PROXY_BASE_URL || "http://127.0.0.1:19080";
const DEFAULT_MODEL = process.env.CODEX_PROXY_MODEL || "gpt-5.2-codex";

function requireString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

async function callAnthropicMessages({ baseUrl, model, prompt }) {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Proxy ignores Authorization, but Claude Desktop may include one.
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Proxy error ${resp.status}: ${text}`);
  }

  return await resp.json();
}

function extractTextFromAnthropicMessage(msg) {
  const blocks = msg?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

const server = new Server(
  { name: "chatgpt-codex-proxy-tools", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "codex_chat",
        description: "Send a prompt to chatgpt-codex-proxy (/v1/messages) and return the response text.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "User prompt" },
            model: { type: "string", description: "Override model (optional)" },
            base_url: { type: "string", description: "Override base URL (optional)" },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "codex_chat") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments || {};
  const prompt = requireString(args.prompt, "prompt");
  const model = typeof args.model === "string" && args.model.trim() ? args.model.trim() : DEFAULT_MODEL;
  const baseUrl =
    typeof args.base_url === "string" && args.base_url.trim() ? args.base_url.trim() : DEFAULT_BASE_URL;

  const anthropicMsg = await callAnthropicMessages({ baseUrl, model, prompt });
  const text = extractTextFromAnthropicMessage(anthropicMsg);

  return {
    content: [{ type: "text", text: text || "(empty response)" }],
  };
});

const transport = new StdioServerTransport();
server.connect(transport);

function log(level, message, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
}

log("info", "chatgpt-codex-proxy-tools MCP server running on stdio");

process.on("uncaughtException", (err) => {
  log("error", "uncaughtException", { name: err?.name, message: err?.message, stack: err?.stack });
  process.exitCode = 1;
});

process.on("unhandledRejection", (reason) => {
  log("error", "unhandledRejection", { reason: String(reason) });
  process.exitCode = 1;
});
