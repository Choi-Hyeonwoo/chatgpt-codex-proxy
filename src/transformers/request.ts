// src/transformers/request.ts
import { mapAnthropicModelToCodex, getEffortForModel } from "../codex/models.js";
import type {
  AnthropicRequest,
  AnthropicTool,
  AnthropicToolChoice,
  ContentBlock,
} from "../types/anthropic.js";

export interface CodexTool {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export type CodexToolChoice = "auto" | "none" | "required" | { type: "function"; name: string };

export interface CodexInputMessage {
  type: "message";
  role: "user" | "assistant";
  content: string | CodexInputContentPart[];
}

export interface CodexInputTextPart {
  type: "input_text" | "output_text";
  text: string;
}

export interface CodexInputImagePart {
  type: "input_image";
  image_url: string;
}

export type CodexInputContentPart = CodexInputTextPart | CodexInputImagePart;

export interface CodexFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface CodexFunctionCallInput {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export type CodexInputItem = CodexInputMessage | CodexFunctionCallOutput | CodexFunctionCallInput;

export interface CodexRequest {
  model: string;
  instructions: string;
  input: CodexInputItem[];
  stream: boolean;
  store: boolean;
  reasoning: { effort: string; summary: string };
  text: { verbosity: string };
  tools?: CodexTool[];
  tool_choice?: CodexToolChoice;
  parallel_tool_calls?: boolean;
}

const MUTATING_TOOL_NAME_PATTERNS = [
  /(^|[_-])edit($|[_-])/i,
  /(^|[_-])update($|[_-])/i,
  /(^|[_-])write($|[_-])/i,
  /(^|[_-])replace($|[_-])/i,
  /(^|[_-])delete($|[_-])/i,
  /(^|[_-])create($|[_-])/i,
  /(^|[_-])insert($|[_-])/i,
  /(^|[_-])move($|[_-])/i,
  /(^|[_-])rename($|[_-])/i,
];

// Tool priority for Codex compatibility
const TOOL_PRIORITY: Record<string, number> = {
  // Tier 1: Core execution tools
  Agent: 1,
  Bash: 1,
  Read: 1,
  Edit: 1,
  Write: 1,
  Glob: 1,
  Grep: 1,
  WebSearch: 1,
  WebFetch: 1,
  // Tier 2: Planning & task management
  ExitPlanMode: 2,
  EnterPlanMode: 2,
  Skill: 2,
  TaskCreate: 2,
  TaskUpdate: 2,
  TaskList: 2,
  AskUserQuestion: 2,
  // Tier 3: Supporting tools
  TaskOutput: 3,
  TaskStop: 3,
  TaskGet: 3,
  EnterWorktree: 3,
  NotebookEdit: 3,
  SendMessage: 3,
};

function isMutatingToolName(name: string): boolean {
  return MUTATING_TOOL_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function filterToolsByPriority(tools: CodexTool[], maxCount: number): CodexTool[] {
  // Sort by priority (lower number = higher priority)
  const sorted = [...tools].sort((a, b) => {
    const priorityA = TOOL_PRIORITY[a.name] ?? 999;
    const priorityB = TOOL_PRIORITY[b.name] ?? 999;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return tools.indexOf(a) - tools.indexOf(b); // maintain original order for same priority
  });

  return sorted.slice(0, maxCount);
}

function shouldDisableParallelToolCalls(anthropic: AnthropicRequest): boolean {
  if (!anthropic.parallel_tool_calls) return false;

  const mutatingTools = (anthropic.tools ?? []).filter((tool) => isMutatingToolName(tool.name));
  if (mutatingTools.length > 0) return true;

  if (anthropic.tool_choice?.type === "tool") {
    return isMutatingToolName(anthropic.tool_choice.name);
  }

  return false;
}

function flattenContent(content: string | ContentBlock[] | undefined): string {
  if (!content) return "";

  if (typeof content === "string") return content;

  return content
    .map((block) => {
      if (block.type === "text" && block.text) return block.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function serializeUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToolParameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const normalized: Record<string, unknown> = isPlainObject(schema) ? { ...schema } : {};

  if (typeof normalized.type !== "string") {
    normalized.type = "object";
  }

  if (normalized.type === "object") {
    if (!isPlainObject(normalized.properties)) {
      normalized.properties = {};
    }
    if (!Array.isArray(normalized.required)) {
      delete normalized.required;
    }
    if (typeof normalized.additionalProperties === "undefined") {
      normalized.additionalProperties = true;
    }
  }

  return normalized;
}

function mapAnthropicToolToCodexTool(tool: AnthropicTool): CodexTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: normalizeToolParameters(tool.input_schema),
  };
}

function mapToolChoice(choice: AnthropicToolChoice | undefined, hasTools: boolean): CodexToolChoice | undefined {
  if (!choice) {
    // If no tool_choice is specified but we have tools, default to "auto"
    return hasTools ? "auto" : undefined;
  }
  if (choice.type === "auto") return "auto";
  if (choice.type === "none") return "none";
  if (choice.type === "any") return "required";
  if (choice.type === "tool") return { type: "function", name: choice.name };
  return "auto";
}

function contentToInputItems(role: "user" | "assistant", content: string | ContentBlock[]): CodexInputItem[] {
  const textPartType: CodexInputTextPart["type"] = role === "assistant" ? "output_text" : "input_text";

  if (typeof content === "string") {
    const text = content.trim();
    return text.length > 0 ? [{ type: "message", role, content: [{ type: textPartType, text }] }] : [];
  }

  const items: CodexInputItem[] = [];
  const blocks: ContentBlock[] = content;
  const messageParts: CodexInputContentPart[] = [];

  const flushMessageParts = () => {
    if (messageParts.length === 0) return;
    items.push({
      type: "message",
      role,
      content: [...messageParts],
    });
    messageParts.length = 0;
  };

  for (const block of blocks) {
    if (block.type === "text") {
      const text = block.text?.trim();
      if (!text) continue;
      messageParts.push({ type: textPartType, text });
      continue;
    }

    if (block.type === "tool_result") {
      flushMessageParts();
      const output =
        typeof block.content === "undefined"
          ? block.is_error
            ? "Tool execution failed"
            : ""
          : typeof block.content === "string"
            ? block.content
            : flattenContent(block.content);
      items.push({
        type: "function_call_output",
        call_id: block.tool_use_id,
        output,
      });
      continue;
    }

    if (block.type === "tool_use") {
      flushMessageParts();
      items.push({
        type: "function_call",
        call_id: block.id,
        name: block.name,
        arguments: serializeUnknown(block.input ?? {}),
      });
      continue;
    }

    if (block.type === "image") {
      const mediaType = block.source?.media_type?.trim();
      const base64Data = block.source?.data?.trim();
      if (mediaType && base64Data) {
        messageParts.push({
          type: "input_image",
          image_url: `data:${mediaType};base64,${base64Data}`,
        });
      }
    }
  }

  flushMessageParts();

  return items;
}

function extractSystemPrompt(system: string | ContentBlock[] | undefined): string {
  if (!system) return "";
  if (typeof system === "string") return system;

  return system
    .map((block) => {
      if (block.type === "text" && block.text) return block.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function transformAnthropicToCodex(anthropic: AnthropicRequest): CodexRequest {
  const codexModel = mapAnthropicModelToCodex(anthropic.model);
  const effort = getEffortForModel(codexModel);

  const systemInstruction = extractSystemPrompt(anthropic.system);

  // Filter messages if too many (Codex compatibility)
  let messages = anthropic.messages ?? [];
  if (messages.length > 50) {
    messages = messages.slice(-20); // Keep only last 20 messages
  }

  const input: CodexInputItem[] = [];
  for (const msg of messages) {
    input.push(...contentToInputItems(msg.role, msg.content));
  }

  let tools = anthropic.tools?.map(mapAnthropicToolToCodexTool);

  // Codex compatibility: filter tools by priority if too many
  if (tools && tools.length > 50) {
    tools = filterToolsByPriority(tools, 30);
  }

  const hasTools = !!(tools && tools.length > 0);
  const toolChoice = mapToolChoice(anthropic.tool_choice, hasTools);

  const disableParallelToolCalls = shouldDisableParallelToolCalls(anthropic);
  const parallelToolCalls = disableParallelToolCalls ? undefined : anthropic.parallel_tool_calls;

  return {
    model: codexModel,
    instructions: systemInstruction,
    input,
    stream: Boolean(anthropic.stream),
    store: false,
    reasoning: { effort, summary: "auto" },
    text: { verbosity: "medium" },
    tools: hasTools ? tools : undefined,
    tool_choice: toolChoice,
    parallel_tool_calls: parallelToolCalls,
  };
}
