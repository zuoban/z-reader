import { expect, test } from '@playwright/test';
import { gotoStable, installBrowserStubs, mockReaderHappyPath } from './helpers/fixtures';

// A deterministic PCM tone exercises the browser's real media decoder. It does
// not depend on speech credentials or ship any book-derived audio in the repo.
function testWave() {
  const samples = 24000 * 2;
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
});
