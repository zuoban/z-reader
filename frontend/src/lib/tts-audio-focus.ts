interface AudioFocusLease {
  owner: object;
  onLoss: () => void;
}

let activeLease: AudioFocusLease | null = null;

/** Coordinate local narration and previews without transferring user playback intent. */
export function claimTTSAudioFocus(owner: object, onLoss: () => void): () => void {
  const previous = activeLease;
  const lease = { owner, onLoss };
  // Install the new lease first: stopping the previous owner may release its lease.
  activeLease = lease;
  if (previous && previous.owner !== owner) previous.onLoss();

  return () => {
    if (activeLease === lease) activeLease = null;
  };
}
