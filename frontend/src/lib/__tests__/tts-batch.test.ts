import { describe, expect, it, vi } from 'vitest';
import { estimateTTSDuration, TTSSpeechBuffer } from '@/lib/tts-batch';
import { getTextFromSSML } from '@/lib/tts';
import type { TTSSettings } from '@/lib/tts';
import type { TTSSentence } from '@/lib/types';
import { getTTSSentences } from '../../../public/foliate/tts.js';
import { textWalker } from '../../../public/foliate/text-walker.js';
import * as CFI from '../../../public/foliate/epubcfi.js';

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
    expect(first!.estimatedSeconds).toBeLessThanOrEqual(12);
    expect(next!.endIndex).toBeGreaterThan(next!.startIndex);
    expect(next!.estimatedSeconds).toBeLessThanOrEqual(90);
    expect(next?.marks[0].sentenceIndex).toBe(first!.endIndex + 1);
    expect(new DOMParser().parseFromString(next!.ssml, 'application/xml')
      .querySelector('parsererror')).toBeNull();
  });

  it('supports sentence navigation from already buffered text without reading it again', async () => {
    const buffer = new TTSSpeechBuffer(source());
    const buffered = await buffer.chunk(0, 180, settings);
    const expected = buffered!.marks.find(mark => mark.sentenceIndex === 1)!.cfi;
    const previous = await buffer.chunk(1, 12, settings);
    expect(previous?.startIndex).toBe(1);
    expect(previous?.marks[0].cfi).toBe(expected);
  });

  it('preserves repeated sentences rather than deduplicating spoken content', async () => {
    async function* repeated() { yield sentence('重复。', 0); yield sentence('重复。', 1); }
    const chunk = await new TTSSpeechBuffer(repeated()).chunk(0, 90, settings);
    expect(chunk?.endIndex).toBe(1);
    expect(chunk?.marks.map(mark => mark.cfi)).toEqual(['word-0', 'word-1']);
  });

  it('splits oversized passages without dropping text or rebuilding XML for every stable slice',
    async () => {
      const text = '很长的连续文本'.repeat(2000);
      async function* long() { yield sentence(text, 0); }
      const parser = vi.spyOn(DOMParser.prototype, 'parseFromString');
      try {
        const buffer = new TTSSpeechBuffer(long());
        let next = 0;
        let recovered = '';
        let chunks = 0;
        for (;;) {
          const chunk = await buffer.chunk(next, 90, settings);
          if (!chunk) break;
          expect(new TextEncoder().encode(chunk.ssml).length).toBeLessThanOrEqual(30 * 1024);
          recovered += getTextFromSSML(chunk.ssml).replace(/\s/g, '');
          next = chunk.endIndex + 1;
          chunks += 1;
        }
        expect(recovered).toBe(text);
        // One source parse, one synthesis build and one test-side text decode per audio chunk.
        expect(parser.mock.calls.length).toBeLessThanOrEqual(1 + chunks * 2);
      } finally { parser.mockRestore(); }
    });

  it('caps the first chunk inside a long indivisible token and preserves resumable ranges', async () => {
    const text = '汉'.repeat(300);
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<p><em>${text}</em></p>`;
    async function* long() {
      for (const item of getTTSSentences(doc, textWalker, CFI.fromRange, null)) {
        yield { ...item, sectionIndex: 0, words: [
          { text, cfi: item.cfi, start: 0, end: text.length },
        ] };
      }
    }
    const buffer = new TTSSpeechBuffer(long());
    let index = 0;
    let recovered = '';
    const locations = new Set<string>();
    for (;;) {
      const chunk = await buffer.chunk(index, index === 0 ? 12 : 30, settings);
      if (!chunk) break;
      expect(chunk.estimatedSeconds).toBeLessThanOrEqual(index === 0 ? 12 : 30);
      expect(new TextEncoder().encode(chunk.ssml).length).toBeLessThanOrEqual(30 * 1024);
      const parsed = new DOMParser().parseFromString(chunk.ssml, 'application/xml');
      expect(parsed.querySelector('parsererror')).toBeNull();
      expect(parsed.querySelector('emphasis')).not.toBeNull();
      const chunkText = getTextFromSSML(chunk.ssml).replace(/\s/g, '');
      const firstMark = chunk.marks[0];
      expect(firstMark.cfi).toBeTruthy();
      expect(locations.has(firstMark.cfi!)).toBe(false);
      locations.add(firstMark.cfi!);
      expect(CFI.toRange(doc, CFI.parse(firstMark.cfi!)).toString()).toBe(firstMark.text);
      expect(CFI.toRange(doc, CFI.parse(firstMark.sentenceCfi!)).toString()).toBe(text);
      const resume = CFI.toRange(doc, CFI.parse(firstMark.cfi!));
      const [resumed] = [...getTTSSentences(doc, textWalker, CFI.fromRange, resume)];
      expect(resumed.text).toBe(text.slice(recovered.length));
      recovered += chunkText;
      index = chunk.endIndex + 1;
    }
    expect(locations.size).toBeGreaterThan(1);
    expect(recovered).toBe(text);
  });

  it('retains the same word and sentence locations in both highlight modes', async () => {
    async function* words() {
      yield { ...sentence('Hello world.', 0), words: [
        { text: 'Hello', cfi: 'hello', start: 0, end: 5 },
        { text: 'world', cfi: 'world', start: 6, end: 11 },
      ] };
    }
    const word = await new TTSSpeechBuffer(words()).chunk(0, 12, settings);
    const sentenceMode = await new TTSSpeechBuffer(words()).chunk(0, 12, {
      ...settings, highlightMode: 'sentence',
    });
    expect(sentenceMode?.marks).toEqual(word?.marks);
    expect(sentenceMode?.ssml).toBe(word?.ssml);
    expect(word?.marks.map(mark => mark.sentenceCfi)).toEqual(['cfi-0', 'cfi-0']);
    expect(word!.marks.reduce((sum, mark) => sum + mark.weight!, 0)).toBeLessThan(2);
  });

  it('adds punctuation time without rounding every word up to a second', () => {
    expect(estimateTTSDuration('a')).toBeLessThan(1);
    expect(estimateTTSDuration('你好。')).toBeGreaterThan(estimateTTSDuration('你好'));
    expect(estimateTTSDuration('')).toBe(0);
  });

  it('resolves UTF-16 slices through escaped CFI IDs and inline elements', async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p id="a,[b]">' + '汉😀'.repeat(15) + '<em>' +
      '字😀'.repeat(15) + '</em></p>';
    const text = doc.querySelector('p')!.textContent!;
    async function* mixed() {
      for (const item of getTTSSentences(doc, textWalker, CFI.fromRange, null))
        yield { ...item, sectionIndex: 0 };
    }
    const buffer = new TTSSpeechBuffer(mixed());
    let recovered = '';
    let index = 0;
    for (;;) {
      const chunk = await buffer.chunk(index, 2, settings);
      if (!chunk) break;
      const parsed = new DOMParser().parseFromString(chunk.ssml, 'application/xml');
      recovered += parsed.documentElement.textContent;
      for (const mark of chunk.marks) {
        expect(CFI.toRange(doc, CFI.parse(mark.cfi!)).toString()).toBe(mark.text);
      }
      index = chunk.endIndex + 1;
    }
    expect(recovered).toBe(text);
  });

  it('prepares only the needed prefix of a very long source sentence', async () => {
    async function* huge() { yield sentence('汉'.repeat(5000), 0); }
    const parser = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const chunk = await new TTSSpeechBuffer(huge()).chunk(0, 12, settings);
      expect(chunk!.estimatedSeconds).toBeLessThanOrEqual(12);
      expect(parser.mock.calls.length).toBeLessThan(20);
    } finally { parser.mockRestore(); }
  });

  it('bounds XML parsing work when many short sentences fill a chunk', async () => {
    async function* short() {
      for (let index = 0; index < 40; index++) yield sentence('Small text.', index);
    }
    const parser = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const chunk = await new TTSSpeechBuffer(short()).chunk(0, 90, settings);
      expect(chunk?.endIndex).toBe(39);
      expect(parser.mock.calls.length).toBeLessThan(200);
    } finally { parser.mockRestore(); }
  });

  it('does not insert pauses in the middle of a sliced sentence', async () => {
    async function* long() { yield sentence('汉'.repeat(180), 0); }
    const buffer = new TTSSpeechBuffer(long());
    const chunk = await buffer.chunk(0, 90, settings);
    const parsed = new DOMParser().parseFromString(chunk!.ssml, 'application/xml');
    expect(parsed.querySelectorAll('break')).toHaveLength(0);
  });

  it('keeps replay bounded after duration calibration halves the requested target', async () => {
    async function* long() { yield sentence('汉'.repeat(300), 0); }
    const buffer = new TTSSpeechBuffer(long());
    const initial = await buffer.chunk(0, 12, settings);
    const replay = await buffer.chunk(0, 6, settings);
    expect(initial!.estimatedSeconds).toBeLessThanOrEqual(12);
    expect(replay!.estimatedSeconds).toBeLessThanOrEqual(6);
    expect(replay!.marks[0].cfi).toBe(initial!.marks[0].cfi);
  });

  it('navigates between original sentences rather than their smaller playback slices', async () => {
    async function* originals() {
      yield sentence('汉'.repeat(100), 0);
      yield sentence('字'.repeat(100), 1);
    }
    const buffer = new TTSSpeechBuffer(originals());
    await buffer.chunk(0, 90, settings);
    expect(await buffer.adjacentSentenceIndex(0, -1, settings)).toBeNull();
    const second = await buffer.adjacentSentenceIndex(1, 1, settings);
    expect(second).toBeGreaterThan(1);
    const next = await buffer.chunk(second!, 6, settings);
    expect(next!.marks[0].sentenceCfi).toBe('cfi-1');
    expect(await buffer.adjacentSentenceIndex(second!, -1, settings)).toBe(0);
    expect(await buffer.adjacentSentenceIndex(second!, 1, settings)).toBeNull();
  });

  it('skips an unmaterialized long sentence without retaining or copying all its remaining words',
    async () => {
      const text = '汉'.repeat(40000);
      async function* originals() {
        yield { ...sentence(text, 0), words: Array.from(text, (_, index) => ({
          text: '汉', cfi: `long-word-${index}`, start: index, end: index + 1,
        })) };
        yield sentence('下一句。', 1);
      }
      const buffer = new TTSSpeechBuffer(originals());
      await buffer.chunk(0, 12, settings);
      const clone = vi.spyOn(Node.prototype, 'cloneNode');
      try {
        const adjacent = await buffer.adjacentSentenceIndex(0, 1, settings);
        expect(adjacent).toBeLessThan(10);
        expect(buffer.firstSentenceIndex).toBe(adjacent);
        expect(clone.mock.calls.length).toBeLessThan(20);
        expect(await buffer.chunk(0, 12, settings)).toBeNull();
        expect((await buffer.chunk(adjacent!, 12, settings))?.marks[0].sentenceCfi)
          .toBe('cfi-1');
      } finally { clone.mockRestore(); }
    });

  it('bounds markup-heavy SSML by encoded bytes and retains all its text', async () => {
    const text = '汉'.repeat(100);
    async function* markup() {
      yield { ...sentence(text, 0), words: [], ssml: '<speak>' +
        Array.from(text, character => '<emphasis level="moderate">'.repeat(40) +
          character + '</emphasis>'.repeat(40)).join('') + '</speak>' };
    }
    const buffer = new TTSSpeechBuffer(markup());
    let recovered = '';
    let index = 0;
    for (;;) {
      const chunk = await buffer.chunk(index, 90, settings);
      if (!chunk) break;
      expect(new TextEncoder().encode(chunk.ssml).length).toBeLessThanOrEqual(30 * 1024);
      const parsed = new DOMParser().parseFromString(chunk.ssml, 'application/xml');
      expect(parsed.querySelector('parsererror')).toBeNull();
      expect(parsed.querySelector('emphasis')).not.toBeNull();
      recovered += parsed.documentElement.textContent;
      index = chunk.endIndex + 1;
    }
    expect(recovered).toBe(text);
  });

  it.each([
    ['phoneme', `alphabet="ipa" ph="${'han '.repeat(100).trim()}"`],
    ['sub', `alias="${'汉'.repeat(100)}"`],
    ['say-as', 'interpret-as="characters"'],
  ])('falls back to partial text when a long %s span must be split', async (tag, attributes) => {
    const text = '汉'.repeat(100);
    async function* pronunciation() {
      yield { ...sentence(text, 0), ssml: `<speak><${tag} ${attributes}>${text}` +
        `</${tag}></speak>` };
    }
    const buffer = new TTSSpeechBuffer(pronunciation());
    let index = 0;
    let recovered = '';
    for (;;) {
      const chunk = await buffer.chunk(index, index === 0 ? 12 : 90, settings);
      if (!chunk) break;
      const parsed = new DOMParser().parseFromString(chunk.ssml, 'application/xml');
      expect(parsed.querySelector('parsererror')).toBeNull();
      expect(parsed.querySelector(tag)).toBeNull();
      recovered += parsed.documentElement.textContent;
      index = chunk.endIndex + 1;
    }
    expect(recovered).toBe(text);
  });

  it('preserves a fitting pronunciation span instead of splitting it at a slice boundary', async () => {
    const prefix = '前'.repeat(20);
    const atomic = '字'.repeat(8);
    const suffix = '后'.repeat(20);
    async function* pronunciation() {
      yield { ...sentence(prefix + atomic + suffix, 0), ssml: '<speak>' + prefix +
        `<phoneme alphabet="ipa" ph="${'zi '.repeat(8).trim()}">${atomic}</phoneme>` +
        suffix + '</speak>' };
    }
    const chunk = await new TTSSpeechBuffer(pronunciation()).chunk(0, 90, settings);
    const parsed = new DOMParser().parseFromString(chunk!.ssml, 'application/xml');
    expect(Array.from(parsed.querySelectorAll('phoneme'), element => element.textContent))
      .toEqual([atomic]);
    expect(parsed.documentElement.textContent).toBe(prefix + atomic + suffix);
  });

  it('includes retained pronunciation duration when enforcing the first chunk target', async () => {
    const prefix = '前'.repeat(20);
    const atomic = '字'.repeat(8);
    const suffix = '后'.repeat(20);
    async function* pronunciation() {
      yield { ...sentence(prefix + atomic + suffix, 0), ssml: '<speak>' + prefix +
        `<phoneme alphabet="ipa" ph="${'zi '.repeat(8).trim()}">${atomic}</phoneme>` +
        suffix + '</speak>' };
    }
    const chunk = await new TTSSpeechBuffer(pronunciation()).chunk(0, 12, settings);
    const parsed = new DOMParser().parseFromString(chunk!.ssml, 'application/xml');
    const phoneme = parsed.querySelector('phoneme')!;
    const plainCharacters = parsed.documentElement.textContent!.length - phoneme.textContent!.length;
    expect(plainCharacters / 4 + estimateTTSDuration(phoneme.getAttribute('ph')!))
      .toBeLessThanOrEqual(12);
  });

  it('falls back to body text when a short label has an oversized spoken alias', async () => {
    async function* alias() {
      yield { ...sentence('注', 0), ssml: `<speak><sub alias="${'汉'.repeat(100)}">注</sub></speak>` };
    }
    const chunk = await new TTSSpeechBuffer(alias()).chunk(0, 12, settings);
    const parsed = new DOMParser().parseFromString(chunk!.ssml, 'application/xml');
    expect(parsed.querySelector('sub')).toBeNull();
    expect(parsed.documentElement.textContent).toBe('注');
  });

  it('limits copied source text when repeatedly slicing a long SSML sentence', async () => {
    const text = '汉'.repeat(1400);
    async function* long() { yield sentence(text, 0); }
    const clone = vi.spyOn(Node.prototype, 'cloneNode');
    try {
      const buffer = new TTSSpeechBuffer(long());
      let index = 0;
      for (;;) {
        const chunk = await buffer.chunk(index, 90, settings);
        if (!chunk) break;
        index = chunk.endIndex + 1;
      }
      const copied = clone.mock.calls.reduce((sum, [deep], index) => sum +
        (deep ? (clone.mock.contexts[index] as Node).textContent?.length || 0 : 0), 0);
      expect(copied).toBeLessThan(text.length * 3);
    } finally { clone.mockRestore(); }
  });

  it('rebuilds retained speech controls when the selected voice or rate changes', async () => {
    async function* short() { yield sentence('你好。', 0); }
    const buffer = new TTSSpeechBuffer(short());
    await buffer.chunk(0, 12, settings);
    const changed = await buffer.chunk(0, 12, { ...settings, voiceName: 'zh-CN-YunxiNeural',
      rate: 50 });
    const parsed = new DOMParser().parseFromString(changed!.ssml, 'application/xml');
    expect(parsed.querySelector('voice')?.getAttribute('name')).toBe('zh-CN-YunxiNeural');
    expect(parsed.querySelector('prosody')?.getAttribute('rate')).toBe('+50%');
  });

  it('falls back to readable text when a source has malformed SSML', async () => {
    async function* broken() {
      yield { ...sentence('Readable text.', 0), ssml: '<speak><broken>' };
    }
    const chunk = await new TTSSpeechBuffer(broken()).chunk(0, 12, settings);
    expect(getTextFromSSML(chunk!.ssml)).toBe('Readable text.');
    expect(new DOMParser().parseFromString(chunk!.ssml, 'application/xml')
      .querySelector('parsererror')).toBeNull();
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

  it('does not synthesize XML payloads for skipped text before a requested cursor', async () => {
    async function* many() {
      for (let index = 0; index < 800; index++) yield sentence('短句。', index);
    }
    const parser = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const chunk = await new TTSSpeechBuffer(many()).chunk(700, 1, settings);
      expect(chunk?.marks[0].cfi).toBe('word-700');
      expect(parser.mock.calls.length).toBeLessThan(20);
    } finally { parser.mockRestore(); }
  });

  it('bounds consumed text history during long reading sessions', async () => {
    async function* many() {
      for (let i = 0; i < 800; i++) yield sentence('短句。', i);
    }
    const buffer = new TTSSpeechBuffer(many());
    const current = await buffer.chunk(700, 1, settings);
    expect(current?.marks[0].cfi).toBe('word-700');
    expect(buffer.firstSentenceIndex).toBe(444);
    expect(await buffer.chunk(443, 1, settings)).toBeNull();
    expect((await buffer.chunk(699, 1, settings))?.marks[0].cfi).toBe('word-699');
  });
});
