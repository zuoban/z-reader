import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendTTS } from '@/lib/tts';
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
});
