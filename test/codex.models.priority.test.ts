/*
[파일 목적]
FAMILY_PRIORITIES 통합 리팩터(#7) 후 모델 우선순위 선택/매핑 동작 검증.
*/
import test from "node:test";
import assert from "node:assert/strict";

import {
    FAMILY_PRIORITIES,
    SUPPORTED_CODEX_MODELS,
    mapAnthropicModelToCodex,
    setRuntimeModelAvailability,
    selectRuntimeDefaultModel,
    envOverrideForFamily,
} from "../src/codex/models.js";

function resetRuntimeGate() {
    setRuntimeModelAvailability([]);
}

function withEnv<T>(
    overrides: Record<string, string | undefined>,
    fn: () => T,
): T {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(overrides)) {
        saved[k] = process.env[k];
        const v = overrides[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return fn();
    } finally {
        for (const k of Object.keys(saved)) {
            const v = saved[k];
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

test("maps claude-opus-4-7 to a supported codex model", () => {
    resetRuntimeGate();
    const mapped = withEnv(
        { PASSTHROUGH_MODE: "0" },
        () => mapAnthropicModelToCodex("claude-opus-4-7"),
    );
    assert.ok(
        SUPPORTED_CODEX_MODELS.has(mapped),
        `mapped=${mapped} should be in SUPPORTED_CODEX_MODELS`,
    );
});

test("maps claude-sonnet-4-7 to a supported codex model", () => {
    resetRuntimeGate();
    const mapped = withEnv(
        { PASSTHROUGH_MODE: "0" },
        () => mapAnthropicModelToCodex("claude-sonnet-4-7"),
    );
    assert.ok(
        SUPPORTED_CODEX_MODELS.has(mapped),
        `mapped=${mapped} should be in SUPPORTED_CODEX_MODELS`,
    );
});

test("maps claude-haiku-4-5 to a supported codex model", () => {
    resetRuntimeGate();
    const mapped = withEnv(
        { PASSTHROUGH_MODE: "0" },
        () => mapAnthropicModelToCodex("claude-haiku-4-5"),
    );
    assert.ok(
        SUPPORTED_CODEX_MODELS.has(mapped),
        `mapped=${mapped} should be in SUPPORTED_CODEX_MODELS`,
    );
});

test("passthrough mode returns input when supported", () => {
    resetRuntimeGate();
    const mapped = withEnv({ PASSTHROUGH_MODE: "1" }, () =>
        mapAnthropicModelToCodex("gpt-5.4-codex-high"),
    );
    assert.equal(mapped, "gpt-5.4-codex-high");
});

test("setRuntimeModelAvailability narrows default to first available in priority", () => {
    // default priority: ["gpt-5.4","gpt-5.2-codex","gpt-5.3-codex","gpt-5.1-codex"]
    // pass=['gpt-5.3-codex','gpt-5.4'] → 첫 매치는 'gpt-5.4'
    setRuntimeModelAvailability(["gpt-5.3-codex", "gpt-5.4"]);
    try {
        assert.equal(selectRuntimeDefaultModel(), "gpt-5.4");
    } finally {
        resetRuntimeGate();
    }
});

test("envOverrideForFamily ignores stale 5.3 default when mapped is 5.4", () => {
    // runtime 에 5.3-codex 만 없고 5.4 는 있는 상황에서
    // ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-5.3-codex 는 무시되어야 함
    setRuntimeModelAvailability(["gpt-5.4", "gpt-5.2-codex"]);
    try {
        const override = withEnv(
            { ANTHROPIC_DEFAULT_SONNET_MODEL: "gpt-5.3-codex" },
            () => envOverrideForFamily("sonnet"),
        );
        assert.equal(
            override,
            undefined,
            "stale env override should be dropped",
        );
    } finally {
        resetRuntimeGate();
    }
});

test("FAMILY_PRIORITIES.opus contains xhigh as a preferred fallback", () => {
    const hasXhigh = FAMILY_PRIORITIES.opus.some((m) =>
        m.includes("-xhigh"),
    );
    assert.ok(
        hasXhigh,
        `FAMILY_PRIORITIES.opus should include an xhigh tier model. got=${JSON.stringify(FAMILY_PRIORITIES.opus)}`,
    );
    const hasXhighSonnet = FAMILY_PRIORITIES.sonnet.some((m) =>
        m.includes("-xhigh"),
    );
    assert.ok(
        hasXhighSonnet,
        `FAMILY_PRIORITIES.sonnet should also include an xhigh tier model (#7 missing-xhigh fix). got=${JSON.stringify(FAMILY_PRIORITIES.sonnet)}`,
    );
});
