import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { gotoStable, installBrowserStubs, mockReaderHappyPath } from './helpers/fixtures';

// A deterministic PCM tone exercises the browser's real media decoder. It does
// not depend on speech credentials or ship any book-derived audio in the repo.
function testWave(seconds = 2) {
  const samples = 24000 * seconds;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(24000, 24);
  data.writeUInt32LE(48000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 24000) * 100), 44 + i * 2);
  }
  return data;
}

async function observeSpeech(page: Page) {
  await page.addInitScript(() => {
    const state = window as typeof window & { ttsAudios: HTMLAudioElement[] };
    state.ttsAudios = [];
    const NativeAudio = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new NativeAudio(src);
      state.ttsAudios.push(audio);
      return audio;
    } as unknown as typeof Audio;
  });
}

async function openSpeech(page: Page) {
  await gotoStable(page, '/read/book-1');
  await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
  const expand = page.getByRole('button', { name: '展开操作栏' });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: '朗读控制', exact: true }).first().click();
}

test.describe('background TTS', () => {
  test.setTimeout(90_000);

  test('reads detached chapters without navigating the renderer', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockReaderHappyPath(page);
    await gotoStable(page, '/read/book-1');
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
    const result = await page.evaluate(async () => {
      const view = document.querySelector('foliate-view') as HTMLElement & {
        getTTSSentences: () => AsyncIterable<{ text: string; cfi: string; sectionIndex: number }>;
        getTTSPreviousCFI: (cfi: string) => Promise<string | null>;
        renderer: { getContents: () => Array<{ index: number }> };
      };
      const before = view.renderer.getContents()[0].index;
      const sentences: Array<{ text: string; cfi: string; sectionIndex: number }> = [];
      for await (const sentence of view.getTTSSentences()) sentences.push(sentence);
      const secondChapter = sentences.findIndex(item => item.sectionIndex !== sentences[0].sectionIndex);
      const previous = await view.getTTSPreviousCFI(sentences[secondChapter].cfi);
      return { before, after: view.renderer.getContents()[0].index, sentences,
        previous, expectedPrevious: sentences[secondChapter - 1].cfi };
    });
    expect(new Set(result.sentences.map(sentence => sentence.sectionIndex)).size).toBe(2);
    expect(result.sentences.some(sentence => sentence.text.includes('样例书第二章'))).toBe(true);
    expect(result.sentences.every(sentence => sentence.cfi.startsWith('epubcfi('))).toBe(true);
    expect(result.after).toBe(result.before);
    expect(result.previous).toBe(result.expectedPrevious);
  });

  test('decodes and continues a second chunk while hidden using the same audio element', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockReaderHappyPath(page);
    await page.route('**/api/ssml', async route => {
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: testWave() });
    });
    await page.addInitScript(() => {
      const state = window as typeof window & {
        ttsAudios: HTMLAudioElement[]; ttsPlays: number; readerSectionBeforeHidden: number;
      };
      state.ttsAudios = [];
      state.ttsPlays = 0;
      const NativeAudio = window.Audio;
      window.Audio = function () {
        const audio = new NativeAudio();
        state.ttsAudios.push(audio);
        audio.addEventListener('playing', () => { state.ttsPlays += 1; });
        return audio;
      } as unknown as typeof Audio;
    });
    await gotoStable(page, '/read/book-1');
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
    const expand = page.getByRole('button', { name: '展开操作栏' });
    if (await expand.isVisible()) await expand.click();
    await page.getByRole('button', { name: '朗读控制', exact: true }).first().click();
    await page.getByTitle('开始', { exact: true }).click();
    await page.waitForFunction(() =>
      (window as typeof window & { ttsPlays: number }).ttsPlays >= 1);
    await page.evaluate(() => {
      const view = document.querySelector('foliate-view') as HTMLElement & {
        renderer: { getContents: () => Array<{ index: number }> };
      };
      (window as typeof window & { readerSectionBeforeHidden: number })
        .readerSectionBeforeHidden = view.renderer.getContents()[0].index;
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() =>
      (window as typeof window & { ttsPlays: number }).ttsPlays >= 2);
    const result = await page.evaluate(() => {
      const state = window as typeof window & {
        ttsAudios: HTMLAudioElement[]; readerSectionBeforeHidden: number;
      };
      const view = document.querySelector('foliate-view') as HTMLElement & {
        renderer: { getContents: () => Array<{ index: number }> };
      };
      return { audioCount: state.ttsAudios.length, playing: !state.ttsAudios[0].paused,
        unchangedSection: view.renderer.getContents()[0].index === state.readerSectionBeforeHidden };
    });
    expect(result).toEqual({ audioCount: 1, playing: true, unchangedSection: true });
  });

  test('switches highlight mode without replacing audio or restarting its position', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockReaderHappyPath(page);
    await observeSpeech(page);
    await page.route('**/api/ssml', route => route.fulfill({
      status: 200, contentType: 'audio/wav', body: testWave(12),
    }));
    await openSpeech(page);
    await page.getByTitle('开始', { exact: true }).click();
    await page.waitForFunction(() => {
      const audio = (window as typeof window & { ttsAudios: HTMLAudioElement[] }).ttsAudios[0];
      return audio && !audio.paused && audio.currentTime > 0;
    });
    const before = await page.evaluate(() => {
      const audio = (window as typeof window & { ttsAudios: HTMLAudioElement[] }).ttsAudios[0];
      return { src: audio.src, time: audio.currentTime };
    });
    await page.getByRole('button', { name: '展开操作栏' }).click();
    await page.getByRole('button', { name: '朗读控制（正在播放）', exact: true }).first().click();
    await page.getByRole('button', { name: '句子', exact: true }).click();
    const after = await page.evaluate(() => {
      const audios = (window as typeof window & { ttsAudios: HTMLAudioElement[] }).ttsAudios;
      return { src: audios[0].src, time: audios[0].currentTime,
        paused: audios[0].paused, count: audios.length };
    });
    expect(after.src).toBe(before.src);
    expect(after.time).toBeGreaterThanOrEqual(before.time);
    expect(after.paused).toBe(false);
    expect(after.count).toBe(1);
  });

  test('cancels initial synthesis and ignores its late audio response', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockReaderHappyPath(page);
    await observeSpeech(page);
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/ssml', async route => {
      await responseReady;
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: testWave() })
        .catch(() => {});
    });
    try {
      await openSpeech(page);
      const requested = page.waitForRequest('**/api/ssml');
      await page.getByTitle('开始', { exact: true }).click();
      await requested;
      await expect(page.getByTitle('停止', { exact: true })).toBeEnabled();
      await page.getByTitle('停止', { exact: true }).click();
      release();
      await expect(page.getByTitle('开始', { exact: true })).toBeEnabled();
      expect(await page.evaluate(() => {
        const audios = (window as typeof window & { ttsAudios: HTMLAudioElement[] }).ttsAudios;
        return audios.every(audio => audio.paused);
      })).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem('z-reader-tts-session:book-1')))
        .toBeNull();
    } finally { release(); }
  });

  test('next sentence plays before obsolete slow prefetch responses finish', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockReaderHappyPath(page);
    await observeSpeech(page);
    let requests = 0;
    let navigating = false;
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/ssml', async route => {
      requests++;
      if (requests > 1 && !navigating) await responseReady;
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: testWave(12) })
        .catch(() => {});
    });
    try {
      await openSpeech(page);
      await page.getByTitle('开始', { exact: true }).click();
      await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
      const before = await page.evaluate(() =>
        (window as typeof window & { ttsAudios: HTMLAudioElement[] }).ttsAudios[0].src);
      await page.getByRole('button', { name: '展开操作栏' }).click();
      await page.getByRole('button', { name: '朗读控制（正在播放）', exact: true }).first().click();
      navigating = true;
      await page.getByTitle('下一句', { exact: true }).click();
      await page.waitForFunction(previous => {
        const audio = (window as typeof window & { ttsAudios: HTMLAudioElement[] }).ttsAudios[0];
        return audio.src !== previous && !audio.paused;
      }, before, { timeout: 2000 });
    } finally { release(); }
  });
});
