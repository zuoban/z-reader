'use client';

import { API_BASE, createAbortController } from '@/lib/config';

export type TTSState = 'stopped' | 'playing' | 'paused';

export interface TTSSettings {
  rate: number;
  pitch: number;
  volume: number;
  voiceName: string;
  style: string;
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

const TTS_SETTINGS_KEY = 'z-reader-tts-settings';

const DEFAULT_SETTINGS: TTSSettings = {
  rate: 0,
  pitch: 0,
  volume: 1,
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
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveTTSSettings(settings: TTSSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
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
  audioUrl: string;
  ssml: string;
  marks: TTSMark[];
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

  async speak(ssml: string, marks?: TTSMark[]): Promise<void> {
    this.currentSSML = ssml;

    if (marks && marks.length > 0) {
      this.marks = marks;
    } else {
      this.marks = [{ name: '0', text: stripSSML(ssml) }];
    }

    this.stop();

    try {
      const preloadedIndex = this.preloadedQueue.findIndex(p => p.ssml === ssml);
      if (preloadedIndex !== -1) {
        const preloaded = this.preloadedQueue[preloadedIndex];
        const urlsToRevoke = this.preloadedQueue.slice(0, preloadedIndex + 1).map(p => p.audioUrl);
        for (let i = 0; i < preloadedIndex; i++) {
          URL.revokeObjectURL(urlsToRevoke[i]);
        }
        this.preloadedQueue.splice(0, preloadedIndex + 1);
        this.marks = preloaded.marks;
        this.audioUrl = preloaded.audioUrl;
        await this.playAudio(preloaded.audioUrl);
        return;
      }

      const audioUrl = await this.fetchAudio(ssml);
      this.audioUrl = audioUrl;
      await this.playAudio(audioUrl);
    } catch (error) {
      this.setState('stopped');
      throw error;
    }
  }

  private async fetchAudio(ssml: string): Promise<string> {
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

      const audioBlob = await response.blob();
      return URL.createObjectURL(audioBlob);
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  private async playAudio(audioUrl: string): Promise<void> {
    this.audio = new Audio(audioUrl);
    this.audio.volume = this.settings.volume;

    this.currentMarkIndex = 0;

    this.audio.onplay = () => {
      this.setState('playing');
      if (this.marks.length > 0) {
        this.onMarkChange?.(this.marks[0], 0);
      }
    };

    this.audio.onended = () => {
      this.releaseAudioUrl();
      const wasPlaying = this.state === 'playing';
      const wasPaused = this.state === 'paused';
      this.setState('stopped');
      if (wasPlaying || wasPaused) {
        this.onEnd?.();
      }
    };

    this.audio.onerror = () => {
      this.releaseAudioUrl();
      this.setState('stopped');
      console.error('Audio error');
    };

    this.audio.onpause = () => {
    };

    this.audio.ontimeupdate = () => {
      if (this.audio && this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    };

    await this.audio.play();
  }

  async preload(ssml: string, marks?: TTSMark[]): Promise<void> {
    if (!ssml) return;
    
    if (this.preloadedQueue.some(p => p.ssml === ssml)) return;
    
    if (this.preloadedQueue.length >= this.maxPreloadCount) return;
    
    try {
      const marksArray = marks && marks.length > 0 
        ? marks 
        : [{ name: '0', text: stripSSML(ssml) }];

      const audioUrl = await this.fetchAudio(ssml);
      
      this.preloadedQueue.push({
        audioUrl,
        ssml,
        marks: marksArray,
      });
    } catch (error) {
      console.error('Preload failed:', error);
    }
  }

  async preloadMultiple(ssmlList: string[]): Promise<void> {
    for (const ssml of ssmlList) {
      await this.preload(ssml);
    }
  }

  private cleanupPreload(): void {
    for (const item of this.preloadedQueue) {
      URL.revokeObjectURL(item.audioUrl);
    }
    this.preloadedQueue = [];
  }

  clearPreload(): void {
    this.cleanupPreload();
  }

  getPreloadQueueLength(): number {
    return this.preloadedQueue.length;
  }

  pause(): void {
    if (this.audio && this.state === 'playing') {
      this.audio.pause();
      this.setState('paused');
    }
  }

  resume(): void {
    if (this.audio && this.state === 'paused') {
      this.audio.play();
      this.setState('playing');
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }

    this.releaseAudioUrl();
    this.setState('stopped');
    this.currentMarkIndex = 0;
    this.cleanupPreload();
  }

  isSpeaking(): boolean {
    return this.state === 'playing';
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }
}

export const backendTTS = new BackendTTS();