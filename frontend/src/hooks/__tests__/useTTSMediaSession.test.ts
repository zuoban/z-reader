import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTTSMediaSession } from '@/hooks/useTTSMediaSession';
import { normalizeMetadataText } from '@/lib/tts-helpers';
import type { TTSMark, TTSState } from '@/lib/tts';
import type { FoliateView } from '@/lib/types';

afterEach(() => vi.unstubAllGlobals());

describe('stable media session', () => {
  it('keeps controls registered and does not clear playback state on word updates', () => {
    vi.stubGlobal('MediaMetadata', class { constructor(public value: unknown) {} });
    const session = { metadata: null, playbackState: 'none', setActionHandler: vi.fn() };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    const view = { book: { metadata: { title: 'Book', author: 'Author' } } } as FoliateView;
    const viewRef = { current: view };
    const options = { viewRef, normalizeMetadataText, onPause: vi.fn(),
      startRef: { current: vi.fn(async () => {}) }, stopRef: { current: vi.fn() },
      nextRef: { current: vi.fn(async () => {}) }, prevRef: { current: vi.fn(async () => {}) } };
    const { rerender, unmount } = renderHook(
      ({ state, mark }: { state: TTSState; mark: TTSMark }) =>
        useTTSMediaSession({ ...options, state, currentMark: mark }),
      { initialProps: { state: 'playing' as TTSState, mark: { name: '0', text: 'first' } } },
    );
    const metadata = session.metadata;
    rerender({ state: 'playing', mark: { name: '1', text: 'second' } });
    expect(session.setActionHandler).toHaveBeenCalledTimes(5);
    expect(session.playbackState).toBe('playing');
    expect(session.metadata).toBe(metadata);
    rerender({ state: 'paused', mark: { name: '1', text: 'second' } });
    expect(session.setActionHandler).toHaveBeenCalledTimes(5);
    expect(session.playbackState).toBe('paused');
    const play = session.setActionHandler.mock.calls.find(call => call[0] === 'play')?.[1];
    act(() => play({ action: 'play' }));
    expect(options.startRef.current).toHaveBeenCalledOnce();
    unmount();
    expect(session.playbackState).toBe('none');
  });
});
