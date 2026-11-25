import { computeMarkBoundaries, findMarkIndexAtProgress } from './audio-cache';
import type {
  AdaptivePreloadConfig,
  CachedAudio,
  PlaybackSource,
  TTSMark,
  TTSMetricDetail,
  TTSState,
} from './types';

export interface AudioElementSnapshot {
  paused?: boolean;
  ended?: boolean;
  time?: number;
  duration?: number;
  readyState?: number;
}

export interface TTSAudioPlayerHooks {
  getState: () => TTSState;
  setState: (state: TTSState) => void;
  getPlaybackRequestId: () => number;
  getAdaptivePreloadConfig: (duration: number) => AdaptivePreloadConfig;
  logMetric: (event: string, detail?: TTSMetricDetail) => void;
  onMarkChange: (mark: TTSMark, index: number) => void;
  onEnd: () => void;
  onDecodeError: (ssml: string, entry: CachedAudio) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onPreloadTrigger: () => void;
}

export class TTSAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private audioSource: PlaybackSource | null = null;
  private currentMarkIndex = 0;
  private marks: TTSMark[] = [];
  private markBoundaries: number[] = [];
  private speechId = 0;
  private replacingSource = false;
  private wantsPlayback = false;
  private preloadTriggered = false;
  private sessionStartedAt: number | null = null;
  private sessionPlayed = false;
  private lastEndedAt: number | null = null;

  constructor(private readonly hooks: TTSAudioPlayerHooks) {}

  getSnapshot(): AudioElementSnapshot {
    return {
      paused: this.audio?.paused,
      ended: this.audio?.ended,
      time: this.audio?.currentTime,
      duration: this.audio?.duration,
      readyState: this.audio?.readyState,
    };
  }

  beginSession(): void {
    this.sessionStartedAt = performance.now();
    this.sessionPlayed = false;
    this.lastEndedAt = null;
  }

  hasEndedRecently(): boolean {
    return this.lastEndedAt !== null;
  }

  prepareSpeak(): void {
    this.sessionStartedAt ??= performance.now();
    ++this.speechId;
    this.wantsPlayback = true;
    this.preloadTriggered = false;
    this.replacingSource = true;
    this.audio?.pause();
  }

  setMarks(marks: TTSMark[]): void {
    this.marks = marks;
    this.markBoundaries = computeMarkBoundaries(marks);
  }

  clearReplacing(): void {
    this.replacingSource = false;
  }

  hasCurrentAudio(): boolean {
    const source = this.audioSource;
    return Boolean(
      source &&
        this.isCurrentSource(source) &&
        !source.decodeFailed &&
        !this.audio?.ended &&
        !this.audio?.error,
    );
  }

  hasEnded(): boolean {
    const source = this.audioSource;
    return Boolean(
      source &&
        this.isCurrentSource(source) &&
        !source.decodeFailed &&
        !this.audio?.error &&
        this.audio?.ended,
    );
  }

  needsResume(): boolean {
    return this.hasCurrentAudio() && Boolean(this.audio?.paused);
  }

  async playEntry(
    ssml: string,
    entry: CachedAudio,
    requestId: number,
  ): Promise<void> {
    const audio = this.getOrCreateAudio();
    const previousUrl = this.audioSource?.url;
    const source: PlaybackSource = {
      url: URL.createObjectURL(entry.blob),
      ssml,
      entry,
      speechId: this.speechId,
      decodeFailed: false,
    };
    this.audioSource = source;
    this.currentMarkIndex = -1;

    audio.onplay = () => {
      if (!this.isCurrentSource(source) || source.decodeFailed || audio.error) return;
      if (!this.wantsPlayback) {
        audio.pause();
        return;
      }
      if (audio.paused) return;
      this.replacingSource = false;
      this.hooks.setState('playing');
      this.updateCurrentMark(audio);
    };
    audio.onended = () => {
      if (!this.isCurrentSource(source) || source.decodeFailed || audio.error || !audio.ended) {
        return;
      }
      this.hooks.logMetric('audio.ended', { requestId });
      this.lastEndedAt = performance.now();
      this.preloadTriggered = false;
      if (this.hooks.getState() === 'playing') this.hooks.onEnd();
    };
    audio.onerror = () => {
      // The same element may deliver an old error event after its src changes.
      // Changing src resets MediaError, so only act on an error still present.
      const code = audio.error?.code;
      if (!this.isCurrentSource(source) || !code) return;
      this.hooks.logMetric('audio.error', { requestId, code });
      if (code === 3 || code === 4) {
        this.handleDecodeError(source);
        return;
      }
      this.replacingSource = false;
      this.hooks.setState('paused');
    };
    audio.onpause = () => {
      this.hooks.logMetric('audio.pause', {
        requestId,
        paused: audio.paused,
        ended: audio.ended,
        replacing: this.replacingSource,
      });
      // A queued pause from the old source can arrive after play() has already
      // made the same element active again. Natural completion also emits pause.
      if (
        !this.isCurrentSource(source) ||
        this.replacingSource ||
        !audio.paused ||
        audio.ended
      ) {
        return;
      }
      if (this.hooks.getState() === 'playing') this.hooks.setState('paused');
    };
    audio.ontimeupdate = () => {
      if (!this.isCurrentSource(source) || source.decodeFailed || audio.error) return;
      this.updateCurrentMark(audio);
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      this.hooks.onTimeUpdate(audio.currentTime, duration);
      const config = this.hooks.getAdaptivePreloadConfig(duration);
      if (
        !this.preloadTriggered &&
        duration > 0 &&
        (audio.currentTime >= duration * config.progressThreshold ||
          duration - audio.currentTime <= config.remainingSeconds)
      ) {
        this.preloadTriggered = true;
        this.hooks.onPreloadTrigger();
      }
    };
    // Assign the new source directly. Emptying src/load() between sentences
    // tears down Android's active media session and is unnecessary here.
    audio.src = source.url;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    try {
      await this.startAudio(audio, source, requestId);
      if (requestId !== this.hooks.getPlaybackRequestId()) {
        throw new DOMException('Playback was cancelled', 'AbortError');
      }
      const now = performance.now();
      if (!this.sessionPlayed && this.sessionStartedAt !== null) {
        this.hooks.logMetric('first-audio', {
          latencyMs: Math.round(now - this.sessionStartedAt),
        });
        this.sessionPlayed = true;
      }
      if (this.lastEndedAt !== null) {
        this.hooks.logMetric('chunk-gap', { gapMs: Math.round(now - this.lastEndedAt) });
        this.lastEndedAt = null;
      }
      this.hooks.logMetric('audio.play-resolved', { requestId });
    } catch (error) {
      this.hooks.logMetric('audio.play-rejected', {
        requestId,
        name: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  pause(): void {
    this.wantsPlayback = false;
    this.replacingSource = false;
    this.audio?.pause();
  }

  async resume(requestId: number): Promise<void> {
    const source = this.audioSource;
    const audio = this.audio;
    if (!audio || !source || !this.hasCurrentAudio()) {
      throw new Error('当前音频需要重新准备');
    }
    // Actual element state is authoritative, including when a browser has
    // paused playback before the page received the corresponding event.
    this.wantsPlayback = true;
    await this.startAudio(audio, source, requestId);
  }

  stop(): void {
    this.wantsPlayback = false;
    this.replacingSource = false;
    const source = this.audioSource;
    this.audioSource = null;
    if (this.audio) {
      this.audio.onplay = null;
      this.audio.onpause = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.ontimeupdate = null;
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (source) URL.revokeObjectURL(source.url);
    this.preloadTriggered = false;
    this.currentMarkIndex = -1;
    this.marks = [];
    this.markBoundaries = [];
    this.sessionStartedAt = null;
    this.sessionPlayed = false;
    this.lastEndedAt = null;
  }

  private getOrCreateAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.autoplay = false;
      this.audio.setAttribute('playsinline', 'true');
      this.audio.setAttribute('webkit-playsinline', 'true');
      this.audio.crossOrigin = 'anonymous';
    }
    return this.audio;
  }

  private isCurrentSource(source: PlaybackSource): boolean {
    return (
      this.audioSource === source &&
      this.speechId === source.speechId &&
      this.audio?.src === source.url
    );
  }

  private handleDecodeError(source: PlaybackSource): void {
    if (!this.isCurrentSource(source) || source.decodeFailed) return;
    source.decodeFailed = true;
    this.replacingSource = false;
    this.audio?.pause();
    this.hooks.setState('paused');
    this.hooks.onDecodeError(source.ssml, source.entry);
  }

  private updateCurrentMark(audio: HTMLAudioElement): void {
    if (!this.marks.length) return;
    const progress =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.min(audio.currentTime / audio.duration, 1)
        : 0;
    const index = findMarkIndexAtProgress(this.markBoundaries, this.marks.length, progress);
    if (this.currentMarkIndex !== index) {
      this.currentMarkIndex = index;
      this.hooks.onMarkChange(this.marks[index], index);
    }
  }

  private async startAudio(
    audio: HTMLAudioElement,
    source: PlaybackSource,
    requestId: number,
  ): Promise<void> {
    try {
      if (audio.paused) await audio.play();
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
      if (
        requestId === this.hooks.getPlaybackRequestId() &&
        (audio.error?.code === 3 || audio.error?.code === 4 || name === 'NotSupportedError')
      ) {
        this.handleDecodeError(source);
      }
      throw error;
    }
    if (requestId !== this.hooks.getPlaybackRequestId() || !this.wantsPlayback) {
      throw new DOMException('Playback was cancelled', 'AbortError');
    }
    if (audio.error?.code === 3 || audio.error?.code === 4) this.handleDecodeError(source);
    if (source.decodeFailed) throw new Error('音频解码失败');
    this.replacingSource = false;
    this.hooks.setState('playing');
  }
}
