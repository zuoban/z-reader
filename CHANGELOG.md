# Changelog

All notable changes to Z Reader are documented in this file.

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Official releases
use annotated Git tags in the form `vMAJOR.MINOR.PATCH`.

## [Unreleased]

## [0.1.4] - 2026-10-19

### Changed

- Unify the landing page, login, library, and reader controls around a modern
  study theme with paper-white surfaces, forest-green accents, and clearer type.
- Refine light and dark palettes, responsive layouts, shared library previews,
  and interaction states for reading on phones, tablets, and desktops.
- Refresh all 23 Linux and macOS visual baselines and extend responsive layout
  coverage for mixed book-title lengths and lazy-loaded reader controls.
- Match Linux snapshot generation to the pinned Ubuntu 24.04 amd64 CI runner.

### Fixed

- Keep book cards in the same shelf row equal in height, with aligned reading
  progress and footer actions while preserving cover proportions.
- Align all seven reader action-menu icons and labels before and after the
  read-aloud controls load, using consistent icon sizes and row heights.
- Keep the reader toolbar clear of the reading surface and preserve the initial
  shelf scroll position and browser theme colors.

### Upgrade notes and limitations

- No database migration or new configuration is required. Preserve the existing
  data and uploads volumes, and reload open pages to receive the refreshed UI.
- A real-book reload in the local development in-app browser encountered a
  reading-position initialization timeout. Automated reader tests pass; the cause
  of that browser-specific observation remains unconfirmed.
- Existing mobile background-audio limitations remain unchanged. This UI release
  does not modify the backend, speech pipeline, or vendored reader engine.
- For rollback, deploy v0.1.3 with the same persistent volumes. Follow the
  [operations runbook](docs/operations-runbook.md) if backup restoration is needed.

## [0.1.3] - 2026-10-19

### Changed

- Speed up large libraries with category indexes, adaptive search, batched status
  refreshes, and resumable background backfill of missing content hashes.
- Share resumable book downloads, bound cache writes, load ZIP worker assets on
  demand, and defer reader controls to reduce startup work.
- Improve mobile search, sorting, category management, and batch actions. Keep
  compact reader controls below 1024px and simplify book cards with a working
  reading button.
- Bundle a distinct Chinese calligraphic reading font, share font faces with EPUB
  chapters, and show the selected font size in a compact, collapsible preview.
- Split shared styles by responsibility and expand responsive, visual, and
  production-performance regression coverage.

### Fixed

- Limit status queries to 100 book IDs per request so real UUIDs do not exceed
  HTTP request limits and leave processing-state refreshes stuck on HTTP 431.
- Move keyboard focus into the reader action menu immediately and consume Escape
  when closing it, preventing an unintended return to the shelf.

### Security

- Update the two development-only `brace-expansion` versions to 1.1.21 and 5.0.12,
  addressing the dependency alerts for quadratic-time expansion.

### Upgrade notes and limitations

- Keep persistent data and uploads volumes and verify a backup before upgrading.
  The first startup automatically builds the new library indexes; allow it to
  finish before restarting the service. Missing legacy content hashes are filled
  in the background.
- Reload open readers after upgrading. Saved reading preferences remain usable;
  the existing classic font option now uses the bundled calligraphic face.
- For rollback, deploy v0.1.2 and restore the verified pre-upgrade backup using the
  [operations runbook](docs/operations-runbook.md). Existing mobile background-audio
  limitations remain unchanged.

## [0.1.2] - 2026-10-18

### Fixed

- Preserve SSML language elements when sanitizing speech requests. This fixes a
  v0.1.1 regression where sentence language tags were escaped and spoken aloud.
- Remove language overrides from newly generated speech, retaining their text
  and other speech controls, so monolingual voices also accept the request.
- Refresh the service-worker cache so existing readers receive the updated speech
  builder after upgrading.
- Compile the container backend for the requested target architecture instead of
  forcing amd64, and reject a binary/image architecture mismatch during builds.

### Upgrade notes

- Reload an already open reader after upgrading to discard audio clips that were
  synthesized and buffered before the fix.

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

[Unreleased]: https://github.com/zuoban/z-reader/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/zuoban/z-reader/releases/tag/v0.1.4
[0.1.3]: https://github.com/zuoban/z-reader/releases/tag/v0.1.3
[0.1.2]: https://github.com/zuoban/z-reader/releases/tag/v0.1.2
[0.1.1]: https://github.com/zuoban/z-reader/releases/tag/v0.1.1
[0.1.0]: https://github.com/zuoban/z-reader/releases/tag/v0.1.0
