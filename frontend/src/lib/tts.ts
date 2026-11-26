'use client';

import { recordTTSDiagnostic } from '@/lib/tts-diagnostics';
import { claimTTSAudioFocus } from '@/lib/tts-audio-focus';
import { TTSAudioPlayer } from './tts/audio-player';
import { TTSAudioFetcher } from './tts/fetcher';
import { TTSPreloadManager } from './tts/preloader';
import { loadTTSSettings, saveTTSSettings } from './tts/settings';
import { isSSMLTooLarge, stripSSML } from './tts/ssml';
import type {
  TTSMark,
  TTSMetricDetail,
  TTSSettings,
  TTSState,
} from './tts/types';

export type {
  TTSHighlightMode,
  TTSMark,
  TTSSettings,
  TTSState,
  Voice,
} from './tts/types';
export { FALLBACK_ZH_VOICES } from './tts/types';
export {
  loadTTSSettings,
  mergeVoicesWithFallback,
  saveTTSSettings,
} from './tts/settings';
export {
  buildAzureSSML,
  getTextFromSSML,
  isSkippableTTSText,
} from './tts/ssml';

export class BackendTTS {
  private settings: TTSSettings;
  private state: TTSState = 'stopped';
  private playbackRequestId = 0;
  private playbackWaitController: AbortController | null = null;
  private releaseAudioFocus: (() => void) | null = null;

  private onStateChange: ((state: TTSState) => void) | null = null;
  private onMarkChange: ((mark: TTSMark, index: number) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private onDecodeError: ((ssml: string) => void) | null = null;
  private onTimeUpdate: ((currentTime: number, duration: number) => void) | null = null;
  private onPreloadTrigger: (() => void) | null = null;

  private readonly fetcher = new TTSAudioFetcher();
  private readonly preloader: TTSPreloadManager;
  private readonly player: TTSAudioPlayer;

  constructor() {
    this.settings = loadTTSSettings();
    this.preloader = new TTSPreloadManager(this.fetcher, (event, detail) => {
      this.logMetric(event, detail);
    });
    this.player = new TTSAudioPlayer({
      getState: () => this.state,
      setState: (state) => this.setState(state),
      getPlaybackRequestId: () => this.playbackRequestId,
      getAdaptivePreloadConfig: (duration) => this.preloader.getAdaptivePreloadConfig(duration),
      logMetric: (event, detail) => this.logMetric(event, detail),
      onMarkChange: (mark, index) => this.onMarkChange?.(mark, index),
      onEnd: () => this.onEnd?.(),
      onDecodeError: (ssml, entry) => {
        this.preloader.deleteCorruptEntry(ssml, entry);
        this.onDecodeError?.(ssml);
      },
      onTimeUpdate: (time, duration) => this.onTimeUpdate?.(time, duration),
      onPreloadTrigger: () => this.onPreloadTrigger?.(),
    });
  }

  private logMetric(event: string, detail?: TTSMetricDetail): void {
    recordTTSDiagnostic(event, {
      state: this.state,
      ...this.player.getSnapshot(),
      ...detail,
    });
    if (process.env.NODE_ENV !== 'development') return;

    const payload = { ...this.preloader.getQueueMetrics(), ...detail };
    console.info(`[tts-metric] ${event}`, payload);
  }

  onPreloadTriggerCallback(cb: () => void): void {
    this.onPreloadTrigger = cb;
  }

  setSettings(settings: Partial<TTSSettings>): void {
    this.settings = { ...this.settings, ...settings };
    saveTTSSettings(this.settings);
  }

  getSettings(): TTSSettings {
    return this.settings;
  }

  beginSession(): void {
    this.player.beginSession();
  }

  setState(state: TTSState): void {
    if (this.state === state) return;
    this.state = state;
    this.logMetric('state-change', { state });
    this.onStateChange?.(state);
  }

  getState(): TTSState {
    return this.state;
  }

  onStateChangeCallback(cb: (state: TTSState) => void): void {
    this.onStateChange = cb;
  }

  onMarkChangeCallback(cb: (mark: TTSMark, index: number) => void): void {
    this.onMarkChange = cb;
  }

  onEndCallback(cb: () => void): void {
    this.onEnd = cb;
  }

  onDecodeErrorCallback(cb: ((ssml: string) => void) | null): void {
    this.onDecodeError = cb;
  }

  onTimeUpdateCallback(cb: (currentTime: number, duration: number) => void): void {
    this.onTimeUpdate = cb;
  }

  async speak(
    ssml: string,
    marks?: TTSMark[],
    isContinuous?: boolean,
    refreshAudio = false,
  ): Promise<void> {
    if (isSSMLTooLarge(ssml)) throw new Error('当前段落过长，无法直接朗读');
    this.releaseAudioFocus = claimTTSAudioFocus(this, () => this.pause());

    const requestId = ++this.playbackRequestId;
    this.playbackWaitController?.abort();
    const waitController = new AbortController();
    this.playbackWaitController = waitController;
    this.fetcher.abortActive();
    this.player.prepareSpeak();
    const speechMarks = marks?.length ? marks : [{ name: '0', text: stripSSML(ssml) }];

    try {
      const cached = refreshAudio ? undefined : this.preloader.getCached(ssml);
      // Share only this chunk's in-flight prefetch. Other future requests must
      // never block playback, navigation, pause, or stop.
      if (!refreshAudio && !cached && this.preloader.hasInFlight(ssml)) {
        await this.preloader.waitForInFlight(ssml, waitController.signal);
        if (requestId !== this.playbackRequestId) {
          throw new DOMException('Playback was cancelled', 'AbortError');
        }
      }
      const preloaded = refreshAudio ? undefined : this.preloader.takePreloaded(ssml);
      let blob = cached?.blob ?? preloaded?.blob;
      if (!blob) {
        this.preloader.recordPreloadMiss(isContinuous);
        if (this.player.hasEndedRecently()) this.logMetric('buffer-miss');
        const start = performance.now();
        blob = await this.fetcher.fetchActive(ssml, refreshAudio);
        this.preloader.recordSynthesisLatency(performance.now() - start);
      } else {
        this.preloader.recordPreloadHit();
      }
      if (requestId !== this.playbackRequestId) {
        throw new DOMException('Playback was cancelled', 'AbortError');
      }
      this.player.setMarks(speechMarks);
      const entry = cached ?? { blob, marks: speechMarks };
      if (!cached) this.preloader.setCached(ssml, entry);
      this.logMetric('speak.ready', {
        requestId,
        continuous: Boolean(isContinuous),
        source: cached ? 'cache' : preloaded ? 'preload' : 'network',
        bytes: blob.size,
      });
      await this.player.playEntry(ssml, entry, requestId);
    } catch (error) {
      if (requestId === this.playbackRequestId) {
        this.player.clearReplacing();
        this.setState('paused');
      }
      throw error;
    }
  }

  hasAudio(ssml: string): boolean {
    return this.preloader.hasAudio(ssml);
  }

  hasCurrentAudio(): boolean {
    return this.player.hasCurrentAudio();
  }

  hasEnded(): boolean {
    return this.player.hasEnded();
  }

  needsResume(): boolean {
    return this.player.needsResume();
  }

  async preloadMultiple(ssmlList: string[]): Promise<void> {
    return this.preloader.preloadMultiple(ssmlList);
  }

  clearPreload(): void {
    this.preloader.clearAll();
  }

  clearPreloadQueueOnly(): void {
    this.preloader.clearPreloadQueue();
  }

  getPreloadQueueLength(): number {
    return this.preloader.getPreloadQueueLength();
  }

  pause(): void {
    this.releaseAudioFocus?.();
    this.releaseAudioFocus = null;
    this.playbackWaitController?.abort();
    ++this.playbackRequestId;
    this.fetcher.abortActive();
    this.player.pause();
    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (!this.player.hasCurrentAudio()) throw new Error('当前音频需要重新准备');
    this.releaseAudioFocus = claimTTSAudioFocus(this, () => this.pause());
    const requestId = ++this.playbackRequestId;
    await this.player.resume(requestId);
  }

  stop(): void {
    this.releaseAudioFocus?.();
    this.releaseAudioFocus = null;
    this.playbackWaitController?.abort();
    this.playbackWaitController = null;
    ++this.playbackRequestId;
    this.fetcher.abortActive();
    this.setState('stopped');
    this.player.stop();
  }
}

export const backendTTS = new BackendTTS();
