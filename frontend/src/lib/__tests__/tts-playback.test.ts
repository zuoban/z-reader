import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendTTS } from '@/lib/tts';
import { TTSRequestError } from '@/lib/tts-request';
import { claimTTSAudioFocus } from '@/lib/tts-audio-focus';
import { audioResponse, flushMediaEvents, installTestAudio, TestAudio } from '@/test/tts-audio';

vi.mock('@/lib/api', () => ({ getAuthHeaders: () => ({}), handleAuthResponse: () => {} }));

describe('TTS media playback', () => {
  let player: BackendTTS;
  beforeEach(() => {
    TestAudio.instances = [];
    installTestAudio();
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()));
    player = new BackendTTS();
  });
  afterEach(() => {
    player.stop();
    player.clearPreload();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('preloads data and reuses one Audio without emptying its source between chunks', async () => {
    await player.speak('<speak>first</speak>');
    const audio = TestAudio.instances[0];
    await player.preloadMultiple(['<speak>second</speak>', '<speak>third</speak>']);
    expect(TestAudio.instances).toHaveLength(1);
    await player.speak('<speak>second</speak>', undefined, true);
    expect(TestAudio.instances).toHaveLength(1);
    expect(audio.sources).toHaveLength(2);
    expect(audio.sources.every(Boolean)).toBe(true);
    expect(audio.loadCalls).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('observes the first external pause and resumes the same audio', async () => {
    await player.speak('<speak>first</speak>');
    const audio = TestAudio.instances[0];
    audio.pause();
    await flushMediaEvents();
    expect(player.getState()).toBe('paused');
    expect(player.needsResume()).toBe(true);
    await player.resume();
    expect(audio.paused).toBe(false);
    expect(player.getState()).toBe('playing');
  });

  it('resumes using actual element state before its pause event is delivered', async () => {
    await player.speak('<speak>first</speak>');
    const audio = TestAudio.instances[0];
    audio.paused = true;
    expect(player.getState()).toBe('playing');
    await player.resume();
    expect(audio.paused).toBe(false);
  });

  it('continues after natural pause/ended events, including after manual resume', async () => {
    const ended = vi.fn();
    player.onEndCallback(ended);
    await player.speak('<speak>first</speak>');
    player.pause();
    await flushMediaEvents();
    await player.resume();
    TestAudio.instances[0].finish();
    await flushMediaEvents();
    expect(ended).toHaveBeenCalledOnce();
    expect(player.getState()).toBe('playing');
  });

  it.each(['stop', 'pause'] as const)('does not start late synthesis after %s', async action => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const speech = player.speak('<speak>late</speak>');
    const rejected = expect(speech).rejects.toMatchObject({ name: 'AbortError' });
    player[action]();
    resolve(audioResponse());
    await rejected;
    expect(TestAudio.instances).toHaveLength(0);
    expect(player.getState()).toBe(action === 'stop' ? 'stopped' : 'paused');
  });

  it('does not let an old synthesis overwrite a newer request', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const first = player.speak('<speak>old</speak>');
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await player.speak('<speak>new</speak>');
    resolve(audioResponse());
    await rejected;
    expect(TestAudio.instances).toHaveLength(1);
    expect(player.getState()).toBe('playing');
  });

  it('keeps the mark and play position when resuming a continuous chunk', async () => {
    const marks = vi.fn();
    player.onMarkChangeCallback(marks);
    await player.speak('<speak>first second</speak>', [
      { name: '0', text: 'first', cfi: 'cfi-first', weight: 1 },
      { name: '1', text: 'second', cfi: 'cfi-second', weight: 1 },
    ]);
    const audio = TestAudio.instances[0];
    audio.tick(20);
    expect(marks.mock.lastCall?.[0].cfi).toBe('cfi-second');
    player.pause();
    await flushMediaEvents();
    await player.resume();
    expect(audio.currentTime).toBe(20);
    expect(marks.mock.lastCall?.[0].cfi).toBe('cfi-second');
  });

  it('propagates permission errors without reporting successful playback', async () => {
    await player.speak('<speak>first</speak>');
    TestAudio.instances[0].playError = new DOMException('User activation required', 'NotAllowedError');
    await expect(player.speak('<speak>second</speak>')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(player.getState()).not.toBe('playing');
  });

  it('does not restore playing state after stop interrupts an asynchronous resume', async () => {
    await player.speak('<speak>first</speak>');
    player.pause();
    const audio = TestAudio.instances[0];
    let deliver!: () => void;
    audio.play = () => new Promise<void>(resolve => { deliver = resolve; });
    const resume = player.resume();
    const rejected = expect(resume).rejects.toMatchObject({ name: 'AbortError' });
    player.stop();
    deliver();
    await rejected;
    expect(player.getState()).toBe('stopped');
  });

  it('cancels playback promptly while its matching prefetch remains pending', async () => {
    let deliver!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { deliver = resolve; }));
    const preload = player.preload('<speak>pending</speak>');
    const speech = player.speak('<speak>pending</speak>');
    const observed = speech.then(() => 'playing', error => error.name);
    player.pause();
    const outcome = await Promise.race([observed,
      new Promise(resolve => setTimeout(() => resolve('still-waiting'), 30))]);
    deliver(audioResponse());
    await preload;
    expect(outcome).toBe('AbortError');
    expect(player.getState()).toBe('paused');
  });

  it('retains a provider Retry-After from failed prefetch for all following synthesis', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false, status: 429, headers: new Headers({ 'Retry-After': '2' }),
      json: async () => ({ code: 'rate_limited' }),
    } as Response);
    await player.preload('<speak>future</speak>');
    const blocked = player.speak('<speak>another chunk</speak>');
    await expect(blocked).rejects.toMatchObject({ status: 429, retryAfterMs: 2000 });
    await expect(player.speak('<speak>future</speak>')).rejects.toBeInstanceOf(TTSRequestError);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    await player.speak('<speak>future</speak>');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops an active preview when narration starts or resumes and yields to a new preview', async () => {
    const previewStopped = vi.fn();
    claimTTSAudioFocus({}, previewStopped);
    await player.speak('<speak>first</speak>');
    expect(previewStopped).toHaveBeenCalledTimes(1);
    const secondPreviewStopped = vi.fn();
    const release = claimTTSAudioFocus({}, secondPreviewStopped);
    expect(player.getState()).toBe('paused');
    expect(TestAudio.instances[0].paused).toBe(true);
    await player.resume();
    expect(secondPreviewStopped).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe('playing');
    release();
  });

  it('preserves the longest Retry-After when concurrent prefetch responses arrive', async () => {
    vi.useFakeTimers();
    const limited = (seconds: number, status: number) => ({
      ok: false, status, headers: new Headers({ 'Retry-After': String(seconds) }),
      json: async () => ({ code: 'rate_limited' }),
    } as Response);
    vi.mocked(fetch).mockResolvedValueOnce(limited(60, 429))
      .mockResolvedValueOnce(limited(1, 503));
    await Promise.all([player.preload('<speak>a</speak>'), player.preload('<speak>b</speak>')]);
    await expect(player.speak('<speak>c</speak>')).rejects.toMatchObject({
      status: 429, retryAfterMs: 60_000,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('settles discarded queued work without fetching it or retaining obsolete ready audio', async () => {
    const ssml = (name: string) => `<speak>${name}</speak>`;
    await player.preload(ssml('ready'));
    const deliveries: Array<(response: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => {
      deliveries.push(resolve);
    }));
    const pending = ['active-one', 'active-two', 'queued', 'obsolete']
      .map(name => player.preload(ssml(name)));
    expect(fetch).toHaveBeenCalledTimes(3);

    player.cleanupIrrelevantPreloads(['active-one', 'active-two', 'queued'].map(ssml));
    player.cancelPreload(ssml('queued'));
    await Promise.all(pending.slice(2));
    expect(player.hasAudio(ssml('ready'))).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);

    deliveries.forEach(deliver => deliver(audioResponse()));
    await Promise.all(pending);
    expect(player.getPreloadQueueLength()).toBe(2);
    expect(player.hasAudio(ssml('active-one'))).toBe(true);
    expect(player.hasAudio(ssml('active-two'))).toBe(true);
    expect(player.hasAudio(ssml('queued'))).toBe(false);
    expect(player.hasAudio(ssml('obsolete'))).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('pauses on a decoder error and requires fresh audio for recovery', async () => {
    const ended = vi.fn();
    player.onEndCallback(ended);
    await player.speak('<speak>broken audio</speak>');
    const audio = TestAudio.instances[0];
    audio.error = { code: 3 } as MediaError;
    audio.onerror?.();
    expect(player.getState()).toBe('paused');
    expect(player.hasCurrentAudio()).toBe(false);
    expect(ended).not.toHaveBeenCalled();
    await expect(player.resume()).rejects.toThrow('当前音频需要重新准备');
  });
});
