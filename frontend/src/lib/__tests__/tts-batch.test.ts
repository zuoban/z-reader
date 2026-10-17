import { describe, expect, it } from 'vitest';
import { estimateTTSDuration, TTSSpeechBuffer } from '@/lib/tts-batch';
import { getTextFromSSML } from '@/lib/tts';
import type { TTSSettings } from '@/lib/tts';
import type { TTSSentence } from '@/lib/types';

const settings: TTSSettings = {
  rate: 0, voiceName: 'zh-CN-XiaoxiaoMultilingualNeural', highlightMode: 'word',
};
function sentence(text: string, index: number): TTSSentence {
  return { text, ssml: `<speak>${text}</speak>`, cfi: `cfi-${index}`, sectionIndex: index,
    words: [{ text, cfi: `word-${index}` }] };
}
async function* source() {
  for (let i = 0; i < 12; i++) yield sentence('这是一段能够连续朗读的测试文本。'.repeat(8), i);
}

describe('TTS text buffer', () => {
  it('uses a short first chunk and prepares longer chunks across section boundaries', async () => {
    const buffer = new TTSSpeechBuffer(source());
    const first = await buffer.chunk(0, 12, settings);
    const next = await buffer.chunk(first!.endIndex + 1, 90, settings);
    expect(first?.endIndex).toBe(0);
    expect(next!.endIndex).toBeGreaterThan(next!.startIndex);
    expect(next?.estimatedSeconds).toBeGreaterThanOrEqual(90);
    expect(next?.marks[0].sentenceIndex).toBe(first!.endIndex + 1);
    expect(next?.marks[0].cfi).toBe('word-1');
    expect(new DOMParser().parseFromString(next!.ssml, 'application/xml')
      .querySelector('parsererror')).toBeNull();
  });

  it('supports sentence navigation from already buffered text without reading it again', async () => {
    const buffer = new TTSSpeechBuffer(source());
    await buffer.chunk(0, 180, settings);
    const previous = await buffer.chunk(1, 12, settings);
    expect(previous?.startIndex).toBe(1);
    expect(previous?.marks[0].cfi).toBe('word-1');
  });

  it('preserves repeated sentences rather than deduplicating spoken content', async () => {
    async function* repeated() { yield sentence('重复。', 0); yield sentence('重复。', 1); }
    const chunk = await new TTSSpeechBuffer(repeated()).chunk(0, 90, settings);
    expect(chunk?.endIndex).toBe(1);
    expect(chunk?.marks.map(mark => mark.cfi)).toEqual(['word-0', 'word-1']);
  });

  it('splits oversized passages without dropping text or exceeding the backend limit', async () => {
    const text = '很长的连续文本'.repeat(2000);
    async function* long() { yield sentence(text, 0); }
    const buffer = new TTSSpeechBuffer(long());
    let next = 0;
    let recovered = '';
    for (;;) {
      const chunk = await buffer.chunk(next, 90, settings);
      if (!chunk) break;
      expect(new TextEncoder().encode(chunk.ssml).length).toBeLessThan(32 * 1024);
      recovered += getTextFromSSML(chunk.ssml).replace(/\s/g, '');
      next = chunk.endIndex + 1;
    }
    expect(recovered).toBe(text);
  });

  it('discards pending text after disposal', async () => {
    let deliver!: () => void;
    async function* delayed() {
      await new Promise<void>(done => { deliver = done; });
      yield sentence('晚到的文本。', 0);
    }
    const buffer = new TTSSpeechBuffer(delayed());
    const chunk = buffer.chunk(0, 12, settings);
    await Promise.resolve();
    buffer.dispose();
    deliver();
    expect(await chunk).toBeNull();
  });

  it('estimates buffer duration for the selected speech rate', () => {
    const text = '中文内容'.repeat(20);
    expect(estimateTTSDuration(text, 100)).toBe(estimateTTSDuration(text) / 2);
    expect(estimateTTSDuration('one two three four five')).toBe(2);
  });
});
