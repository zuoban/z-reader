'use client';

import { API_BASE, createAbortController } from '@/lib/config';

export type TTSState = 'stopped' | 'playing' | 'paused';

export interface TTSSettings {
  rate: number;
  voiceName: string;
  style?: string;
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

const DEFAULT_SETTINGS: TTSSettings = {
  rate: 0,
  voiceName: 'zh-CN-XiaoxiaoMultilingualNeural',
  style: 'general',
};

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
    .replace(/<[^>]+>/g, '')
    .trim();
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
  private maxPreloadCount: number = 3;
  private preloadAbortControllers: Map<string, AbortController> = new Map();
  
  private audioCache: LRUCache<CachedAudio> = new LRUCache(10);
  private preloadTriggered: boolean = false;
  private preloadProgressThreshold: number = 0.28;
  private suppressPauseEvent = false;

  private onPreloadTrigger: (() => void) | null = null;
  
  onPreloadTriggerCallback(cb: () => void): void {
    this.onPreloadTrigger = cb;
  }
  
  constructor() {
    this.settings = loadTTSSettings();
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

  async speak(ssml: string, marks?: TTSMark[], isContinuous?: boolean): Promise<void> {
    this.currentSSML = ssml;
    this.preloadTriggered = false;

    if (marks && marks.length > 0) {
      this.marks = marks;
    } else {
      this.marks = [{ name: '0', text: stripSSML(ssml) }];
    }

    // 检查缓存，如果命中则无需取消任何请求
    const cached = this.audioCache.get(ssml);
    if (cached) {
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
      this.marks = preloaded.marks;
      this.audioCache.set(ssml, { blob: preloaded.blob, marks: preloaded.marks });
      const audioUrl = URL.createObjectURL(preloaded.blob);
      this.audioUrl = audioUrl;
      await this.playAudio(audioUrl);
      return;
    }

    // 只在需要新请求时才停止当前播放
    this.stopInternal(isContinuous);

    try {
      const { blob, audioUrl } = await this.fetchAudioBlob(ssml);
      this.audioUrl = audioUrl;
      this.audioCache.set(ssml, { blob, marks: this.marks });
      await this.playAudio(audioUrl);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      this.setState('stopped');
      throw error;
    }
  }

  private async fetchAudioBlob(ssml: string): Promise<{ blob: Blob; audioUrl: string }> {
    const token = localStorage.getItem('token');
    const { controller, timeoutId } = createAbortController(60000);

    this.abortController = controller;

    try {
      const response = await fetch(`${API_BASE}/api/ssml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({
          ssml: ssml,
          output_format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      return { blob, audioUrl };
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  private async playAudio(audioUrl: string): Promise<void> {
    this.audio = new Audio(audioUrl);
    this.audio.preload = 'auto';
    this.audio.autoplay = false;
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');

    this.currentMarkIndex = 0;

    this.audio.onplay = () => {
      this.setState('playing');
      if (this.marks.length > 0) {
        this.onMarkChange?.(this.marks[0], 0);
      }
    };

    this.audio.onended = () => {
      this.releaseAudioUrl();
      this.preloadTriggered = false;
      if (this.state === 'playing') {
        this.onEnd?.();
      } else {
        this.setState('stopped');
      }
    };

    this.audio.onerror = () => {
      this.releaseAudioUrl();
      this.preloadTriggered = false;
      this.setState('stopped');
      console.error('Audio error');
    };

    this.audio.onpause = () => {
      if (this.suppressPauseEvent) {
        this.suppressPauseEvent = false;
        return;
      }
      if (this.state === 'playing') {
        this.setState('paused');
      }
    };

    this.audio.ontimeupdate = () => {
      if (this.audio && this.onTimeUpdate) {
        const duration = this.audio.duration || 0;
        this.onTimeUpdate(this.audio.currentTime, duration);
        
        if (!this.preloadTriggered && duration > 0 && 
            this.audio.currentTime >= duration * this.preloadProgressThreshold) {
          this.preloadTriggered = true;
          this.onPreloadTrigger?.();
        }
      }
    };

    await this.audio.play();
  }

  async preload(ssml: string, marks?: TTSMark[]): Promise<void> {
    if (!ssml) return;
    
    if (this.audioCache.has(ssml)) return;
    
    if (this.preloadedQueue.some(p => p.ssml === ssml)) return;
    
    this.cancelPreload(ssml);
    
    if (this.preloadedQueue.length >= this.maxPreloadCount) {
      this.preloadedQueue.shift();
    }
    
    const controller = new AbortController();
    this.preloadAbortControllers.set(ssml, controller);
    
    try {
      const marksArray = marks && marks.length > 0
        ? marks
        : [{ name: '0', text: stripSSML(ssml) }];

      const blob = await this.fetchAudioBlobWithController(ssml, controller);

      this.preloadedQueue.push({
        blob,
        ssml,
        marks: marksArray,
        timestamp: Date.now(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Preload failed:', error);
    } finally {
      this.preloadAbortControllers.delete(ssml);
    }
  }

  private async fetchAudioBlobWithController(ssml: string, controller: AbortController): Promise<Blob> {
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_BASE}/api/ssml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({
          ssml: ssml,
          output_format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw new Error(`TTS fetch error: ${error}`);
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
  }

  cancelPreload(ssml: string): void {
    const controller = this.preloadAbortControllers.get(ssml);
    if (controller) {
      controller.abort();
      this.preloadAbortControllers.delete(ssml);
    }
  }

  cancelAllPreloads(): void {
    for (const [, controller] of this.preloadAbortControllers) {
      controller.abort();
    }
    this.preloadAbortControllers.clear();
  }

  clearPreloadQueue(): void {
    this.cancelAllPreloads();
    this.preloadedQueue = [];
  }

  private cleanupPreload(): void {
    this.cancelAllPreloads();
    this.preloadedQueue = [];
    this.audioCache.clear();
  }

  clearPreload(): void {
    this.cleanupPreload();
  }

  clearPreloadQueueOnly(): void {
    this.cancelAllPreloads();
    this.preloadedQueue = [];
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
      this.audio = null;
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
