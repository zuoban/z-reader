import {
  DEFAULT_SETTINGS,
  FALLBACK_ZH_VOICES,
  TTS_SETTINGS_KEY,
  type TTSSettings,
  type Voice,
} from './types';

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
