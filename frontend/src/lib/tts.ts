'use client';

import { API_BASE, createAbortController, isAbortLikeError } from '@/lib/config';
import { getAuthHeaders, handleAuthResponse } from '@/lib/api';

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

  for (const voice of [...voices, ...FALLBACK_ZH_VOICES]) {
    merged.set(voice.Name, voice);
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
  if (/^\d{1,4}$/.test(compact)) return true;
  if (/^[·•*_\-.。．…]+$/.test(compact)) return true;
  if (/^[\p{P}\p{S}]+$/u.test(compact) && compact.length <= 8) return true;
  if (/^\.{3,}$/.test(compact) || /^…+$/.test(compact)) return true;
  if (/^[·•*-]\d{1,4}$/.test(compact)) return true;
  if (isTableLikeTTSText(text)) return true;
  if (isCodeLikeTTSText(text)) return true;

  return false;
}

function normalizeTextNodeForTTS(text: string): string {
  return text
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\r?\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function getBreakTimeForCharacter(character: string): string | null {
  if ('，,、'.includes(character)) return '120ms';
  if ('；;'.includes(character)) return '220ms';
  if ('：:'.includes(character)) return '180ms';
  if ('。.!！？?'.includes(character)) return '320ms';
  if (character === '…') return '260ms';
  return null;
}

function createBreakElement(doc: XMLDocument, time: string): Element {
  const breakElement = doc.createElementNS(
    'http://www.w3.org/2001/10/synthesis',
    'break',
  );
  breakElement.setAttribute('time', time);
  return breakElement;
}

function appendTextWithBreaks(doc: XMLDocument, fragment: DocumentFragment, text: string): void {
  const normalized = normalizeTextNodeForTTS(text);
  let buffer = '';
  let charactersSinceBreak = 0;

  const flushBuffer = () => {
    if (!buffer) return;
    fragment.appendChild(doc.createTextNode(buffer));
    buffer = '';
  };

  const appendBreak = (time: string) => {
    flushBuffer();
    fragment.appendChild(createBreakElement(doc, time));
    charactersSinceBreak = 0;
  };

  for (const character of normalized) {
    if (character === '\n') {
      buffer += ' ';
      appendBreak('360ms');
      continue;
    }

    buffer += character;
    if (!/\s/.test(character)) {
      charactersSinceBreak += 1;
    }

    const breakTime = getBreakTimeForCharacter(character);
    if (breakTime) {
      appendBreak(breakTime);
      continue;
    }

    if (charactersSinceBreak >= 90 && /[\s，,、；;：:]/.test(character)) {
      appendBreak('180ms');
    }
  }

  flushBuffer();
}

function shouldEnhanceTextNode(node: Node): boolean {
  if (!node.textContent?.trim()) return false;

  const parent = node.parentElement;
  if (!parent) return false;

  const preservedParents = new Set(['break', 'bookmark', 'mark', 'phoneme', 'say-as', 'sub']);
  return !preservedParents.has(parent.localName.toLowerCase());
}

function enhanceProsodyBreaks(doc: XMLDocument, root: Element): void {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text && shouldEnhanceTextNode(node)) {
      textNodes.push(node);
    }
  }

  textNodes.forEach((textNode) => {
    const fragment = doc.createDocumentFragment();
    appendTextWithBreaks(doc, fragment, textNode.data);
    textNode.replaceWith(fragment);
  });
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
  speak.setAttribute('xmlns', 'http://www.w3.org/2001/10/synthesis');
  speak.setAttribute('xmlns:mstts', 'http://www.w3.org/2001/mstts');
  speak.setAttribute('xml:lang', lang);

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

  enhanceProsodyBreaks(doc, prosody);

  return new XMLSerializer().serializeToString(doc);
}

interface PreloadedAudio {
  blob: Blob;
  ssml: string;
  marks: TTSMark[];
  timestamp: number;
  audio: HTMLAudioElement;
  audioUrl: string;
  ready: boolean;
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
  private abortController: AbortController | null = null;
  
  private preloadedQueue: PreloadedAudio[] = [];
  private maxPreloadCount: number = 6;
  private maxPreloadConcurrency: number = 2;
  private activePreloadCount: number = 0;
  private pendingPreloadTasks: PreloadTask[] = [];
  private queuedPreloadKeys: Set<string> = new Set();
  private preloadAbortControllers: Map<string, AbortController> = new Map();
  
  private audioCache: LRUCache<CachedAudio> = new LRUCache(10);
  private preloadTriggered: boolean = false;
  private preloadProgressThreshold: number = 0.28;
  private preloadRemainingSeconds: number = 12;
  private synthesisLatencySamples: number[] = [];
  private maxSynthesisLatencySamples: number = 8;
  private consecutivePreloadMisses: number = 0;
  private suppressPauseEvent = false;

  private onPreloadTrigger: (() => void) | null = null;

  private logMetric(event: string, detail?: TTSMetricDetail): void {
    if (process.env.NODE_ENV === 'production') return;

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

  setState(state: TTSState): void {
    this.state = state;
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

  private createPreparedAudio(audioUrl: string): HTMLAudioElement {
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audio.autoplay = false;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.crossOrigin = 'anonymous';
    audio.load();
    return audio;
  }

  private releasePreloadedAudio(preloaded: PreloadedAudio): void {
    preloaded.audio.pause();
    preloaded.audio.removeAttribute('src');
    preloaded.audio.load();
    URL.revokeObjectURL(preloaded.audioUrl);
  }

  private trimPreloadQueue(): void {
    while (this.preloadedQueue.length > this.maxPreloadCount) {
      const removed = this.preloadedQueue.shift();
      if (removed) {
        this.releasePreloadedAudio(removed);
      }
    }
  }

  private releaseAllPreloadedAudio(): void {
    this.preloadedQueue.forEach((preloaded) => {
      this.releasePreloadedAudio(preloaded);
    });
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
    this.currentSSML = ssml;
    this.preloadTriggered = false;

    if (marks && marks.length > 0) {
      this.marks = marks;
    } else {
      this.marks = [{ name: '0', text: stripSSML(ssml) }];
    }

    if (isSSMLTooLarge(ssml)) {
      this.logMetric('speak.skipped-too-large', { ssmlBytes: getUTF8ByteLength(ssml) });
      throw new Error('当前段落过长，无法直接朗读');
    }

    // 检查缓存，如果命中则无需取消任何请求
    const cached = this.audioCache.get(ssml);
    if (cached) {
      this.logMetric('speak.cache-hit', {
        source: 'memory',
        bytes: cached.blob.size,
        continuous: Boolean(isContinuous),
      });
      this.consecutivePreloadMisses = 0;
      this.stopInternal(isContinuous);
      this.marks = cached.marks;
      const audioUrl = URL.createObjectURL(cached.blob);
      this.audioUrl = audioUrl;
      await this.playAudio(audioUrl);
      return;
    }

    // 检查预加载队列，如果命中则无需取消任何请求
    const preloadedIndex = this.preloadedQueue.findIndex(p => p.ssml === ssml);
    if (preloadedIndex !== -1) {
      this.stopInternal(isContinuous);
      const preloaded = this.preloadedQueue[preloadedIndex];
      this.preloadedQueue.splice(preloadedIndex, 1);
      this.logMetric('speak.preload-hit', {
        bytes: preloaded.blob.size,
        ready: preloaded.ready,
        ageMs: Date.now() - preloaded.timestamp,
        continuous: Boolean(isContinuous),
      });
      this.consecutivePreloadMisses = 0;
      this.marks = preloaded.marks;
      this.audioCache.set(ssml, { blob: preloaded.blob, marks: preloaded.marks });
      this.audioUrl = preloaded.audioUrl;
      await this.playAudio(preloaded.audioUrl, preloaded.audio);
      return;
    }

    // 只在需要新请求时才停止当前播放
    this.logMetric('speak.network-start', {
      continuous: Boolean(isContinuous),
      ssmlBytes: ssml.length,
    });
    if (isContinuous) {
      this.consecutivePreloadMisses += 1;
    }
    this.cancelAllPreloads();
    this.stopInternal(isContinuous);

    try {
      const start = performance.now();
      const { blob, audioUrl } = await this.fetchAudioBlob(ssml);
      const latencyMs = Math.round(performance.now() - start);
      this.recordSynthesisLatency(latencyMs);
      this.logMetric('speak.network-complete', {
        bytes: blob.size,
        latencyMs,
        averageLatencyMs: Math.round(this.getAverageSynthesisLatency()),
        preloadMisses: this.consecutivePreloadMisses,
      });
      this.audioUrl = audioUrl;
      this.audioCache.set(ssml, { blob, marks: this.marks });
      await this.playAudio(audioUrl);
    } catch (error) {
      if (isAbortLikeError(error)) {
        this.logMetric('speak.network-abort');
        return;
      }
      this.logMetric('speak.network-error', {
        message: error instanceof Error ? error.message : String(error),
      });
      this.setState('stopped');
      throw error;
    }
  }

  private async fetchAudioBlob(ssml: string): Promise<{ blob: Blob; audioUrl: string }> {
    const { controller, timeoutId } = createAbortController(60000);

    this.abortController = controller;

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
        throw new Error(`语音合成失败，状态码：${response.status}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      return { blob, audioUrl };
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  private async playAudio(audioUrl: string, preparedAudio?: HTMLAudioElement): Promise<void> {
    const audio = preparedAudio ?? this.getOrCreateAudio();
    this.audio = audio;

    this.suppressPauseEvent = true;
    audio.pause();
    audio.currentTime = 0;
    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }

    this.currentMarkIndex = 0;

    audio.onplay = () => {
      this.setState('playing');
      if (this.marks.length > 0) {
        this.onMarkChange?.(this.marks[0], 0);
      }
    };

    audio.onended = () => {
      this.releaseAudioUrl();
      this.preloadTriggered = false;
      if (this.state === 'playing') {
        this.onEnd?.();
      } else {
        this.setState('stopped');
      }
    };

    audio.onerror = () => {
      this.releaseAudioUrl();
      this.preloadTriggered = false;
      this.setState('stopped');
      console.error('Audio error');
    };

    audio.onpause = () => {
      if (this.suppressPauseEvent) {
        this.suppressPauseEvent = false;
        return;
      }
      if (this.state === 'playing') {
        this.setState('paused');
      }
    };

    audio.ontimeupdate = () => {
      if (this.onTimeUpdate) {
        const duration = audio.duration || 0;
        this.onTimeUpdate(audio.currentTime, duration);
        
        const adaptiveConfig = this.getAdaptivePreloadConfig(duration);
        const remainingSeconds = duration - audio.currentTime;
        if (!this.preloadTriggered && duration > 0 &&
            (audio.currentTime >= duration * adaptiveConfig.progressThreshold ||
              remainingSeconds <= adaptiveConfig.remainingSeconds)) {
          this.preloadTriggered = true;
          this.logMetric('preload.triggered', {
            reason: adaptiveConfig.reason,
            currentTime: Math.round(audio.currentTime * 10) / 10,
            duration: Math.round(duration * 10) / 10,
            remainingSeconds: Math.round(remainingSeconds * 10) / 10,
            progressThreshold: adaptiveConfig.progressThreshold,
            triggerRemainingSeconds: adaptiveConfig.remainingSeconds,
            averageLatencyMs: Math.round(this.getAverageSynthesisLatency()),
            preloadMisses: this.consecutivePreloadMisses,
          });
          this.onPreloadTrigger?.();
        }
      }
    };

    await audio.play();
  }

  async preload(ssml: string, marks?: TTSMark[]): Promise<void> {
    if (!ssml) return;
    if (isSSMLTooLarge(ssml)) {
      this.logMetric('preload.skipped-too-large', { ssmlBytes: getUTF8ByteLength(ssml) });
      return;
    }
    
    if (this.audioCache.has(ssml)) return;
    
    if (this.preloadedQueue.some(p => p.ssml === ssml)) return;
    if (this.queuedPreloadKeys.has(ssml) || this.preloadAbortControllers.has(ssml)) return;

    return new Promise((resolve) => {
      this.queuedPreloadKeys.add(ssml);
      this.pendingPreloadTasks.push({ ssml, marks, resolve });
      this.logMetric('preload.enqueued', {
        ssmlBytes: ssml.length,
      });
      this.pumpPreloadQueue();
    });
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

    const controller = new AbortController();
    this.preloadAbortControllers.set(ssml, controller);
    const start = performance.now();
    
    try {
      const marksArray = marks && marks.length > 0
        ? marks
        : [{ name: '0', text: stripSSML(ssml) }];

      const blob = await this.fetchAudioBlobWithController(ssml, controller);
      const audioUrl = URL.createObjectURL(blob);
      const audio = this.createPreparedAudio(audioUrl);
      const preloaded: PreloadedAudio = {
        blob,
        ssml,
        marks: marksArray,
        timestamp: Date.now(),
        audio,
        audioUrl,
        ready: false,
      };

      const markReady = () => {
        preloaded.ready = true;
      };

      audio.oncanplaythrough = markReady;
      audio.onloadeddata = markReady;

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
      if (isAbortLikeError(error)) {
        this.logMetric('preload.abort', {
          latencyMs: Math.round(performance.now() - start),
        });
        return;
      }
      this.logMetric('preload.error', {
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : String(error),
      });
      console.error('Preload failed:', error);
    } finally {
      this.preloadAbortControllers.delete(ssml);
    }
  }

  private async fetchAudioBlobWithController(ssml: string, controller: AbortController): Promise<Blob> {
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
        throw new Error(`语音合成失败，状态码：${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error;
      }
      throw new Error(`获取语音失败：${error}`);
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
        this.releasePreloadedAudio(p);
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
    if (this.audio && this.state === 'playing') {
      this.suppressPauseEvent = true;
      this.audio.pause();
      this.setState('paused');
    }
  }

  async resume(): Promise<void> {
    if (this.audio && this.state === 'paused') {
      await this.audio.play();
      this.setState('playing');
    }
  }

  stop(): void {
    this.stopInternal(false);
  }

  private stopInternal(preservePlayingState?: boolean): void {
    // 只取消当前播放的请求，保留预加载请求
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.audio) {
      this.suppressPauseEvent = true;
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.removeAttribute('src');
      this.audio.load();
    }

    this.releaseAudioUrl();
    if (!preservePlayingState) {
      this.setState('stopped');
      this.preloadTriggered = false;
    }
    this.currentMarkIndex = 0;
  }

  isSpeaking(): boolean {
    return this.state === 'playing';
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }
}

export const backendTTS = new BackendTTS();
