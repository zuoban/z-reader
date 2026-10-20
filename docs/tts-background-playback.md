# Mobile background reading

The reader uses one `HTMLAudioElement` for its lifetime. Speech synthesis and
prefetching store MP3 blobs; they do not create additional media players. A new
chunk replaces the element's source directly. The source is emptied only when
the user stops reading or leaves the reader.

The first chunk is capped at 12 estimated seconds. Stable text slices of at most
6 estimated seconds retain exact source offsets, word CFIs, and the original
sentence range. Later chunks target 90 seconds, with about 180 seconds of future
speech prepared in advance. Estimates include punctuation, Latin word
length/syllables, and the selected speech rate. Buffer planning learns a bounded
correction from decoded audio duration. SSML remains
below the backend's 32 KiB limit. Exceptionally long sentences are split without
dropping their text.

The text queue reads detached book sections and stores text plus EPUB CFIs.
Consumed text history is bounded; moving backward beyond that history reloads
the previous sentence by CFI instead of retaining the entire book in memory.
Next/previous controls navigate original sentences rather than internal slices;
skipping never waits for unrelated audio prefetch. Numeric body text is read,
while semantic page markers, footnotes, hidden content, scripts, and styles are
excluded. Oversized pronunciation overrides use plain text when they must be split.
Playback and prefetching do not navigate the visible renderer. Highlighting and
scrolling run only while the page is visible. Returning to the foreground aligns
the view with the current spoken location. Voice, rate, and style changes rebuild
the buffer from the saved spoken location. Highlight mode switches the visual
range without replacing audio, losing playback time, or rebuilding speech.
Progress writes are coalesced over two seconds and flushed on pause, navigation,
visibility changes, settings updates, and teardown.

## Pause and resume

- A natural end also fires a `pause` event. The player distinguishes it using
  the actual element's `ended` state, then continues to the next chunk.
- User pause and lock-screen pause preserve position and disable automatic
  foreground resumption. Lock-screen play is an idempotent resume operation.
- External pauses update application state. Foreground recovery checks the real
  element's paused state, and resumes the same audio position when available.
- Stopping, skipping, or starting another session invalidates older asynchronous
  work so a late synthesis response cannot restart playback.
- Permission failures retain the current chunk and saved session. They are not
  treated as malformed sentences and do not skip book content.

- Timeouts and temporary network/provider errors receive two cancellable retries
  with backoff. Rate-limit delays are honored even when received by prefetch;
  waits longer than one minute are surfaced for manual recovery. Only a provider
  `invalid_ssml` response receives one plain-text fallback. Exhausted retries
  preserve the chunk and expose a recovery action.
- The server queue/endpoint/synthesis budget totals 55 seconds; the client allows
  65 seconds per attempt. Stop remains enabled during initial preparation and
  retry waits. Voice previews and book audio share local audio focus so either
  playback stops the other, including when resumed from Media Session.

Media Session provides system playback controls. Screen Wake Lock keeps the
screen on when available and is reacquired after an automatic release. Neither
API grants a web page permanent background execution.

## Local diagnostics

Diagnostics are off by default. To investigate a device-specific interruption,
enable them in that browser's developer console before reproducing:

```js
localStorage.setItem('z-reader-tts-diagnostics', '1');
```

Read `window.__zReaderTTSDiagnostics` after reproducing. The in-memory ring keeps
the most recent 200 events, including visibility, playback state, media pause/end,
source replacement state, `play()` resolution/rejection, and preload outcomes.
First-audio latency, inter-chunk gaps, buffer misses, retry/recovery, buffer
readiness, and duration corrections are also recorded. Metadata is allowlisted
to finite categories, booleans, and numbers.
It is not uploaded and is lost on page reload. Events do not include book text,
SSML, authentication tokens, or audio URLs. Disable it with:

```js
localStorage.removeItem('z-reader-tts-diagnostics');
delete window.__zReaderTTSDiagnostics;
```

## Validation

Unit tests cover native pause/end ordering, single-player prefetching,
interruption recovery, cancellation races, buffer construction, saved-word
resumption, Media Session stability, and wake-lock reacquisition. The dedicated
Playwright suite uses a real browser decoder with generated PCM audio and checks
continuation while page visibility is hidden. It also checks that detached
chapter extraction leaves the renderer's current section unchanged.

For Android device acceptance, test a book longer than 30 minutes with the
configured speech provider:

1. Start reading, lock the screen mid-sentence, and verify several chunk boundaries
   and at least one chapter boundary continue without user interaction.
2. Switch to another app, then return. Verify the view follows the spoken location.
3. Pause and resume using the lock screen and a headset. Explicit pause must remain
   paused when reopening Chrome.
4. Interrupt playback with another audio app or a call. Verify the app does not
   repeatedly force playback while it is hidden and can resume without skipping.
5. Stop during synthesis, change voices, skip forward/backward, and reopen the
   book. Verify there is no stale playback or unexpected jump past failed audio.
6. Repeat with battery saver enabled and with a brief network interruption.

Browser tests cannot reproduce Android's operating-system audio focus or vendor
battery management. A browser process that is killed or a discarded page cannot
continue web playback. Word highlighting uses estimated timing because the
speech endpoint returns audio without word-boundary timestamps; it may drift
within a chunk. Saved CFIs remain the recovery location.

## Upgrade

There is no database migration or new speech-provider configuration. Upgrade the
container image normally, keeping `data/` and `uploads/` volumes. The release
bumps the service-worker cache version so the new frontend receives the matching
Foliate APIs. Reopen/refresh an already open reader after upgrading. Rollback uses
the previous image tag with the same persistent volumes.

## Real-provider measurement

Use `npm run test:tts:provider` only against an isolated deployment with your
speech service enabled. It requires `TTS_BENCH_BASE_URL` and `TTS_BENCH_TOKEN`
(the complete Authorization header value, for example `Bearer <session-token>`).
No destination or token is assumed. Keep credentials in the environment and out
of command history or report files.

The script synthesizes two generic samples, measures request-to-`playing`,
request latency and bytes, prefetch readiness, and inter-chunk gaps on one audio
element. It prints aggregate JSON without text, URLs, credentials, or raw errors.
Endpoint latency includes any backend cache effects; browser `playing` indicates
decoder playback onset, not a physical measurement at the speaker. See the
[recorded isolated sample](performance/tts-provider-2026-10-20.json).
