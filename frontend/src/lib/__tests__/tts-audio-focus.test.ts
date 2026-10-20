import { afterEach, describe, expect, it, vi } from 'vitest';

import { claimTTSAudioFocus } from '@/lib/tts-audio-focus';

const releases: Array<() => void> = [];

function claim(owner: object, onLoss: () => void) {
  const release = claimTTSAudioFocus(owner, onLoss);
  releases.push(release);
  return release;
}

afterEach(() => { for (const release of releases.splice(0)) release(); });

describe('exclusive TTS audio focus', () => {
  it('synchronously stops the previous owner when a different owner claims focus', () => {
    const oldLoss = vi.fn();
    const newLoss = vi.fn();
    claim({}, oldLoss);
    claim({}, newLoss);
    expect(oldLoss).toHaveBeenCalledOnce();
    expect(newLoss).not.toHaveBeenCalled();
  });

  it('does not let a prior owner release the new owner from its loss callback', () => {
    const releaseOld: () => void = claim({}, () => releaseOld());
    const newLoss = vi.fn();
    claim({}, newLoss);
    claim({}, vi.fn());
    expect(newLoss).toHaveBeenCalledOnce();
  });

  it('keeps a newer claim by the same owner when an older lease is released', () => {
    const owner = {};
    const oldLoss = vi.fn();
    const newLoss = vi.fn();
    const releaseOld = claim(owner, oldLoss);
    claim(owner, newLoss);
    expect(oldLoss).not.toHaveBeenCalled();
    releaseOld();
    claim({}, vi.fn());
    expect(newLoss).toHaveBeenCalledOnce();
  });

  it('does not call a released owner when the next owner claims focus', () => {
    const loss = vi.fn();
    const release = claim({}, loss);
    release();
    release();
    claim({}, vi.fn());
    expect(loss).not.toHaveBeenCalled();
  });
});
