import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTTSMediaSession } from '@/hooks/useTTSMediaSession';
import { normalizeMetadataText } from '@/lib/tts-helpers';
import type { TTSMark, TTSState } from '@/lib/tts';
import type { FoliateView } from '@/lib/types';

const originalMediaSessionDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'mediaSession',
);

function removeMediaSession() {
  delete (navigator as unknown as Record<string, unknown>).mediaSession;
}

function installMediaSession(
  setActionHandler: ReturnType<
    typeof vi.fn<(action: MediaSessionAction, handler: MediaSessionActionHandler | null) => void>
  > = vi.fn(),
) {
  class MockMediaMetadata {
    constructor(public value: MediaMetadataInit) {}
  }
  vi.stubGlobal('MediaMetadata', MockMediaMetadata);
  const session = {
    metadata: null as MockMediaMetadata | null,
    playbackState: 'none' as MediaSessionPlaybackState,
    setActionHandler,
  };
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: session,
  });
  return { session, MockMediaMetadata };
}

function createOptions(view: FoliateView | null) {
  return {
    viewRef: { current: view },
    normalizeMetadataText,
    onPause: vi.fn(),
    startRef: { current: vi.fn(async () => {}) },
    stopRef: { current: vi.fn() },
    nextRef: { current: vi.fn(async () => {}) },
    prevRef: { current: vi.fn(async () => {}) },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalMediaSessionDescriptor) {
    Object.defineProperty(navigator, 'mediaSession', originalMediaSessionDescriptor);
  } else {
    removeMediaSession();
  }
});

describe('useTTSMediaSession', () => {
  it('keeps controls registered and does not clear playback state on word updates', () => {
    const { session } = installMediaSession();
    const view = { book: { metadata: { title: 'Book', author: 'Author' } } } as FoliateView;
    const options = createOptions(view);

    const { rerender, unmount } = renderHook(
      ({ state, mark }: { state: TTSState; mark: TTSMark | null }) =>
        useTTSMediaSession({ ...options, state, currentMark: mark }),
      { initialProps: { state: 'playing' as TTSState, mark: { name: '0', text: 'first' } as TTSMark | null } },
    );

    const metadata = session.metadata;
    expect(metadata?.value).toEqual({
      title: 'Book',
      artist: 'Author',
      album: 'Z Reader',
    });

    rerender({ state: 'playing', mark: { name: '1', text: 'second' } });
    expect(session.setActionHandler).toHaveBeenCalledTimes(5);
    expect(session.playbackState).toBe('playing');
    expect(session.metadata).toBe(metadata);

    rerender({ state: 'paused', mark: { name: '1', text: 'second' } });
    expect(session.setActionHandler).toHaveBeenCalledTimes(5);
    expect(session.playbackState).toBe('paused');

    const play = session.setActionHandler.mock.calls.find(call => call[0] === 'play')?.[1];
    act(() => play?.({ action: 'play' }));
    expect(options.startRef.current).toHaveBeenCalledOnce();

    unmount();
    expect(session.playbackState).toBe('none');
  });

  it('safely no-ops when navigator.mediaSession is missing', () => {
    removeMediaSession();
    expect('mediaSession' in navigator).toBe(false);
    const options = createOptions(null);

    const { rerender, unmount } = renderHook(
      ({ state }: { state: TTSState }) =>
        useTTSMediaSession({ ...options, state, currentMark: null }),
      { initialProps: { state: 'playing' as TTSState } },
    );

    rerender({ state: 'paused' });
    rerender({ state: 'stopped' });
    expect(() => unmount()).not.toThrow();
  });

  it('skips MediaMetadata updates when MediaMetadata is unavailable', () => {
    const { session } = installMediaSession();
    vi.stubGlobal('MediaMetadata', undefined);
    const options = createOptions({
      book: { metadata: { title: 'Book', author: 'Author' } },
    } as FoliateView);

    const { unmount } = renderHook(() =>
      useTTSMediaSession({ ...options, state: 'playing', currentMark: null }),
    );

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('playing');
    expect(session.setActionHandler).toHaveBeenCalledTimes(5);

    unmount();
    expect(session.playbackState).toBe('none');
  });

  it('sets playbackState to none in stopped state and updates fallback metadata', () => {
    const { session } = installMediaSession();
    const options = createOptions(null);

    const { rerender } = renderHook(
      ({ state, mark }: { state: TTSState; mark: TTSMark | null }) =>
        useTTSMediaSession({ ...options, state, currentMark: mark }),
      {
        initialProps: {
          state: 'playing' as TTSState,
          mark: { name: '0', text: '当前正在朗读的句子' } as TTSMark | null,
        },
      },
    );

    expect(session.playbackState).toBe('playing');
    expect(session.metadata?.value).toEqual({
      title: '当前正在朗读的句子',
      artist: 'Z Reader',
      album: 'Z Reader',
    });

    rerender({ state: 'stopped', mark: null });
    expect(session.playbackState).toBe('none');
    expect(session.metadata?.value).toEqual({
      title: 'Z Reader 朗读',
      artist: 'Z Reader',
      album: 'Z Reader',
    });
  });

  it('invokes pause, stop, previoustrack, and nexttrack action handlers', () => {
    const { session } = installMediaSession();
    const options = createOptions({
      book: { metadata: { title: 'Book', author: 'Author' } },
    } as FoliateView);

    renderHook(() =>
      useTTSMediaSession({ ...options, state: 'playing', currentMark: null }),
    );

    const handlers = new Map(
      session.setActionHandler.mock.calls.map(([action, handler]) => [action, handler]),
    );

    act(() => {
      handlers.get('play')?.({ action: 'play' });
      handlers.get('pause')?.({ action: 'pause' });
      handlers.get('stop')?.({ action: 'stop' });
      handlers.get('previoustrack')?.({ action: 'previoustrack' });
      handlers.get('nexttrack')?.({ action: 'nexttrack' });
    });

    expect(options.startRef.current).toHaveBeenCalledOnce();
    expect(options.onPause).toHaveBeenCalledOnce();
    expect(options.stopRef.current).toHaveBeenCalledOnce();
    expect(options.prevRef.current).toHaveBeenCalledOnce();
    expect(options.nextRef.current).toHaveBeenCalledOnce();
  });

  it('tolerates setActionHandler throwing on unsupported actions during mount and unmount', () => {
    const setActionHandler = vi.fn(
      (action: MediaSessionAction, _handler: MediaSessionActionHandler | null) => {
        void _handler;
        if (action === 'stop' || action === 'previoustrack') {
          throw new TypeError(`Unsupported action: ${action}`);
        }
      },
    );
    const { session } = installMediaSession(setActionHandler);
    const options = createOptions(null);

    const { unmount } = renderHook(() =>
      useTTSMediaSession({ ...options, state: 'playing', currentMark: null }),
    );

    expect(setActionHandler).toHaveBeenCalledTimes(5);
    expect(session.playbackState).toBe('playing');

    const nextHandler = setActionHandler.mock.calls.find(
      (call) => call[0] === 'nexttrack',
    )?.[1];
    act(() => nextHandler?.({ action: 'nexttrack' }));
    expect(options.nextRef.current).toHaveBeenCalledOnce();

    expect(() => unmount()).not.toThrow();
    expect(session.playbackState).toBe('none');
    expect(setActionHandler).toHaveBeenCalledWith('play', null);
    expect(setActionHandler).toHaveBeenCalledWith('pause', null);
    expect(setActionHandler).toHaveBeenCalledWith('stop', null);
    expect(setActionHandler).toHaveBeenCalledWith('previoustrack', null);
    expect(setActionHandler).toHaveBeenCalledWith('nexttrack', null);
  });

  it('falls back to truncated mark text and default title/author when book metadata is missing', () => {
    const { session } = installMediaSession();
    const options = createOptions({ book: { metadata: {} } } as FoliateView);
    const longSentence = '这是一段超过三十二个字符长度的测试朗读文本内容用于验证标题截断逻辑是否正确';

    const { rerender } = renderHook(
      ({ mark }: { mark: TTSMark | null }) =>
        useTTSMediaSession({ ...options, state: 'playing', currentMark: mark }),
      { initialProps: { mark: { name: '0', text: longSentence } as TTSMark | null } },
    );

    expect(session.metadata?.value).toEqual({
      title: longSentence.slice(0, 32),
      artist: 'Z Reader',
      album: 'Z Reader',
    });

    rerender({ mark: { name: '1', text: '' } });
    expect(session.metadata?.value).toEqual({
      title: 'Z Reader 朗读',
      artist: 'Z Reader',
      album: 'Z Reader',
    });
  });

  it('clears all registered action handlers and resets playbackState on unmount', () => {
    const { session } = installMediaSession();
    const options = createOptions({
      book: { metadata: { title: 'Book', author: 'Author' } },
    } as FoliateView);

    const { unmount } = renderHook(() =>
      useTTSMediaSession({ ...options, state: 'playing', currentMark: null }),
    );

    session.setActionHandler.mockClear();
    unmount();

    expect(session.setActionHandler.mock.calls).toEqual([
      ['play', null],
      ['pause', null],
      ['stop', null],
      ['previoustrack', null],
      ['nexttrack', null],
    ]);
    expect(session.playbackState).toBe('none');
  });
});
