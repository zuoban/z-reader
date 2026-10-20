'use client';

import { API_BASE, createAbortController } from '@/lib/config';
import { getAuthHeaders, handleAuthResponse } from '@/lib/api';
import { recordTTSDiagnostic } from '@/lib/tts-diagnostics';
import { enhanceProsodyBreaks } from '@/lib/tts-text';
import { classifyTTSError, parseTTSRetryAfter, TTSRequestError } from '@/lib/tts-request';
import { claimTTSAudioFocus } from '@/lib/tts-audio-focus';

export type TTSState = 'stopped' | 'playing' | 'paused';
export type TTSHighlightMode = 'word' | 'sentence';

export interface TTSSettings {
  rate: number;
  voiceName: string;
  style?: string;
  highlightMode: TTSHighlightMode;
}

export interface TTSMark {
  name: string;
  text: string;
  range?: Range;
  cfi?: string;
  sentenceIndex?: number;
  sentenceCfi?: string;
  sentenceText?: string;
  weight?: number;
}

export interface Voice {
  Name: string;
  DisplayName: string;
  LocalName: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  StyleList?: string[];
}

export const FALLBACK_ZH_VOICES: Voice[] = [
  {
    Name: 'zh-CN-XiaoxiaoMultilingualNeural',
    DisplayName: 'Xiaoxiao Multilingual',
    LocalName: '晓晓 多语种',
    ShortName: 'zh-CN-XiaoxiaoMultilingualNeural',
    Gender: 'Female',
    Locale: 'zh-CN',
    StyleList: ['general', 'assistant', 'chat', 'customerservice', 'newscast'],
  },
  {
    Name: 'zh-CN-XiaoyiNeural',
    DisplayName: 'Xiaoyi',
    LocalName: '晓伊',
    ShortName: 'zh-CN-XiaoyiNeural',
    Gender: 'Female',
    Locale: 'zh-CN',
    StyleList: ['general', 'assistant', 'chat'],
  },
  {
    Name: 'zh-CN-YunxiNeural',
    DisplayName: 'Yunxi',
    LocalName: '云希',
    ShortName: 'zh-CN-YunxiNeural',
    Gender: 'Male',
    Locale: 'zh-CN',
    StyleList: ['general', 'assistant', 'chat', 'newscast'],
  },
];

const TTS_SETTINGS_KEY = 'z-reader-tts-settings';
const MAX_BACKEND_SSML_BYTES = 32 * 1024;

const DEFAULT_SETTINGS: TTSSettings = {
  rate: 0,
  voiceName: 'zh-CN-XiaoxiaoMultilingualNeural',
  style: 'general',
  highlightMode: 'word',
};

function getUTF8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function isSSMLTooLarge(ssml: string): boolean {
  return getUTF8ByteLength(ssml) > MAX_BACKEND_SSML_BYTES;
}

export function loadTTSSettings(): TTSSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem(TTS_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.error('Failed to load TTS settings from localStorage:', err);
  }
  return DEFAULT_SETTINGS;
}

export function saveTTSSettings(settings: TTSSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save TTS settings to localStorage:', err);
  }
}

export function mergeVoicesWithFallback(voices: Voice[], preferredVoiceName?: string): Voice[] {
  const merged = new Map<string, Voice>();

  for (const voice of [...FALLBACK_ZH_VOICES, ...voices]) {
    const name = voice.ShortName || voice.Name;
    merged.set(name, { ...voice, Name: name, ShortName: name });
  }

  if (preferredVoiceName && !merged.has(preferredVoiceName)) {
    merged.set(preferredVoiceName, {
      Name: preferredVoiceName,
      DisplayName: preferredVoiceName,
      LocalName: preferredVoiceName,
      ShortName: preferredVoiceName,
      Gender: '',
      Locale: preferredVoiceName.startsWith('zh-') ? 'zh-CN' : '',
      StyleList: ['general'],
    });
  }

  return Array.from(merged.values());
}

function stripSSML(ssml: string): string {
  return ssml
    .replace(/<\/?speak[^>]*>/gi, '')
    .replace(/<\/?mark[^>]*>/gi, '')
    .replace(/<\/?emphasis[^>]*>/gi, '')
    .replace(/<\/?break[^>]*>/gi, ' ')
    .replace(/<\/?phoneme[^>]*>/gi, '')
    .replace(/<\/?lang[^>]*>/gi, '')
    .replace(/<\/?voice[^>]*>/gi, '')
    .replace(/<\/?prosody[^>]*>/gi, '')
    .replace(/<\/?mstts:[^>]*>/gi, '')
    .replace(/<\/?bookmark[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function inferLocaleFromVoice(voiceName: string): string {
  const match = voiceName.match(/^([a-z]{2,3}-[A-Z]{2})-/);
  return match?.[1] ?? 'zh-CN';
}

function createParserErrorFreeDocument(source: string): XMLDocument | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return null;
  }

  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return null;
  }

  return doc;
}

export function getTextFromSSML(ssml: string): string {
  const doc = createParserErrorFreeDocument(ssml);
  const text = doc?.documentElement?.textContent?.trim();
  return text || stripSSML(ssml);
}

function getSignificantLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isTableLikeTTSText(text: string): boolean {
  const lines = getSignificantLines(text);
  if (lines.length < 2) return false;

  const tableLines = lines.filter((line) => {
    const pipeCount = (line.match(/\|/g) ?? []).length;
    const tabCount = (line.match(/\t/g) ?? []).length;
    const multiSpaceColumns = (line.match(/\S\s{2,}\S/g) ?? []).length;
    return pipeCount >= 2 || tabCount >= 2 || multiSpaceColumns >= 2;
  });

  return tableLines.length >= 2 && tableLines.length / lines.length >= 0.5;
}

function isCodeLikeTTSText(text: string): boolean {
  const lines = getSignificantLines(text);
  if (lines.length < 2) return false;

  const codeLinePatterns = [
    /^\s*(import|export|const|let|var|function|class|interface|type|return)\b/,
    /^\s*(if|else|for|while|switch|case|try|catch|finally)\b/,
    /^\s*(public|private|protected|static|async|await)\b/,
    /^\s*[{}[\]();,]+$/,
    /=>|===|!==|&&|\|\||<\/?[a-z][\w:-]*[^>]*>/i,
    /^\s*["']?[\w-]+["']?\s*:\s*["'{[\d]/,
  ];

  const codeLines = lines.filter((line) => {
    const symbolCount = (line.match(/[{}[\]();=<>/&|:]/g) ?? []).length;
    const symbolRatio = symbolCount / Math.max(line.length, 1);
    return codeLinePatterns.some((pattern) => pattern.test(line)) || symbolRatio > 0.24;
  });

  return codeLines.length >= 2 && codeLines.length / lines.length >= 0.5;
}

export function isSkippableTTSText(text: string): boolean {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, '')
    .trim();

  if (!normalized) return true;

  const compact = normalized.replace(/\s+/g, '');
  if (/^[·•*_\-.。．…]+$/.test(compact)) return true;
  if (/^[\p{P}\p{S}]+$/u.test(compact) && compact.length <= 8) return true;
  if (/^\.{3,}$/.test(compact) || /^…+$/.test(compact)) return true;
  if (isTableLikeTTSText(text)) return true;
  if (isCodeLikeTTSText(text)) return true;

  return false;
}

export function buildAzureSSML(content: string, settings: TTSSettings): string {
  const rateStr = settings.rate >= 0 ? `+${settings.rate}%` : `${settings.rate}%`;
  const originalDoc = createParserErrorFreeDocument(content);
  const originalRoot = originalDoc?.documentElement;
  const originalIsSpeak = originalRoot?.localName.toLowerCase() === 'speak';
  const lang =
    originalRoot?.getAttribute('xml:lang') ||
    originalRoot?.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ||
    originalRoot?.getAttribute('lang') ||
    inferLocaleFromVoice(settings.voiceName);

  const doc = document.implementation.createDocument(
    'http://www.w3.org/2001/10/synthesis',
    'speak',
  );
  const speak = doc.documentElement;
  speak.setAttribute('version', '1.0');
  speak.setAttributeNS('http://www.w3.org/2000/xmlns/',
    'xmlns', 'http://www.w3.org/2001/10/synthesis');
  speak.setAttributeNS('http://www.w3.org/2000/xmlns/',
    'xmlns:mstts', 'http://www.w3.org/2001/mstts');
  speak.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', lang);

  const voice = doc.createElementNS('http://www.w3.org/2001/10/synthesis', 'voice');
  voice.setAttribute('name', settings.voiceName);
  speak.appendChild(voice);

  const speechContainer = settings.style
    ? doc.createElementNS('http://www.w3.org/2001/mstts', 'mstts:express-as')
    : voice;

  if (settings.style && speechContainer instanceof Element) {
    speechContainer.setAttribute('style', settings.style);
    speechContainer.setAttribute('styledegree', '1.0');
    voice.appendChild(speechContainer);
  }

  const prosody = doc.createElementNS('http://www.w3.org/2001/10/synthesis', 'prosody');
  prosody.setAttribute('rate', rateStr);
  speechContainer.appendChild(prosody);

  if (originalDoc && originalRoot) {
    const sourceNodes = originalIsSpeak ? originalRoot.childNodes : originalDoc.childNodes;
    Array.from(sourceNodes).forEach((node) => {
      prosody.appendChild(doc.importNode(node, true));
    });
    Array.from(prosody.getElementsByTagName('mark')).forEach((mark) => {
      const name = mark.getAttribute('name');
      if (!name) return;

      const bookmark = doc.createElementNS(
        'http://www.w3.org/2001/10/synthesis',
        'bookmark',
      );
      bookmark.setAttribute('mark', name);
      mark.replaceWith(bookmark);
    });
  } else {
    prosody.appendChild(doc.createTextNode(content));
  }

  // Monolingual voices reject lang elements. Multilingual voices can detect
  // language from the text, so keep the contents without a language override.
  Array.from(prosody.getElementsByTagNameNS('*', 'lang')).forEach((language) => {
    language.replaceWith(...Array.from(language.childNodes));
  });

  enhanceProsodyBreaks(doc, prosody);

  return new XMLSerializer().serializeToString(doc);
}

interface PreloadedAudio {
  blob: Blob;
  ssml: string;
  marks: TTSMark[];
  timestamp: number;
}

interface CachedAudio {
  blob: Blob;
  marks: TTSMark[];
}

interface PreloadTask {
  ssml: string;
  marks?: TTSMark[];
  resolve: () => void;
}

type TTSMetricDetail = Record<string, string | number | boolean | null | undefined>;

interface AdaptivePreloadConfig {
  progressThreshold: number;
  remainingSeconds: number;
  reason: string;
}

class LRUCache<T> {
  private cache: Map<string, { data: T; release?: () => void }> = new Map();
  private maxSize: number;
  
  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }
  
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.data;
    }
    return undefined;
  }
  
  set(key: string, value: T, release?: () => void): void {
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key);
      oldEntry?.release?.();
      this.cache.delete(key);
    }
    this.cache.set(key, { data: value, release });
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const entry = this.cache.get(firstKey);
        entry?.release?.();
        this.cache.delete(firstKey);
      }
    }
  }
  
  has(key: string): boolean {
    return this.cache.has(key);
  }
  
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    entry?.release?.();
    return this.cache.delete(key);
  }
  
  clear(): void {
    for (const entry of this.cache.values()) {
      entry?.release?.();
    }
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

export class BackendTTS {
  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private settings: TTSSettings;
  private state: TTSState = 'stopped';
  private currentMarkIndex: number = 0;
  private marks: TTSMark[] = [];
  private onStateChange: ((state: TTSState) => void) | null = null;
  private onMarkChange: ((mark: TTSMark, index: number) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private onTimeUpdate: ((currentTime: number, duration: number) => void) | null = null;
  private currentSSML: string = '';
  private audioSSML: string = '';
  private speechId = 0;
  private audioSpeechId = -1;
  private abortController: AbortController | null = null;
  
  private preloadedQueue: PreloadedAudio[] = [];
  private maxPreloadCount: number = 6;
  private maxPreloadConcurrency: number = 2;
  private activePreloadCount: number = 0;
  private pendingPreloadTasks: PreloadTask[] = [];
  private queuedPreloadKeys: Set<string> = new Set();
  private preloadAbortControllers: Map<string, AbortController> = new Map();
  private preloadPromises = new Map<string, Promise<void>>();
  
  private audioCache: LRUCache<CachedAudio> = new LRUCache(10);
  private preloadTriggered: boolean = false;
  private preloadProgressThreshold: number = 0.28;
  private preloadRemainingSeconds: number = 12;
  private synthesisLatencySamples: number[] = [];
  private maxSynthesisLatencySamples: number = 8;
  private consecutivePreloadMisses: number = 0;
  private playbackRequestId = 0;
  private replacingSource = false;
  private wantsPlayback = false;
  private playbackWaitController: AbortController | null = null;
  private sessionStartedAt: number | null = null;
  private sessionPlayed = false;
  private lastEndedAt: number | null = null;
  private markBoundaries: number[] = [];
  private providerRetryNotBefore = 0;
  private providerRetryError: TTSRequestError | null = null;
  private releaseAudioFocus: (() => void) | null = null;

  private onPreloadTrigger: (() => void) | null = null;

  private logMetric(event: string, detail?: TTSMetricDetail): void {
    recordTTSDiagnostic(event, {
      state: this.state, paused: this.audio?.paused, ended: this.audio?.ended,
      time: this.audio?.currentTime, duration: this.audio?.duration,
      readyState: this.audio?.readyState, ...detail,
    });
    if (process.env.NODE_ENV !== 'development') return;

    const queueDetail = {
      preloaded: this.preloadedQueue.length,
      queued: this.pendingPreloadTasks.length,
      activePreloads: this.activePreloadCount,
    };
    const payload = { ...queueDetail, ...detail };
    console.info(`[tts-metric] ${event}`, payload);
  }
  
  onPreloadTriggerCallback(cb: () => void): void {
    this.onPreloadTrigger = cb;
  }
  
  constructor() {
    this.settings = loadTTSSettings();
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

  setSettings(settings: Partial<TTSSettings>): void {
    this.settings = { ...this.settings, ...settings };
    saveTTSSettings(this.settings);
  }

  getSettings(): TTSSettings {
    return this.settings;
  }

  beginSession(): void {
    this.sessionStartedAt = performance.now();
    this.sessionPlayed = false;
    this.lastEndedAt = null;
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

  onTimeUpdateCallback(cb: (currentTime: number, duration: number) => void): void {
    this.onTimeUpdate = cb;
  }

  private releaseAudioUrl(): void {
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
  }

  private trimPreloadQueue(): void {
    while (this.preloadedQueue.length > this.maxPreloadCount) {
      this.preloadedQueue.shift();
    }
  }

  private releaseAllPreloadedAudio(): void {
    this.preloadedQueue = [];
  }

  private recordSynthesisLatency(latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs <= 0) return;

    this.synthesisLatencySamples.push(latencyMs);
    if (this.synthesisLatencySamples.length > this.maxSynthesisLatencySamples) {
      this.synthesisLatencySamples.shift();
    }
  }

  private getAverageSynthesisLatency(): number {
    if (this.synthesisLatencySamples.length === 0) return 0;

    const total = this.synthesisLatencySamples.reduce((sum, value) => sum + value, 0);
    return total / this.synthesisLatencySamples.length;
  }

  private getAdaptivePreloadConfig(duration: number): AdaptivePreloadConfig {
    const averageLatency = this.getAverageSynthesisLatency();
    let progressThreshold = this.preloadProgressThreshold;
    let remainingSeconds = this.preloadRemainingSeconds;
    let reason = 'default';

    if (averageLatency > 5000) {
      progressThreshold = 0.12;
      remainingSeconds = 20;
      reason = 'slow-synthesis';
    } else if (averageLatency > 2500) {
      progressThreshold = 0.2;
      remainingSeconds = 15;
      reason = 'moderate-synthesis';
    } else if (averageLatency > 0 && averageLatency < 1000 && this.consecutivePreloadMisses === 0) {
      progressThreshold = 0.42;
      remainingSeconds = 8;
      reason = 'fast-synthesis';
    }

    if (this.consecutivePreloadMisses >= 2) {
      progressThreshold = Math.min(progressThreshold, 0.16);
      remainingSeconds = Math.max(remainingSeconds, 18);
      reason = 'preload-misses';
    }

    if (duration > 0 && duration <= 18) {
      progressThreshold = 0.05;
      remainingSeconds = Math.max(1, duration - 1);
      reason = 'short-audio';
    }

    return { progressThreshold, remainingSeconds, reason };
  }

  async speak(ssml: string, marks?: TTSMark[], isContinuous?: boolean): Promise<void> {
    if (isSSMLTooLarge(ssml)) throw new Error('当前段落过长，无法直接朗读');
    this.releaseAudioFocus = claimTTSAudioFocus(this, () => this.pause());

    const requestId = ++this.playbackRequestId;
    this.playbackWaitController?.abort();
    const waitController = new AbortController();
    this.playbackWaitController = waitController;
    this.sessionStartedAt ??= performance.now();
    ++this.speechId;
    this.wantsPlayback = true;
    this.abortController?.abort();
    this.currentSSML = ssml;
    this.preloadTriggered = false;
    this.replacingSource = true;
    this.audio?.pause();
    const speechMarks = marks?.length ? marks : [{ name: '0', text: stripSSML(ssml) }];

    try {
      const cached = this.audioCache.get(ssml);
      // Share only this chunk's in-flight prefetch. Other future requests must
      // never block playback, navigation, pause, or stop.
      if (!cached && this.preloadPromises.has(ssml)) {
        const prefetch = this.preloadPromises.get(ssml)!;
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('朗读操作已取消'), {
            name: 'AbortError',
          }));
          waitController.signal.addEventListener('abort', abort, { once: true });
          void prefetch.then(() => {
            waitController.signal.removeEventListener('abort', abort);
            resolve();
          }, error => {
            waitController.signal.removeEventListener('abort', abort);
            reject(error);
          });
        });
        if (requestId !== this.playbackRequestId) {
          throw new DOMException('Playback was cancelled', 'AbortError');
        }
      }
      const preloadedIndex = this.preloadedQueue.findIndex(item => item.ssml === ssml);
      const preloaded = preloadedIndex >= 0
        ? this.preloadedQueue.splice(preloadedIndex, 1)[0]
        : undefined;
      let blob = cached?.blob ?? preloaded?.blob;
      if (!blob) {
        this.consecutivePreloadMisses += isContinuous ? 1 : 0;
        if (this.lastEndedAt !== null) this.logMetric('buffer-miss');
        const start = performance.now();
        blob = await this.fetchAudioBlob(ssml);
        this.recordSynthesisLatency(performance.now() - start);
      } else {
        this.consecutivePreloadMisses = 0;
      }
      if (requestId !== this.playbackRequestId) {
        throw new DOMException('Playback was cancelled', 'AbortError');
      }
      this.marks = speechMarks;
      const totalWeight = speechMarks.reduce((sum, mark) => sum +
        Math.max(0.001, mark.weight ?? mark.text.length), 0);
      let cumulative = 0;
      this.markBoundaries = speechMarks.map(mark => {
        cumulative += Math.max(0.001, mark.weight ?? mark.text.length);
        return cumulative / totalWeight;
      });
      this.audioCache.set(ssml, { blob, marks: speechMarks });
      this.logMetric('speak.ready', {
        requestId, continuous: Boolean(isContinuous),
        source: cached ? 'cache' : preloaded ? 'preload' : 'network', bytes: blob.size,
      });
      await this.playAudio(blob, requestId);
    } catch (error) {
      if (requestId === this.playbackRequestId) {
        this.replacingSource = false;
        this.setState('paused');
      }
      throw error;
    }
  }

  private async fetchAudioBlob(ssml: string): Promise<Blob> {
    const { controller, timeoutId } = createAbortController(65000);
    this.abortController = controller;
    try {
      return await this.fetchAudioBlobWithController(ssml, controller);
    } finally {
      clearTimeout(timeoutId);
      if (this.abortController === controller) this.abortController = null;
    }
  }

  private updateCurrentMark(audio: HTMLAudioElement): void {
    if (!this.marks.length) return;
    const progress = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.min(audio.currentTime / audio.duration, 1) : 0;
    let low = 0;
    let high = this.marks.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (progress < this.markBoundaries[middle]) high = middle;
      else low = middle + 1;
    }
    const index = low;
    if (this.currentMarkIndex !== index) {
      this.currentMarkIndex = index;
      this.onMarkChange?.(this.marks[index], index);
    }
  }

  private async playAudio(blob: Blob, requestId: number): Promise<void> {
    const audio = this.getOrCreateAudio();
    const previousUrl = this.audioUrl;
    const audioUrl = URL.createObjectURL(blob);
    this.audioUrl = audioUrl;
    this.audioSSML = this.currentSSML;
    this.audioSpeechId = this.speechId;
    this.currentMarkIndex = -1;

    audio.onplay = () => {
      if (this.audioUrl !== audioUrl) return;
      if (!this.wantsPlayback) { audio.pause(); return; }
      this.replacingSource = false;
      this.setState('playing');
      this.updateCurrentMark(audio);
    };
    audio.onended = () => {
      if (this.audioUrl !== audioUrl || !audio.ended) return;
      this.logMetric('audio.ended', { requestId });
      this.lastEndedAt = performance.now();
      this.preloadTriggered = false;
      if (this.state === 'playing') this.onEnd?.();
    };
    audio.onerror = () => {
      if (this.audioUrl !== audioUrl) return;
      this.logMetric('audio.error', { requestId, code: audio.error?.code });
      this.replacingSource = false;
      this.setState('paused');
    };
    audio.onpause = () => {
      this.logMetric('audio.pause', {
        requestId, paused: audio.paused, ended: audio.ended, replacing: this.replacingSource,
      });
      // A queued pause from the old source can arrive after play() has already
      // made the same element active again. Natural completion also emits pause.
      if (this.audioUrl !== audioUrl || this.replacingSource ||
          !audio.paused || audio.ended) return;
      if (this.state === 'playing') this.setState('paused');
    };
    audio.ontimeupdate = () => {
      if (this.audioUrl !== audioUrl) return;
      this.updateCurrentMark(audio);
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      this.onTimeUpdate?.(audio.currentTime, duration);
      const config = this.getAdaptivePreloadConfig(duration);
      if (!this.preloadTriggered && duration > 0 &&
          (audio.currentTime >= duration * config.progressThreshold ||
            duration - audio.currentTime <= config.remainingSeconds)) {
        this.preloadTriggered = true;
        this.onPreloadTrigger?.();
      }
    };
    // Assign the new source directly. Emptying src/load() between sentences
    // tears down Android's active media session and is unnecessary here.
    audio.src = audioUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    try {
      await audio.play();
      if (requestId !== this.playbackRequestId) {
        throw new DOMException('Playback was cancelled', 'AbortError');
      }
      this.replacingSource = false;
      this.setState('playing');
      const now = performance.now();
      if (!this.sessionPlayed && this.sessionStartedAt !== null) {
        this.logMetric('first-audio', { latencyMs: Math.round(now - this.sessionStartedAt) });
        this.sessionPlayed = true;
      }
      if (this.lastEndedAt !== null) {
        this.logMetric('chunk-gap', { gapMs: Math.round(now - this.lastEndedAt) });
        this.lastEndedAt = null;
      }
      this.logMetric('audio.play-resolved', { requestId });
    } catch (error) {
      this.logMetric('audio.play-rejected', {
        requestId, name: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  hasAudio(ssml: string): boolean {
    return this.audioCache.has(ssml) || this.preloadedQueue.some(item => item.ssml === ssml);
  }

  hasCurrentAudio(): boolean {
    return Boolean(this.audioUrl && this.audioSpeechId === this.speechId &&
      this.audioSSML === this.currentSSML &&
      this.audio?.src && !this.audio.ended && !this.audio.error);
  }

  hasEnded(): boolean {
    return this.audioSpeechId === this.speechId && Boolean(this.audio?.ended);
  }

  needsResume(): boolean {
    return this.hasCurrentAudio() && Boolean(this.audio?.paused);
  }

  async preload(ssml: string, marks?: TTSMark[]): Promise<void> {
    if (!ssml) return;
    if (isSSMLTooLarge(ssml)) {
      this.logMetric('preload.skipped-too-large', { ssmlBytes: getUTF8ByteLength(ssml) });
      return;
    }
    
    if (this.audioCache.has(ssml)) return;
    
    if (this.preloadedQueue.some(p => p.ssml === ssml)) return;
    const existing = this.preloadPromises.get(ssml);
    if (existing) return existing;

    const promise = new Promise<void>((resolve) => {
      this.queuedPreloadKeys.add(ssml);
      this.pendingPreloadTasks.push({ ssml, marks, resolve });
      this.logMetric('preload.enqueued', {
        ssmlBytes: ssml.length,
      });
      this.pumpPreloadQueue();
    });
    this.preloadPromises.set(ssml, promise);
    void promise.finally(() => {
      if (this.preloadPromises.get(ssml) === promise) this.preloadPromises.delete(ssml);
    });
    return promise;
  }

  private pumpPreloadQueue(): void {
    while (
      this.activePreloadCount < this.maxPreloadConcurrency &&
      this.pendingPreloadTasks.length > 0
    ) {
      const task = this.pendingPreloadTasks.shift();
      if (!task) return;

      this.queuedPreloadKeys.delete(task.ssml);
      this.activePreloadCount += 1;
      this.logMetric('preload.started', {
        ssmlBytes: task.ssml.length,
      });
      void this.runPreloadTask(task).finally(() => {
        this.activePreloadCount = Math.max(0, this.activePreloadCount - 1);
        task.resolve();
        this.pumpPreloadQueue();
      });
    }
  }

  private async runPreloadTask(task: PreloadTask): Promise<void> {
    const { ssml, marks } = task;

    if (this.audioCache.has(ssml)) return;
    if (this.preloadedQueue.some(p => p.ssml === ssml)) return;

    const { controller, timeoutId } = createAbortController(65000);
    this.preloadAbortControllers.set(ssml, controller);
    const start = performance.now();
    
    try {
      const marksArray = marks && marks.length > 0
        ? marks
        : [{ name: '0', text: stripSSML(ssml) }];

      const blob = await this.fetchAudioBlobWithController(ssml, controller);
      if (controller.signal.aborted) return;
      const preloaded: PreloadedAudio = {
        blob,
        ssml,
        marks: marksArray,
        timestamp: Date.now(),
      };

      this.preloadedQueue.push(preloaded);
      this.trimPreloadQueue();
      const latencyMs = Math.round(performance.now() - start);
      this.recordSynthesisLatency(latencyMs);
      this.logMetric('preload.complete', {
        bytes: blob.size,
        latencyMs,
        averageLatencyMs: Math.round(this.getAverageSynthesisLatency()),
      });
    } catch (error) {
      if (classifyTTSError(error) === 'cancelled') {
        this.logMetric('preload.abort', {
          latencyMs: Math.round(performance.now() - start),
        });
        return;
      }
      this.logMetric('preload.error', {
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : String(error),
      });
      if (process.env.NODE_ENV === 'development') console.error('Preload failed:', error);
    } finally {
      clearTimeout(timeoutId);
      if (this.preloadAbortControllers.get(ssml) === controller) {
        this.preloadAbortControllers.delete(ssml);
      }
    }
  }

  private async fetchAudioBlobWithController(ssml: string, controller: AbortController): Promise<Blob> {
    if (this.providerRetryError && Date.now() < this.providerRetryNotBefore) {
      throw new TTSRequestError(this.providerRetryError.status, this.providerRetryError.code,
        this.providerRetryNotBefore - Date.now());
    }
    try {
      const response = await fetch(`${API_BASE}/api/ssml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          ssml: ssml,
          output_format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
        signal: controller.signal,
      });

      handleAuthResponse(response);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { code?: string } | null;
        const error = new TTSRequestError(response.status, body?.code,
          parseTTSRetryAfter(response.headers.get('Retry-After')));
        // A failed background prefetch must not discard a provider's cooldown.
        // It applies to every following chunk, including a different SSML key.
        if ([429, 503].includes(response.status) && error.retryAfterMs > 0) {
          const retryNotBefore = Date.now() + error.retryAfterMs;
          if (retryNotBefore > this.providerRetryNotBefore) {
            this.providerRetryNotBefore = retryNotBefore;
            this.providerRetryError = error;
          }
        }
        throw error;
      }

      return await response.blob();
    } catch (error) {
      // Keep names and status intact so timeout, cancellation, permission and
      // retryable provider errors can follow different recovery paths.
      throw error;
    }
  }

  async preloadMultiple(ssmlList: string[]): Promise<void> {
    const validList = ssmlList.filter(ssml => ssml && 
      !this.audioCache.has(ssml) && 
      !this.preloadedQueue.some(p => p.ssml === ssml));
    
    if (validList.length === 0) return;
    
    const toPreload = validList.slice(0, this.maxPreloadCount - this.preloadedQueue.length);
    if (toPreload.length === 0) return;
    
    const promises = toPreload.map(ssml => this.preload(ssml));
    await Promise.allSettled(promises);
  }

  cleanupIrrelevantPreloads(relevantSSMLs: string[]): void {
    const toRemove: string[] = [];
    
    this.preloadedQueue = this.preloadedQueue.filter(p => {
      const isRelevant = relevantSSMLs.includes(p.ssml);
      if (!isRelevant) {
        toRemove.push(p.ssml);
      }
      return isRelevant;
    });
    
    toRemove.forEach(ssml => this.cancelPreload(ssml));
    if (toRemove.length > 0) {
      this.logMetric('preload.cleanup-ready', {
        removed: toRemove.length,
      });
    }

    let removedPending = 0;
    this.pendingPreloadTasks = this.pendingPreloadTasks.filter((task) => {
      const isRelevant = relevantSSMLs.includes(task.ssml);
      if (!isRelevant) {
        this.queuedPreloadKeys.delete(task.ssml);
        task.resolve();
        removedPending += 1;
      }
      return isRelevant;
    });
    if (removedPending > 0) {
      this.logMetric('preload.cleanup-pending', {
        removed: removedPending,
      });
    }
  }

  cancelPreload(ssml: string): void {
    const controller = this.preloadAbortControllers.get(ssml);
    if (controller) {
      controller.abort();
      this.preloadAbortControllers.delete(ssml);
    }

    this.pendingPreloadTasks = this.pendingPreloadTasks.filter((task) => {
      if (task.ssml !== ssml) return true;
      this.queuedPreloadKeys.delete(task.ssml);
      task.resolve();
      return false;
    });
  }

  cancelAllPreloads(): void {
    for (const [, controller] of this.preloadAbortControllers) {
      controller.abort();
    }
    this.preloadAbortControllers.clear();
    this.preloadPromises.clear();
    this.pendingPreloadTasks.forEach((task) => {
      this.queuedPreloadKeys.delete(task.ssml);
      task.resolve();
    });
    this.pendingPreloadTasks = [];
  }

  clearPreloadQueue(): void {
    this.cancelAllPreloads();
    this.releaseAllPreloadedAudio();
  }

  private cleanupPreload(): void {
    this.clearPreloadQueue();
    this.audioCache.clear();
  }

  clearPreload(): void {
    this.cleanupPreload();
  }

  clearPreloadQueueOnly(): void {
    this.cancelAllPreloads();
    this.releaseAllPreloadedAudio();
  }

  getPreloadQueueLength(): number {
    return this.preloadedQueue.length;
  }

  pause(): void {
    this.releaseAudioFocus?.();
    this.releaseAudioFocus = null;
    this.wantsPlayback = false;
    this.playbackWaitController?.abort();
    ++this.playbackRequestId;
    this.abortController?.abort();
    this.abortController = null;
    this.replacingSource = false;
    this.setState('paused');
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    if (!this.hasCurrentAudio()) throw new Error('当前音频需要重新准备');
    this.releaseAudioFocus = claimTTSAudioFocus(this, () => this.pause());
    // Actual element state is authoritative, including when a browser has
    // paused playback before the page received the corresponding event.
    this.wantsPlayback = true;
    const requestId = ++this.playbackRequestId;
    if (this.audio?.paused) await this.audio.play();
    if (requestId !== this.playbackRequestId || !this.wantsPlayback) {
      throw Object.assign(new Error('朗读操作已取消'), { name: 'AbortError' });
    }
    this.setState('playing');
  }

  stop(): void {
    this.releaseAudioFocus?.();
    this.releaseAudioFocus = null;
    this.wantsPlayback = false;
    this.playbackWaitController?.abort();
    this.playbackWaitController = null;
    ++this.playbackRequestId;
    this.abortController?.abort();
    this.abortController = null;
    this.replacingSource = false;
    this.setState('stopped');
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
    this.releaseAudioUrl();
    this.preloadTriggered = false;
    this.currentMarkIndex = -1;
    this.marks = [];
    this.markBoundaries = [];
    this.currentSSML = '';
    this.audioSSML = '';
    this.audioSpeechId = -1;
    this.sessionStartedAt = null;
    this.sessionPlayed = false;
    this.lastEndedAt = null;
  }

  isSpeaking(): boolean {
    return this.state === 'playing';
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }
}

export const backendTTS = new BackendTTS();
