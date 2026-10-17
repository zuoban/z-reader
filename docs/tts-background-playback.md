# Mobile background reading

The reader uses one `HTMLAudioElement` for its lifetime. Speech synthesis and
prefetching store MP3 blobs; they do not create additional media players. A new
chunk replaces the element's source directly. The source is emptied only when
the user stops reading or leaves the reader.

The first chunk targets about 12 seconds of speech. Later chunks target about
90 seconds, with about 180 seconds of future speech prepared in advance. These
are text-based estimates adjusted for the selected speech rate. SSML remains
below the backend's 32 KiB limit. Exceptionally long sentences are split without
dropping their text.

The text queue reads detached book sections and stores text plus EPUB CFIs.
Playback and prefetching do not navigate the visible renderer. Highlighting and
scrolling run only while the page is visible. Returning to the foreground aligns
the view with the current spoken location. Voice, rate, style, or highlight
changes rebuild the buffer from the saved spoken location.

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
