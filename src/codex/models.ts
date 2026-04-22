/**
 * [파일 목적]
 * 이 파일은 Anthropic 계열 모델명을 내부 Codex 모델명으로 매핑하고,
 * 모델별 reasoning effort 값을 결정하는 규칙을 제공한다.
 *
 * [주요 흐름]
 * 1. 입력 모델명을 family(haiku/sonnet/opus) 또는 명시적 Codex 모델로 분류한다.
 * 2. 환경변수 override가 있으면 우선 적용한다.
 * 3. 없으면 하드코딩된 기본 매핑 또는 family priority로 Codex 모델을 선택한다.
 * 4. 최종 모델에 맞는 effort를 반환한다.
 *
 * [외부 연결]
 * - transformers/request.ts: 요청 변환 시 모델/effort 결정에 사용
 *
 * [수정시 주의]
 * - 매핑 규칙이 바뀌면 동일한 Anthropic 요청도 다른 Codex 모델로 호출된다.
 * - PASSTHROUGH_MODE 기본값을 바꾸면 운영 동작이 크게 달라질 수 있다.
 * - FAMILY_PRIORITIES는 family별 fallback 순위를 단일 소스로 관리한다.
 *   sonnet 리스트에 xhigh가 포함되도록 유지해야 한다(이슈 #7).
 */

export type ModelFamily = "haiku" | "sonnet" | "opus";

/**
 * [FAMILY_PRIORITIES]
 * family별 우선순위 리스트. 첫 번째 항목이 가장 선호되는 모델이다.
 * 이전의 OPUS/SONNET/HAIKU/DEFAULT/MODEL_PRIORITY 개별 배열을 단일 객체로 통합했다(#7).
 * - sonnet 리스트에 xhigh(고추론) 변종이 포함되어야 한다.
 * - default는 family 미식별 시 fallback 용도.
 */
export const FAMILY_PRIORITIES = {
    default: [
        "gpt-5.4",
        "gpt-5.2-codex",
        "gpt-5.3-codex",
        "gpt-5.1-codex",
    ],
    opus: [
        "gpt-5.3-codex-xhigh",
        "gpt-5.2-codex-xhigh",
        "gpt-5.1-codex-max",
        "gpt-5.4",
        "gpt-5.3-codex",
        "gpt-5.2-codex",
    ],
    sonnet: [
        "gpt-5.3-codex-xhigh",
        "gpt-5.2-codex-xhigh",
        "gpt-5.2-codex",
        "gpt-5.3-codex",
        "gpt-5.4",
        "gpt-5.1-codex",
    ],
    haiku: [
        "gpt-5.3-codex-spark",
        "gpt-5.3-codex-low",
        "gpt-5.2-codex-low",
        "gpt-5-codex-mini",
        "gpt-5.1-codex-mini",
    ],
} as const satisfies Record<"default" | ModelFamily, readonly string[]>;

/**
 * @deprecated FAMILY_PRIORITIES.default 사용 권장. 하위호환 위해 재익스포트.
 */
export const MODEL_PRIORITY = FAMILY_PRIORITIES.default;

/** @deprecated FAMILY_PRIORITIES.default 사용 권장. 하위호환 재익스포트. */
export const DEFAULT_MODEL_PRIORITY = FAMILY_PRIORITIES.default;
/** @deprecated FAMILY_PRIORITIES.opus 사용 권장. 하위호환 재익스포트. */
export const OPUS_MODEL_PRIORITY = FAMILY_PRIORITIES.opus;
/** @deprecated FAMILY_PRIORITIES.sonnet 사용 권장. 하위호환 재익스포트. */
export const SONNET_MODEL_PRIORITY = FAMILY_PRIORITIES.sonnet;
/** @deprecated FAMILY_PRIORITIES.haiku 사용 권장. 하위호환 재익스포트. */
export const HAIKU_MODEL_PRIORITY = FAMILY_PRIORITIES.haiku;

function getEnvModelForFamily(family: ModelFamily): string | undefined {
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

export const SUPPORTED_CODEX_MODELS = new Set<string>([
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

/**
 * 주어진 모델명을 family 로 분류한다. 미식별 시 null.
 */
export function getFamilyFor(model: string): ModelFamily | null {
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

/** @deprecated getFamilyFor 사용 권장. 기존 이름 하위호환. */
export const getModelFamily = getFamilyFor;

/**
 * Runtime에서 사용 가능한 것으로 보고된 Codex 모델 집합.
 * 비어있으면 runtime gating 미적용 (모든 SUPPORTED_CODEX_MODELS 허용).
 */
const runtimeAvailability: Set<string> = new Set();

/**
 * Runtime probe 결과를 기록한다. 전달된 집합이 비어있지 않으면
 * 이후 family priority 선택 시 이 집합 내 모델만 후보가 된다.
 */
export function setRuntimeModelAvailability(models: Iterable<string>): void {
    runtimeAvailability.clear();
    for (const m of models) {
        if (typeof m === "string" && m.trim()) {
            runtimeAvailability.add(m.trim());
        }
    }
}

function isRuntimeGated(): boolean {
    return runtimeAvailability.size > 0;
}

function isRuntimeAvailable(model: string): boolean {
    if (!isRuntimeGated()) return true;
    return runtimeAvailability.has(model);
}

/**
 * priority 배열에서 runtime 에 사용 가능한 첫 번째 모델 반환.
 * runtime gating 미적용 시 첫 번째 항목 그대로.
 */
export function firstRuntimeAvailable(
    priority: readonly string[],
): string | undefined {
    for (const m of priority) {
        if (isRuntimeAvailable(m)) return m;
    }
    return undefined;
}

/**
 * family 에 대한 priority 기반 선택. 없으면 undefined.
 */
function pickFromFamily(family: ModelFamily | null): string | undefined {
    const list = family ? FAMILY_PRIORITIES[family] : FAMILY_PRIORITIES.default;
    return firstRuntimeAvailable(list);
}

/**
 * Runtime priority 기준으로 현재 default 모델을 선택한다.
 */
export function selectRuntimeDefaultModel(): string {
    return firstRuntimeAvailable(FAMILY_PRIORITIES.default) ?? DEFAULT_CODEX_MODEL;
}

export function runtimeDefaultOpus(): string {
    return firstRuntimeAvailable(FAMILY_PRIORITIES.opus) ?? DEFAULT_CODEX_MODEL;
}

export function runtimeDefaultSonnet(): string {
    return firstRuntimeAvailable(FAMILY_PRIORITIES.sonnet) ?? DEFAULT_CODEX_MODEL;
}

export function runtimeDefaultHaiku(): string {
    return firstRuntimeAvailable(FAMILY_PRIORITIES.haiku) ?? DEFAULT_CODEX_MODEL;
}

/**
 * family 에 대한 환경변수 override 유효성 검사 후 반환.
 * runtime gating 이 있을 경우 실제로 사용 가능한 모델에 한해 반영.
 * 유효하지 않으면 undefined.
 */
export function envOverrideForFamily(family: ModelFamily): string | undefined {
    const envModel = getEnvModelForFamily(family);
    if (!envModel) return undefined;
    if (!SUPPORTED_CODEX_MODELS.has(envModel)) return undefined;
    if (isRuntimeGated() && !isRuntimeAvailable(envModel)) return undefined;
    return envModel;
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
        : getFamilyFor(normalizedModel);

    // 1) env override (가장 우선)
    const envSelected = family ? envOverrideForFamily(family) : undefined;

    // 2) hardcoded exact match (explicit codex 이름 포함)
    const hardMapped = isExplicitCodexModel
        ? normalizedModel
        : HARDCODED_MAPPING[normalizedModel];

    // 3) family priority (FAMILY_PRIORITIES 기반 runtime-aware)
    const familyPick = pickFromFamily(family);

    // 4) 최종 fallback
    const finalModel =
        envSelected ?? hardMapped ?? familyPick ?? DEFAULT_CODEX_MODEL;

    console.log(
        `[chatgpt-codex-proxy] model_map anthropic=${normalizedModel} family=${family ?? "unknown"} selected=${
            envSelected ?? "-"
        } mapped=${hardMapped ?? "-"} final=${finalModel}`,
    );

    return finalModel;
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
