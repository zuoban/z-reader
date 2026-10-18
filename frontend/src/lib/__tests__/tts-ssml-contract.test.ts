import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { getTTSSentences } from '../../../public/foliate/tts.js';
import { textWalker } from '../../../public/foliate/text-walker.js';
import { TTSSpeechBuffer } from '@/lib/tts-batch';

it('shares the actual background speech payload with the backend sanitizer regression', async () => {
  const chapter = new DOMParser().parseFromString(
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN"><head/><body>' +
    '<p>第一句。</p><p xml:lang="en-US">Second sentence.</p></body></html>',
    'application/xhtml+xml',
  );
  async function* sentences() {
    for (const sentence of getTTSSentences(chapter, textWalker, () => 'cfi', null)) {
      yield { ...sentence, sectionIndex: 0 };
    }
  }
  const chunk = await new TTSSpeechBuffer(sentences()).chunk(0, 90, {
    voiceName: 'zh-CN-XiaoxiaoMultilingualNeural', rate: 0,
    style: 'general', highlightMode: 'word',
  });
  const fixture = readFileSync(resolve(
    process.cwd(), '../backend/utils/testdata/background-tts.ssml',
  ), 'utf8').trim();
  const actual = new DOMParser().parseFromString(chunk!.ssml, 'application/xml');
  const expected = new DOMParser().parseFromString(fixture, 'application/xml');
  expect(actual.querySelector('parsererror')).toBeNull();
  expect(actual.documentElement.isEqualNode(expected.documentElement)).toBe(true);
});
