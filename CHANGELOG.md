# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is `0.y.z` (pre-1.0), breaking changes MAY occur in minor
releases. See the "Versioning" section in `README.md` for policy details.

## [Unreleased]

## [0.5.0] - 2026-04-23

### Added
- In-memory token refresh cache with concurrent dedup — 5-minute pre-refresh buffer, shared refresh promise prevents N concurrent OAuth refreshes. (#8, PR #33)
- Supporting tests: 5 unit cases (fresh cache, buffer expiry, 100-parallel dedup, failure reset, hard expiry).

### Changed
- `src/auth/oauth.ts` `getValidTokens` routed through the token cache layer.

### Notes
- This milestone closes the v0.5.0 DX & CI scope. Earlier DX items (README translation, env drift check, CHANGELOG policy, GitHub Actions test workflow) landed in v0.3.0.

## [0.4.0] - 2026-04-22

### Added
- SSE streaming backpressure with AbortController support (#10, PR #30)
- Expanded test suite: +15 assertions covering request validation, error mapping, health probe, streaming, and utils (#11, PR #32)
- New test files: `validate.test.ts`, `messages.stream.test.ts`, `routes.health.test.ts`, `utils.errors.test.ts`, `messages.stream-backpressure.test.ts`

### Changed
- `src/auth.ts` split into `src/auth/jwt.ts`, `src/auth/token-storage.ts`, `src/auth/oauth.ts` — original file kept as barrel re-export for full backward compatibility (#5, PR #31)
- SSE writes use drain-aware `writeEvent()` helper; client disconnects propagate via `AbortController` to cancel in-flight requests

### Deferred
- #8 token refresh in-memory cache with concurrent dedup — shipped in v0.5.0

## [0.3.0] - 2026-04-22

Combined v0.3.0 (Security & Observability) and v0.5.0 (DX & CI) milestones,
released together because they matured in parallel and have no breaking API.

### Added
- `.env.example` at repo root enumerating every referenced
  `process.env.X` key (#19).
- Log sanitizer utility that masks Bearer tokens, JWTs, OAuth URL
  parameters, `chatgpt-account-id`, and refresh/access tokens before any
  log sink receives them (#20).
- LOG_LEVEL-aware logger (`error|warn|info|debug`) with automatic
  sanitizer chaining and scope prefixing; all prior `console.*` call
  sites routed through it (#28).
- Strict Anthropic request validation at the proxy entry point, rejecting
  malformed `POST /v1/messages` payloads with HTTP 400 before any upstream
  call (#23).
- GitHub Actions CI workflow with two jobs: `test` (Node 20, `npm ci`,
  `npm run build`, `npm test`) and `env-example-sync` (fails if a new
  `process.env.X` is added without updating `.env.example`) (#24).
- English `README.md` with Quickstart, Configuration, Usage examples,
  Troubleshooting (4 scenarios), and Contributing sections; Korean
  original preserved as `README.ko.md` with a language toggle at the top
  of both files (#27).
- `CHANGELOG.md` (this file) and a formal "Versioning" section in
  `README.md` documenting the semver policy for a 0.y.z project (#14).
- Meta tests ensuring `package.json` version and `CHANGELOG.md` structure
  stay in sync at CI time (#14).

### Changed
- Unified SSE parser across the Codex client — all streaming responses
  now flow through a single parser, removing duplicated state machines
  and making the streaming path easier to audit (#21).
- Consolidated per-family model priority lists into a single
  `FAMILY_PRIORITIES` map, so adding a new Codex model family only touches
  one place (#22).
- `package.json` version bumped from `0.2.0` to `0.3.0`.

### Fixed
- SSE `outputTextParts` array was accumulating across responses;
  it is now cleared after `finalResponse` and in the `finally` branch of
  the streaming reader, bounding memory for long interactions (#25).

### Refactored
- Extracted a `buildTokenData` helper in `src/auth.ts`; both
  `exchangeCodeForTokens` and `refreshAccessToken` now go through it,
  with identical external behaviour (#29).

## [0.2.0] - 2026-04-22

Initial versioned baseline after fork from
[TBXark/chatgpt-codex-proxy](https://github.com/TBXark/chatgpt-codex-proxy).
This stanza exists so the file has at least one released version; the
substantive changes for 0.2.0 are captured in the `[0.3.0]` section above.

### Added
- Fork baseline imported from upstream `TBXark/chatgpt-codex-proxy`.

[Unreleased]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/releases/tag/v0.3.0
[0.2.0]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/releases/tag/v0.2.0
