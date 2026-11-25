import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendTTS } from '@/lib/tts';
import {
  computeMarkBoundaries,
  findMarkIndexAtProgress,
  LRUCache,
} from '@/lib/tts/audio-cache';
import { TTSAudioFetcher } from '@/lib/tts/fetcher';
import { TTSPreloadManager } from '@/lib/tts/preloader';
import {
  loadTTSSettings,
  mergeVoicesWithFallback,
  saveTTSSettings,
} from '@/lib/tts/settings';
import {
  getTextFromSSML,
  isSkippableTTSText,
  isSSMLTooLarge,
  stripSSML,
} from '@/lib/tts/ssml';
import { DEFAULT_SETTINGS, TTS_SETTINGS_KEY } from '@/lib/tts/types';

vi.mock('@/lib/api', () => ({ getAuthHeaders: () => ({}), handleAuthResponse: () => {} }));

describe('TTS extracted submodules', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('LRUCache and mark boundary helpers', () => {
    it('evicts least-recently-used entries and runs release callbacks', () => {
      const released: string[] = [];
      const cache = new LRUCache<string>(2);
      cache.set('a', 'A', () => released.push('a'));
      cache.set('b', 'B', () => released.push('b'));
      expect(cache.get('a')).toBe('A'); // promotes 'a', making 'b' LRU
      cache.set('c', 'C', () => released.push('c'));

      expect(released).toEqual(['b']);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
      expect(cache.size()).toBe(2);

      // delete only removes if value matches expected
      cache.delete('a', 'WRONG');
      expect(cache.has('a')).toBe(true);
      cache.delete('a', 'A');
      expect(cache.has('a')).toBe(false);
      expect(released).toEqual(['b', 'a']);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(released).toEqual(['b', 'a', 'c']);
    });

    it('computes weighted mark boundaries and locates mark index via binary search', () => {
      const boundaries = computeMarkBoundaries([
        { name: '0', text: 'ab', weight: 1 },
        { name: '1', text: 'cdef', weight: 3 },
      ]);
      expect(boundaries).toEqual([0.25, 1]);
      expect(findMarkIndexAtProgress(boundaries, 2, 0)).toBe(0);
      expect(findMarkIndexAtProgress(boundaries, 2, 0.24)).toBe(0);
      expect(findMarkIndexAtProgress(boundaries, 2, 0.25)).toBe(1);
      expect(findMarkIndexAtProgress(boundaries, 2, 1)).toBe(1);
    });
  });

  describe('settings and voice merging', () => {
    it('saves, loads, and recovers from corrupted localStorage settings', () => {
      expect(loadTTSSettings()).toEqual(DEFAULT_SETTINGS);
      saveTTSSettings({ ...DEFAULT_SETTINGS, rate: 15 });
      expect(loadTTSSettings().rate).toBe(15);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(TTS_SETTINGS_KEY, '{invalid-json');
      expect(loadTTSSettings()).toEqual(DEFAULT_SETTINGS);
      errorSpy.mockRestore();
    });

    it('adds an unknown preferred voice when absent from fallback and provider lists', () => {
      const voices = mergeVoicesWithFallback([], 'zh-CN-CustomVoiceNeural');
      const custom = voices.find((v) => v.ShortName === 'zh-CN-CustomVoiceNeural');
      expect(custom).toBeDefined();
      expect(custom?.Locale).toBe('zh-CN');
    });
  });

  describe('SSML and text utilities', () => {
    it('strips SSML tags, checks byte limits, and detects skippable text', () => {
      expect(stripSSML('<speak><mark name="0"/>你好<break time="200ms"/>世界</speak>')).toBe('你好 世界');
      expect(getTextFromSSML('<speak>你好世界</speak>')).toBe('你好世界');
      expect(isSSMLTooLarge('<speak>short</speak>')).toBe(false);
      expect(isSSMLTooLarge('中'.repeat(12000))).toBe(true);

      expect(isSkippableTTSText('   ')).toBe(true);
      expect(isSkippableTTSText('...')).toBe(true);
      expect(isSkippableTTSText('a | b | c\n1 | 2 | 3')).toBe(true);
      expect(isSkippableTTSText('const x = 1;\nreturn x;')).toBe(true);
      expect(isSkippableTTSText('这是一句正常的中文小说正文内容。')).toBe(false);
    });
  });

  describe('TTSPreloadManager adaptive preload thresholds', () => {
    it('adapts preload thresholds based on synthesis latency, misses, and short audio', () => {
      const manager = new TTSPreloadManager(new TTSAudioFetcher(), vi.fn());
      expect(manager.getAdaptivePreloadConfig(60).reason).toBe('default');

      manager.recordSynthesisLatency(500);
      expect(manager.getAdaptivePreloadConfig(60).reason).toBe('fast-synthesis');

      manager.recordSynthesisLatency(8000);
      manager.recordSynthesisLatency(8000);
      expect(manager.getAdaptivePreloadConfig(60).reason).toBe('slow-synthesis');

      manager.recordPreloadMiss(true);
      manager.recordPreloadMiss(true);
      expect(manager.getAdaptivePreloadConfig(60).reason).toBe('preload-misses');
      expect(manager.getAdaptivePreloadConfig(12).reason).toBe('short-audio');
    });
  });

  describe('BackendTTS facade preload and state helpers', () => {
    it('delegates preload queue controls and reports paused state accurately', () => {
      const tts = new BackendTTS();
      expect(tts.getPreloadQueueLength()).toBe(0);
      expect(tts.isPaused()).toBe(false);

      tts.cleanupIrrelevantPreloads([]);
      tts.cancelPreload('<speak>noop</speak>');
      tts.cancelAllPreloads();
      tts.clearPreloadQueue();
      tts.clearPreloadQueueOnly();
      tts.clearPreload();

      tts.pause();
      expect(tts.isPaused()).toBe(true);
      tts.stop();
      expect(tts.isPaused()).toBe(false);
    });
  });
});
