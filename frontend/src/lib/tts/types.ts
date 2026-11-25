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

export interface PreloadedAudio {
  blob: Blob;
  ssml: string;
  marks: TTSMark[];
  timestamp: number;
}

export interface CachedAudio {
  blob: Blob;
  marks: TTSMark[];
}

export interface PlaybackSource {
  url: string;
  ssml: string;
  entry: CachedAudio;
  speechId: number;
  decodeFailed: boolean;
}

export interface PreloadTask {
  ssml: string;
  marks?: TTSMark[];
  resolve: () => void;
}

export type TTSMetricDetail = Record<string, string | number | boolean | null | undefined>;

export interface AdaptivePreloadConfig {
  progressThreshold: number;
  remainingSeconds: number;
  reason: string;
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

export const TTS_SETTINGS_KEY = 'z-reader-tts-settings';
export const MAX_BACKEND_SSML_BYTES = 32 * 1024;
export const TTS_REQUEST_TIMEOUT_MS = 65000;

export const DEFAULT_SETTINGS: TTSSettings = {
  rate: 0,
  voiceName: 'zh-CN-XiaoxiaoMultilingualNeural',
  style: 'general',
  highlightMode: 'word',
};
