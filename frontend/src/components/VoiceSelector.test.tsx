import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceSelector } from '@/components/VoiceSelector';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';
import { FALLBACK_ZH_VOICES } from '@/lib/tts';
import { claimTTSAudioFocus } from '@/lib/tts-audio-focus';
import { audioResponse, installTestAudio, TestAudio } from '@/test/tts-audio';
import type { TTSSettings } from '@/lib/tts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function renderSelector(settings: Partial<TTSSettings> = {}) {
  const props = {
    settings: {
      voiceName: FALLBACK_ZH_VOICES[0].ShortName, rate: 0, highlightMode: 'word' as const,
      ...settings,
    },
    voices: FALLBACK_ZH_VOICES,
    onUpdateSettings: vi.fn(),
    onPreviewStart: vi.fn(),
    onPreviewEnd: vi.fn(),
    uiScheme: PRESET_STYLES.light,
  };
  return { ...render(<VoiceSelector {...props} />), props };
}

describe('VoiceSelector preview lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestAudio.instances = [];
    installTestAudio();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(audioResponse()));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('releases the active object URL and narrating callback when manually stopped', async () => {
    const { props } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    expect(props.onPreviewStart).toHaveBeenCalledOnce();
    await flush();
    const audio = TestAudio.instances[0];
    expect(audio.paused).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '停止语音试听' }));
    expect(audio.paused).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tts-test-1');
    expect(props.onPreviewEnd).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a request that resolves after stop and a replacement preview', async () => {
    const oldRequest = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(oldRequest.promise);
    const { props } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByRole('button', { name: '停止语音试听' }));
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    oldRequest.resolve(audioResponse());
    await flush();
    expect(TestAudio.instances).toHaveLength(1);
    expect(TestAudio.instances[0].paused).toBe(false);
    expect(props.onPreviewStart).toHaveBeenCalledTimes(2);
    expect(props.onPreviewEnd).toHaveBeenCalledOnce();
  });

  it('ignores a blob completing after unmount and clears the request timeout', async () => {
    const blob = deferred<Blob>();
    vi.mocked(fetch).mockResolvedValue({ ...audioResponse(), blob: () => blob.promise });
    const { unmount, props } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    unmount();
    blob.resolve(new Blob(['audio']));
    await flush();
    expect(TestAudio.instances).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(props.onPreviewEnd).toHaveBeenCalledOnce();
  });

  it('releases resources when playback rejects and exposes a useful error', async () => {
    vi.spyOn(TestAudio.prototype, 'play').mockRejectedValueOnce(new Error('Blocked'));
    const { props } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(props.onPreviewEnd).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('试听');
    expect(screen.getByRole('button', { name: '试听当前语音' })).toBeVisible();
  });

  it('pauses a late play resolution without disrupting a newer preview', async () => {
    const play = deferred<void>();
    vi.spyOn(TestAudio.prototype, 'play').mockImplementationOnce(async function (this: TestAudio) {
      this.playCalls += 1;
      await play.promise;
      this.paused = false;
    });
    renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    const oldAudio = TestAudio.instances[0];
    fireEvent.click(screen.getByRole('button', { name: '停止语音试听' }));
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    play.resolve();
    await flush();
    expect(oldAudio.paused).toBe(true);
    expect(TestAudio.instances[1].paused).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('stops the current preview when the selected voice changes externally', async () => {
    const { props, rerender } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    rerender(<VoiceSelector {...props} settings={{
      ...props.settings, voiceName: FALLBACK_ZH_VOICES[1].ShortName,
    }} />);
    expect(TestAudio.instances[0].paused).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(props.onPreviewEnd).toHaveBeenCalledOnce();
  });

  it('clears a style unsupported by a newly selected voice', async () => {
    const { props } = renderSelector({ style: 'newscast' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: '语音' }), { key: 'ArrowDown' });
    await flush();
    fireEvent.click(screen.getByRole('option', { name: '晓伊 (女)' }));
    expect(props.onUpdateSettings).toHaveBeenCalledWith({
      voiceName: FALLBACK_ZH_VOICES[1].ShortName, style: undefined,
    });
    expect(props.onUpdateSettings.mock.calls[0][0]).toHaveProperty('style', undefined);
  });

  it('uses the provider ShortName for selection and preserves a supported style', async () => {
    const { props, rerender } = renderSelector({ style: 'chat' });
    const voices = FALLBACK_ZH_VOICES.map(voice => ({
      ...voice, Name: `Microsoft Server Speech Text to Speech Voice (${voice.ShortName})`,
    }));
    rerender(<VoiceSelector {...props} voices={voices} />);
    expect(screen.getByRole('combobox', { name: '风格' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('combobox', { name: '语音' }), { key: 'ArrowDown' });
    await flush();
    fireEvent.click(screen.getByRole('option', { name: '晓伊 (女)' }));
    expect(props.onUpdateSettings).toHaveBeenCalledWith({
      voiceName: FALLBACK_ZH_VOICES[1].ShortName,
    });
  });

  it('stops an active preview when narration claims focus without preview callbacks', async () => {
    const { props, rerender } = renderSelector();
    rerender(<VoiceSelector {...props} onPreviewStart={undefined} onPreviewEnd={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    await flush();
    const audio = TestAudio.instances[0];
    expect(audio.paused).toBe(false);
    const narrationLostFocus = vi.fn();
    let release!: () => void;
    act(() => { release = claimTTSAudioFocus({}, narrationLostFocus); });
    try {
      expect(audio.paused).toBe(true);
      expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: '试听当前语音' })).toBeEnabled();
      const releaseOther = claimTTSAudioFocus({}, vi.fn());
      expect(narrationLostFocus).toHaveBeenCalledOnce();
      releaseOther();
    } finally {
      release();
    }
  });

  it('cannot play a late response after focus has transferred to narration', async () => {
    const request = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(request.promise);
    const { props } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    let release!: () => void;
    act(() => { release = claimTTSAudioFocus({}, vi.fn()); });
    try {
      expect(signal?.aborted).toBe(true);
      expect(props.onPreviewEnd).toHaveBeenCalledOnce();
      request.resolve(audioResponse());
      await flush();
      expect(TestAudio.instances).toHaveLength(0);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
});
