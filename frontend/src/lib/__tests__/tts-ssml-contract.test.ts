import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { getTTSSentences } from '../../../public/foliate/tts.js';
import { textWalker } from '../../../public/foliate/text-walker.js';
import { buildAzureSSML } from '@/lib/tts';
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
    process.cwd(), '../backend/utils/testdata/background-tts-v012.ssml',
  ), 'utf8').trim();
  const actual = new DOMParser().parseFromString(chunk!.ssml, 'application/xml');
  const expected = new DOMParser().parseFromString(fixture, 'application/xml');
  expect(actual.querySelector('parsererror')).toBeNull();
  expect(actual.documentElement.isEqualNode(expected.documentElement)).toBe(true);
});

it.each(['zh-CN-XiaoxiaoMultilingualNeural', 'zh-CN-XiaoyiNeural'])(
  'keeps text and speech controls without unsupported language overrides for %s',
  (voiceName) => {
    const ssml = buildAzureSSML(
      '<speak xmlns="http://www.w3.org/2001/10/synthesis"><lang xml:lang="zh-CN">' +
      '你好<emphasis level="moderate">世界</emphasis><lang xml:lang="en-US">' +
      '<phoneme alphabet="ipa" ph="həˈloʊ">hello</phoneme></lang>' +
      '<mark name="spot"/></lang></speak>',
      { voiceName, rate: 0, highlightMode: 'word' },
    );
    const doc = new DOMParser().parseFromString(ssml, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.getElementsByTagNameNS('*', 'lang')).toHaveLength(0);
    expect(doc.documentElement.textContent).toBe('你好世界hello');
    expect(doc.querySelector('voice')?.getAttribute('name')).toBe(voiceName);
    expect(doc.querySelector('emphasis')?.textContent).toBe('世界');
    expect(doc.querySelector('phoneme')?.getAttribute('ph')).toBe('həˈloʊ');
    expect(doc.querySelector('bookmark')?.getAttribute('mark')).toBe('spot');
  },
);
