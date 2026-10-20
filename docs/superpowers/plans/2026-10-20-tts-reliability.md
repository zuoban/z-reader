# TTS Reliability Implementation Plan

> **For agentic workers:** Use superpowers:dispatching-parallel-agents for the
> independent backend, text-buffer, and voice/prosody domains. Keep ownership of
> files separate; review spec compliance before code quality and integrate tests.

**Goal:** Implement every near-term TTS improvement from the approved analysis
and publish v0.1.5 with verified release artifacts.

**Architecture:** Retain one media element and the existing MP3 provider. Separate
text extraction/timing, request/retry policy, playback control, and persistence;
network prefetch must never block a user operation.

**Tech Stack:** React 19, Next.js 16, TypeScript, Foliate, Go/Gin, Vitest, Playwright.

## Task 1: Text extraction and duration-bounded chunks

Files: `frontend/public/foliate/tts.js`, `frontend/src/lib/tts-batch.ts`,
`frontend/src/lib/types.ts`, their unit tests, and the SSML contract fixture.

- [x] Add failing tests proving distinct CFIs after splitting, no lost text,
  numeric-body preservation and structural page-marker exclusion, valid SSML,
  and a first chunk no longer than its requested duration within one token.
  Example: `expect(first.estimatedSeconds).toBeLessThanOrEqual(12)` for 300 Han
  characters; concatenate subsequent chunk text and compare with the original.
- [x] Preserve offset/range metadata at extraction; split by word/character ranges,
  preserve markup and CFIs, and retain word and sentence marks independent of UI.
- [x] Avoid rebuilding and parsing every prior sentence on each append. Include
  punctuation in estimates and expose measured-duration calibration to the hook.
- [x] Run `rtk npm run test:unit -- tts-batch foliate-tts tts-ssml-contract`.

## Task 2: Backend deadlines, status handling, and metrics

Files: `backend/services/tts*.go`, `backend/services/endpoint.go`,
`backend/handlers/tts*.go`, relevant service/handler tests, `docs/observability.md`.

- [x] Add failing tests for the total request deadline, cancellable endpoint
  waiting, upstream busy/retry status propagation, and metric observations.
- [x] Bound total synthesis work to 55 seconds, including queue/endpoint work;
  preserve shared-request cancellation semantics and return typed retryable
  failures without refreshing credentials for malformed SSML.
- [x] Expose cache outcomes and queue/synthesis duration with finite metric labels.
- [x] Run `rtk go test ./...`, package coverage, and `rtk go vet ./...`.

## Task 3: Prosody and voice resources

Files: new `frontend/src/lib/tts-text.ts`, new focused tests,
`frontend/src/components/VoiceSelector.tsx` and its tests. Root integrates exports
into `tts.ts` to avoid simultaneous edits of that file.

- [x] Add failing cases for decimals/version/URLs, stacked stops, numeric content,
  fallback metadata precedence, unsupported voice style, and preview cancellation.
- [x] Implement semantic break enhancement and length/pause timing helpers in the
  focused text module. Preserve existing SSML safety and phoneme/bookmark support.
- [x] Clean up preview requests, timeouts and object URLs on every exit path.
- [x] Run the focused unit/component tests.

## Task 4: Playback, retry, highlight, persistence, diagnostics

Files: `frontend/src/lib/tts.ts`, new `tts-request.ts` and tests,
`frontend/src/hooks/useTTS.ts`, `useTTSSession.ts`, their tests,
`frontend/src/components/TTSControls.tsx`, and TTS diagnostics/tests.

- [x] Add failing tests for blocked prefetch navigation, timeout recovery,
  cancellable Retry-After/backoff, no stale playback, highlight-only continuity,
  unchanged-settings no-op, coalesced persistence/flush and preparation cancel.
- [x] Abort obsolete prefetch before navigation; share in-flight fetches by key.
  Use typed failures and bounded backoff; only malformed SSML receives fallback.
  Use a 65-second client timeout and retain visible recovery for exhausted retries.
- [x] Keep word/sentence marks for the same audio, switch highlighting without
  resetting the player, and calibrate future buffer planning from actual duration.
- [x] Coalesce writes and redundant status renders; add privacy-safe first-audio,
  gap, buffer-miss, retry and recovery measurements.
- [x] Run `rtk npm run test:unit -- tts TTS useWakeLock`.

## Task 5: Integration, review, and release

Files: `frontend/tests/e2e/tts-background.spec.ts`, real-provider measurement script,
`docs/tts-background-playback.md`, `docs/performance-baseline.md`, `CHANGELOG.md`,
frontend package/lock versions, and service-worker cache identifier.

- [x] Add browser coverage for slow prefetch navigation, highlight continuity,
  actual audio duration/gaps, and initial-generation cancellation.
- [x] Add an opt-in real-provider benchmark; keep deterministic CI isolated from
  external credentials. Record the measured scope and remaining device limits.
- [ ] Run all checks required by `AGENTS.md` and `docs/release-checklist.md`.
- [x] Obtain independent spec and quality review and address findings.
- [ ] Commit and open a PR. Wait for required CI, merge to main, then tag v0.1.5
  and publish notes.
- [ ] Verify tag CI, amd64/arm64 images, SBOM/provenance, health/readiness and
  non-production login/upload/reading/progress/backup-restore smoke evidence.
