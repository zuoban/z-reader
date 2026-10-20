# TTS reliability and responsiveness

The user approved implementing the TTS analysis and publishing the next release.
This design retains the single HTMLAudioElement, detached EPUB extraction,
bounded history, Media Session controls, and existing speech configuration.

## Required behavior

1. Sentence navigation cancels irrelevant synthesis immediately. It may serialize
   detached text extraction, but never waits for a background network request.
2. Cancellation stops stale work quietly. Timeouts, temporary network failures,
   rate limits, malformed SSML, and permission failures receive distinct handling.
   Retry transient failures with bounded, cancellable backoff and Retry-After;
   retain the current chunk and expose recovery when attempts are exhausted.
   The frontend timeout exceeds the backend's total queue/endpoint/synthesis budget.
3. Splitting a passage preserves its complete text and distinct resumable CFIs,
   word locations, and punctuation. The first chunk has a real estimated-duration
   cap, including when the source sentence is unpunctuated. Later chunks remain
   bounded by both duration and SSML bytes.
4. Highlight mode is a visual preference: updating it never stops audio, refetches
   synthesis, or invalidates audio caches. Unchanged settings are no-ops. Voice,
   rate, and style changes rebuild from the current spoken location.
5. Estimated word timing accounts for spoken length and punctuation, with separate
   sentence ranges for sentence highlighting. Buffer planning learns the ratio of
   measured audio duration to estimates for the selected synthesis settings.
   The current MP3 endpoint has no word timestamps: estimated timings remain
   explicitly documented and must not be represented as provider timestamps.
6. Prosody uses semantic punctuation without inserting pauses into decimals,
   versions, abbreviations, or URLs, or stacking punctuation and sentence pauses.
   Numeric body content is spoken; page markers and non-content are excluded
   using EPUB/HTML structure rather than a blanket short-number rule.
7. Provider voice metadata wins over fallback metadata. Changing voice clears an
   unsupported style. Voice preview is cancellable and releases audio resources
   on stop, replacement, rejection, and unmount without overlapping book playback.
8. Session progress uses coalesced writes with immediate flush on pause, hide,
   navigation, setting changes, and teardown. Background progress remains resumable.
9. Diagnostics report first audio, inter-chunk gaps, buffer misses, retry/recovery,
   and buffer readiness without book text or credentials. Backend metrics expose
   cache outcomes, synthesis/queue latency, and failures with bounded cardinality.
   A reproducible opt-in real-provider measurement complements deterministic CI.
10. Preparing playback remains cancellable in the UI. Existing visible layouts,
    accessibility, background playback, and persisted settings remain compatible.

## Delivery and validation

Use regression-first unit and component tests, then all frontend lint, unit,
coverage, production build, JS-budget, functional/visual browser checks and
backend tests/coverage/vet. Independently review the complete diff, publish a PR,
wait for required GitHub checks, merge, and create an annotated v0.1.5 tag from
reviewed main. Verify CI, multi-architecture images, SBOM/provenance and the
GitHub Release. Document upgrade and rollback without a database migration.
