# Changelog

All notable changes to Z Reader are documented in this file.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Official releases
use annotated Git tags in the form `vMAJOR.MINOR.PATCH`.

## [Unreleased]

## [0.1.1] - 2026-10-18

### Fixed

- Android background speech now reuses a single audio element and replaces its
  source directly, preserving media-session continuity between speech chunks.
- Natural completion, external pauses, explicit pause/stop, and stale synthesis
  responses are handled separately. Recovery checks actual media state and keeps
  the current audio position when possible.
- Speech uses a short initial chunk and longer subsequent chunks with a duration
  based lookahead buffer. Detached chapter text and CFI locations allow background
  continuation without waiting for renderer navigation or layout.
- Lock-screen play resumes idempotently; updating highlights no longer clears or
  repeatedly registers system media controls. Released screen wake locks can be
  acquired again.
- Speech sessions persist the spoken CFI, including in the background. Permission
  failures retain the current content instead of skipping sentences.
- Service-worker cache refreshes the matching Foliate and frontend APIs on upgrade.

### Security

- Update Next.js, image-processing, and affected frontend tooling dependencies to
  patched versions identified by the repository's dependency alerts.
- Update sharp to 0.35.5 and x/net to 0.60.0 to address the image-decoding and
  HTTP/2 vulnerabilities caught by release CI. Build the backend with Go 1.26.9.

### Added

- Opt-in local speech diagnostics and regression tests for background continuation,
  real browser audio decoding, detached chapters, pause/resume, and cancellation.
- Opt-in pprof endpoints on a separate, protected diagnostics listener; disabled by
  default. Existing `/healthz` and `/readyz` routes are unchanged.

### Upgrade notes and limitations

- No database migration or new TTS credentials are required. Keep persistent data
  volumes and reopen/refresh an existing reader after upgrading.
- From-source builds now require Go 1.26.9 or later; the Docker image includes the
  updated backend and needs no host Go installation.
- Android process termination and vendor battery restrictions can still interrupt
  web audio. Word highlighting uses estimated timing within a speech chunk.
- See [mobile background reading](docs/tts-background-playback.md) for diagnostics,
  device acceptance checks, and rollback guidance.

## [0.1.0] - 2026-07-27

First official release for personal and household self-hosting. This tag freezes the
quality baseline built on `main`: reading core, multi-user library, verified backups,
observability assets, and CI gates.

### Added

- Multi-user online reader for EPUB, MOBI, AZW3, and PDF with shelf management,
  categories, progress sync, optional offline book copies, and optional TTS.
- Open registration with per-user libraries and token/session authentication.
- Verified backup create / verify / restore tooling, automated backup loop, and CI
  coverage of the backup → restore → `/readyz` path.
- Low-cardinality Prometheus metrics (`METRICS_ENABLED`), example Grafana dashboard,
  and alert rules for errors, operation latency, TTS queue, backups, and rate limits.
- Container startup smoke test (health, readiness, volume retention) and deployment /
  upgrade / restore runbook with a monthly recovery-drill log.
- Backend library benchmarks (1k / 10k books), HTTP core load test command, and
  documented performance baselines.
- Frontend first-screen JS budget gate, Web Vitals/CLS regression checks, and offline
  shell budget documentation.
- Architecture notes, ADRs, verified support matrix, release checklist, coverage
  baselines, CodeQL, Dependabot, and PR quality gates (unit, E2E, visual, Docker).
- Contributor entry points for `good first issue` and `help wanted`.

### Fixed

- Reader authentication loading visual baseline targets a stable accessible status.
- Security and toolchain dependency hardening for Go, frontend, and vendored assets.
- Reader accessibility and mobile action panel refinements across toolbar, TOC, and TTS.

### Upgrade notes

- Pull or deploy image tag `v0.1.0` / `0.1.0` (or `ghcr.io/zuoban/z-reader:0.1.0`).
- Keep persistent `data/` and `uploads/` volumes across upgrades; do not use
  `docker compose down -v` on production data.
- Before upgrading a live instance: verify the latest backup
  (`go run ./cmd/verify-backup --dir <backup>`), then rebuild/restart Compose.
- Metrics are off by default. Set `METRICS_ENABLED=true` only on a trusted private
  network; do not expose `/metrics` publicly.
- TTS still requires your own speech service configuration; the image does not ship
  third-party credentials.
- Minimum toolchain for from-source builds: Go 1.25+, Node.js 20+.

### Known limitations

- Scope is personal / household self-hosting, not multi-tenant SaaS.
- The seed recovery-drill log entry covers CLI verify+restore; operators should still
  complete a monthly drill that includes `/readyz` and a login check.
- Upload and TTS load-test scenarios are optional and intended for isolated environments only.
- Production Web Vitals baselines are documented for manual capture; CI uses a
  catastrophic LCP ceiling on the dev server plus hard first-screen JS budgets.

[Unreleased]: https://github.com/zuoban/z-reader/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/zuoban/z-reader/releases/tag/v0.1.1
[0.1.0]: https://github.com/zuoban/z-reader/releases/tag/v0.1.0
