'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

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

export class BackendTTS {
  private audio: HTMLAudioElement | null = null;
  private settings: TTSSettings;
  private state: TTSState = 'stopped';
  private currentMarkIndex: number = 0;
  private marks: TTSMark[] = [];
  private onStateChange: ((state: TTSState) => void) | null = null;
  private onMarkChange: ((mark: TTSMark, index: number) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private currentSSML: string = '';

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

  async speak(ssml: string, marks?: TTSMark[]): Promise<void> {
    this.currentSSML = ssml;

    if (marks && marks.length > 0) {
      this.marks = marks;
    } else {
      this.marks = [{ name: '0', text: stripSSML(ssml) }];
    }

    this.stop();

    try {
      const token = localStorage.getItem('token');
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
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

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
        URL.revokeObjectURL(audioUrl);
        if (this.state === 'playing') {
          this.setState('stopped');
          this.onEnd?.();
        }
      };

      this.audio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        this.setState('stopped');
        console.error('Audio error:', e);
      };

      this.audio.onpause = () => {
        if (this.state === 'playing') {
          this.setState('paused');
        }
      };

      await this.audio.play();
    } catch (error) {
      this.setState('stopped');
      throw error;
    }
  }

  pause(): void {
    if (this.audio && this.state === 'playing') {
      this.audio.pause();
    }
  }

  resume(): void {
    if (this.audio && this.state === 'paused') {
      this.audio.play();
      this.setState('playing');
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    this.setState('stopped');
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