/**
 * [파일 목적]
 * 이 파일은 Anthropic 계열 모델명을 내부 Codex 모델명으로 매핑하고,
 * 모델별 reasoning effort 값을 결정하는 규칙을 제공한다.
 *
 * [주요 흐름]
 * 1. 입력 모델명을 family(haiku/sonnet/opus) 또는 명시적 Codex 모델로 분류한다.
 * 2. 환경변수 override가 있으면 우선 적용한다.
 * 3. 없으면 하드코딩된 기본 매핑으로 Codex 모델을 선택한다.
 * 4. 최종 모델에 맞는 effort를 반환한다.
 *
 * [외부 연결]
 * - transformers/request.ts: 요청 변환 시 모델/effort 결정에 사용
 *
 * [수정시 주의]
 * - 매핑 규칙이 바뀌면 동일한 Anthropic 요청도 다른 Codex 모델로 호출된다.
 * - PASSTHROUGH_MODE 기본값을 바꾸면 운영 동작이 크게 달라질 수 있다.
 */

function getEnvModelForFamily(
    family: "haiku" | "sonnet" | "opus",
): string | undefined {
    const value =
        family === "haiku"
            ? process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
            : family === "sonnet"
              ? process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
              : process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;

    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

const HARDCODED_MAPPING: Record<string, string> = {
    "claude-sonnet-4-20250514": "gpt-5.2-codex",
    "claude-3-5-sonnet-20241022": "gpt-5.2-codex",
    "claude-3-haiku-20240307": "gpt-5.3-codex-spark",
    "claude-3-opus-20240229": "gpt-5.3-codex-xhigh",
    "gpt-5.1": "gpt-5.1-codex",
    "gpt-5.2": "gpt-5.2-codex",
    "gpt-5.3": "gpt-5.3-codex",
    "gpt-5.4": "gpt-5.4",
};

const SUPPORTED_CODEX_MODELS = new Set<string>([
    // gpt-5.4 / gpt-5 계열 (2025~2026 최신, Responses API)
    "gpt-5.4",
    "gpt-5",
    "gpt-5-codex",
    "gpt-5-codex-mini",
    // gpt-5.3 계열
    "gpt-5.3-codex",
    "gpt-5.3-codex-spark",
    "gpt-5.3-codex-medium",
    "gpt-5.3-codex-low",
    "gpt-5.3-codex-xhigh",
    // gpt-5.2 계열
    "gpt-5.2-codex",
    "gpt-5.2-codex-medium",
    "gpt-5.2-codex-low",
    "gpt-5.2-codex-xhigh",
    // gpt-5.1 계열
    "gpt-5.1-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
]);

function getModelFamily(model: string): "haiku" | "sonnet" | "opus" | null {
    const m = model.toLowerCase();
    if (m.includes("haiku")) return "haiku";
    if (m.includes("opus")) return "opus";
    if (m.includes("sonnet")) return "sonnet";
    if (
        m.startsWith("gpt-5.1") ||
        m.startsWith("gpt-5.2") ||
        m.startsWith("gpt-5.3")
    )
        return "sonnet";
    return null;
}

export const DEFAULT_CODEX_MODEL = "gpt-5.2-codex";

function isPassthroughModeEnabled(): boolean {
    const raw = process.env.PASSTHROUGH_MODE?.trim().toLowerCase();
    if (!raw) return true;
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off")
        return false;
    return true;
}

export function mapAnthropicModelToCodex(anthropicModel: string): string {
    const normalizedModel = anthropicModel.trim();

    if (isPassthroughModeEnabled()) {
        const passthroughModel = normalizedModel || DEFAULT_CODEX_MODEL;
        console.log(
            `[chatgpt-codex-proxy] model_map anthropic=${normalizedModel || "-"} family=passthrough selected=- mapped=${passthroughModel} final=${passthroughModel}`,
        );
        return passthroughModel;
    }

    const isExplicitCodexModel = SUPPORTED_CODEX_MODELS.has(normalizedModel);
    const family = isExplicitCodexModel
        ? null
        : getModelFamily(normalizedModel);
    const selectedModel = family ? getEnvModelForFamily(family) : undefined;
    const mappedModel = isExplicitCodexModel
        ? normalizedModel
        : (HARDCODED_MAPPING[normalizedModel] ?? DEFAULT_CODEX_MODEL);
    const finalModel = selectedModel ?? mappedModel;
    const validatedModel =
        selectedModel && !SUPPORTED_CODEX_MODELS.has(selectedModel)
            ? mappedModel
            : finalModel;

    console.log(
        `[chatgpt-codex-proxy] model_map anthropic=${normalizedModel} family=${family ?? "unknown"} selected=${
            selectedModel ?? "-"
        } mapped=${mappedModel} final=${validatedModel}`,
    );

    return validatedModel;
}

export const CODEX_MODEL_EFFORT: Record<string, string> = {
    // gpt-5.4 / gpt-5 계열 (최신)
    "gpt-5.4": "high",
    "gpt-5": "high",
    "gpt-5-codex": "high",
    "gpt-5-codex-mini": "medium",
    // gpt-5.3 계열
    "gpt-5.3-codex": "high",
    "gpt-5.3-codex-spark": "low",
    "gpt-5.3-codex-medium": "medium",
    "gpt-5.3-codex-low": "low",
    "gpt-5.3-codex-xhigh": "xhigh",
    // gpt-5.2 계열
    "gpt-5.2-codex": "high",
    "gpt-5.2-codex-medium": "medium",
    "gpt-5.2-codex-low": "low",
    "gpt-5.2-codex-xhigh": "xhigh",
    // gpt-5.1 계열
    "gpt-5.1-codex": "high",
    "gpt-5.1-codex-max": "xhigh",
    "gpt-5.1-codex-mini": "medium",
};

/*
[목적]
최종 Codex 모델명으로 reasoning effort 값을 결정한다.
Claude의 thinking.budget_tokens와 Codex의 effort는 별개 개념이므로 변환하지 않는다.

[입력]
- codexModel: mapAnthropicModelToCodex가 반환한 최종 모델명

[출력]
- effort 문자열: "low" | "medium" | "high" | "xhigh"

[우선순위]
1. PROXY_DEFAULT_EFFORT 환경변수 (설정 시 강제 적용)
2. CODEX_MODEL_EFFORT 테이블 (등록된 모델의 고정 매핑)
3. 모델명 suffix 파싱 (-xhigh / -high / -medium / -spark / -low)
4. 기본값 "medium"

[수정시 영향]
- effort가 바뀌면 Codex 추론 깊이/속도/비용이 달라진다
*/
export function getEffortForModel(codexModel: string): string {
    // 1. 환경변수 강제 적용 (설정 시 최우선)
    const envEffort = process.env.PROXY_DEFAULT_EFFORT?.trim().toLowerCase();
    if (envEffort && ["low", "medium", "high", "xhigh"].includes(envEffort)) {
        return envEffort;
    }

    // 2. 등록된 모델 테이블
    const tableEffort = CODEX_MODEL_EFFORT[codexModel];
    if (tableEffort) return tableEffort;

    // 3. 모델명 suffix에서 effort 추출 (passthrough 모드 커스텀 모델 대응)
    const m = codexModel.toLowerCase();
    if (m.includes("-xhigh")) return "xhigh";
    if (m.includes("-high")) return "high";
    if (m.includes("-medium")) return "medium";
    if (m.includes("-spark") || m.includes("-low")) return "low";

    return "medium";
}
