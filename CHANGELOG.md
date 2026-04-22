# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is `0.y.z` (pre-1.0), breaking changes MAY occur in minor
releases. See the "Versioning" section in `README.md` for policy details.

## [Unreleased]

### Added

- `.env.example` with all referenced environment variables documented (#19).
- Log sanitizer that masks OAuth tokens, API keys, and other credential
  shapes before they reach stdout or log files (#20).
- Strict Anthropic request validation layer at the proxy entry point,
  rejecting malformed `POST /v1/messages` payloads with 400 before any
  upstream call (#23).
- Meta tests ensuring `package.json` version and `CHANGELOG.md` structure
  stay in sync (#14).

### Changed

- Unified SSE parser across the Codex client. All streaming responses now
  flow through a single parser, removing duplicated state machines (#21).
- Consolidated per-family model priority lists into a single
  `FAMILY_PRIORITIES` map, so adding a new Codex model family only touches
  one place (#22).
- `package.json` version lowered from `1.0.0` to `0.2.0` to reflect actual
  project maturity (fork baseline, pre-stable) (#14).

## [0.2.0] - 2026-04-22

Initial versioned baseline after fork from
[TBXark/chatgpt-codex-proxy](https://github.com/TBXark/chatgpt-codex-proxy).
This stanza exists so the file has at least one released version; the
substantive changes for 0.2.0 are captured in the `[Unreleased]` section
above and will be promoted into a dated 0.3.0 stanza at the next tag.

### Added

- Fork baseline imported from upstream `TBXark/chatgpt-codex-proxy`.

## Roadmap

Upcoming milestones (tracked in GitHub Issues, promoted into CHANGELOG
stanzas when tagged):

- **v0.3.0** — request validation hardening, log sanitizer rollout,
  documentation cleanup.
- **v0.4.0** — model-mapping refactors, SSE edge-case coverage.
- **v0.5.0** — first candidate for a `1.0.0` stabilization pass.

[Unreleased]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Choi-Hyeonwoo/chatgpt-codex-proxy/releases/tag/v0.2.0
