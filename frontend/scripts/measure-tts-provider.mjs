// Explicit opt-in only. Generic samples contain no book or account content.
// TTS_BENCH_TOKEN is the complete Authorization header value, passed unchanged.
// Supply "Bearer <token>" for bearer authentication, or a raw session token if required.
const baseURL = process.env.TTS_BENCH_BASE_URL?.trim();
const token = process.env.TTS_BENCH_TOKEN?.trim();
const output = value => process.stdout.write(`${JSON.stringify(value)}\n`);

if (!baseURL || !token) {
  output({ ok: false, error: 'configuration-required' });
  process.exit(2);
}

let destination;
try {
  destination = new URL(baseURL);
  if (!['http:', 'https:'].includes(destination.protocol) ||
      destination.username || destination.password) throw new Error();
} catch {
  output({ ok: false, error: 'invalid-base-url' });
  process.exit(2);
}

let browser;
try {
  const { chromium } = await import('@playwright/test');
  browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
    ignoreDefaultArgs: ['--mute-audio'],
  });
  const page = await browser.newPage();
  const benchmarkURL = new URL('/__tts_benchmark__', destination).href;
  // A same-origin blank page avoids running the application's unrelated scripts.
  await page.route(benchmarkURL, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>TTS measurement</title>',
  }));
  await page.goto(benchmarkURL);
  const metrics = await page.evaluate(async ({ endpoint, authorization }) => {
    const audio = new Audio();
    const urls = [];
    const samples = [
      '春天的清晨，阳光照亮远处的山坡。微风吹过树梢，河水缓缓流向大海。',
      '午后的天空清澈明亮。小鸟停在枝头，花园里传来轻轻的脚步声。',
    ];
    let stage = 'synthesis';
    const round = value => Math.round(value * 10) / 10;
    const mediaEvent = name => new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        audio.removeEventListener(name, ready);
        audio.removeEventListener('error', failed);
      };
      const ready = () => { cleanup(); resolve(performance.now()); };
      const failed = () => { cleanup(); reject(new Error('media-failed')); };
      const timer = setTimeout(failed, 120_000);
      audio.addEventListener(name, ready, { once: true });
      audio.addEventListener('error', failed, { once: true });
    });
    const synthesize = async text => {
      const started = performance.now();
      const ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ' +
        'xml:lang="zh-CN"><voice name="zh-CN-XiaoyiNeural">' + text + '</voice></speak>';
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(65_000),
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({ ssml, output_format: 'audio-24khz-48kbitrate-mono-mp3' }),
      });
      if (!response.ok) throw new Error('synthesis-failed');
      const blob = await response.blob();
      if (!blob.size) throw new Error('empty-audio');
      const readyAt = performance.now();
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return { url, bytes: blob.size, latencyMs: round(readyAt - started), readyAt };
    };
    try {
      const started = performance.now();
      const first = await synthesize(samples[0]);
      stage = 'playback';
      audio.src = first.url;
      const firstPlaying = mediaEvent('playing');
      await Promise.all([audio.play(), firstPlaying]);
      const firstAudioPlayingMs = round(await firstPlaying - started);
      // Prefetch sample two while sample one plays, retaining a single audio element.
      const firstEnded = mediaEvent('ended');
      const secondReady = synthesize(samples[1]);
      // Attach both rejection handlers now, including when prefetch fails before ended.
      const [endedAt, second] = await Promise.all([firstEnded, secondReady]);
      audio.src = second.url;
      const secondPlaying = mediaEvent('playing');
      await Promise.all([audio.play(), secondPlaying]);
      const interChunkGapMs = round(await secondPlaying - endedAt);
      return {
        ok: true, samples: 2, firstAudioPlayingMs, interChunkGapMs,
        synthesisRequestMs: [first.latencyMs, second.latencyMs],
        audioBytes: [first.bytes, second.bytes],
        secondReadyBeforeFirstEnded: second.readyAt <= endedAt,
      };
    } catch {
      return { ok: false, error: 'measurement-failed', stage };
    } finally {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      for (const url of urls) URL.revokeObjectURL(url);
    }
  }, { endpoint: new URL('/api/ssml', destination).href, authorization: token });
  output(metrics);
  if (!metrics.ok) process.exitCode = 1;
} catch {
  // Browser and fetch errors can contain URLs or headers; never print raw errors.
  output({ ok: false, error: 'browser-measurement-failed' });
  process.exitCode = 1;
} finally {
  await browser?.close();
}
