import { describe, expect, it } from 'vitest';

import { buildAzureSSML } from '@/lib/tts';
import { estimateSpokenSeconds as estimate } from '@/lib/tts-text';

function speak(text: string) {
  return new DOMParser().parseFromString(buildAzureSSML(text, {
    voiceName: 'zh-CN-XiaoyiNeural', rate: 0, highlightMode: 'word',
  }), 'application/xml');
}

describe('contextual TTS prosody', () => {
  it.each([
    'Version 1.2.3 costs 3.14 dollars',
    'Dr. Smith met Mr. Jones at 9:30',
    'For example, e.g. the U.S. team',
    'Visit https://example.com/docs?v=1.2 or reader.example.org',
    'There are 1,234 items',
  ])('keeps lexical punctuation intact in %s', (text) => {
    const doc = speak(text);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('prosody')?.textContent).toBe(text);
    const breaks = [...doc.querySelectorAll('break')];
    expect(breaks).toHaveLength(text.startsWith('For example,') ? 1 : 0);
  });

  it('adds one pause for an ellipsis or mixed sentence punctuation', () => {
    const doc = speak('等等……真的？！好吧...继续。');
    expect(doc.querySelector('prosody')?.textContent).toBe('等等……真的？！好吧...继续。');
    expect(doc.querySelectorAll('break')).toHaveLength(3);
  });

  it('uses existing breaks and sentence boundaries without duplicate pauses', () => {
    const doc = speak('<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      '<s>第一句。</s><s>第二句！<break time="500ms"/>继续。</s></speak>');
    expect(doc.querySelectorAll('break')).toHaveLength(1);
    expect(doc.querySelector('break')?.getAttribute('time')).toBe('500ms');
  });

  it('honors a following break nested inside emphasis instead of stacking a new pause', () => {
    const doc = speak('<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      '等等！<bookmark mark="position"/><emphasis><break time="500ms"/>' +
      '继续</emphasis>。</speak>');
    expect(doc.querySelectorAll('break')).toHaveLength(1);
    expect(doc.querySelector('prosody')?.textContent).toBe('等等！继续。');
  });

  it('does not repeat a pause when sentence punctuation spans inline markup', () => {
    const doc = speak('<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      '真的吗？<emphasis>！</emphasis>继续。</speak>');
    expect(doc.querySelectorAll('break')).toHaveLength(1);
    expect(doc.querySelector('prosody')?.textContent).toBe('真的吗？！继续。');
  });

  it.each([
    ['3.<emphasis>14</emphasis> dollars', '3.14 dollars'],
    ['Version 1.<emphasis>2.</emphasis>3 is ready', 'Version 1.2.3 is ready'],
    ['Dr<emphasis>.</emphasis> Smith is here', 'Dr. Smith is here'],
    ['Visit reader<emphasis>.example.</emphasis>org today', 'Visit reader.example.org today'],
    ['.5 dollars', '.5 dollars'],
  ])('protects lexical punctuation across inline markup in %s', (markup, text) => {
    const doc = speak('<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      markup + '</speak>');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('prosody')?.textContent).toBe(text);
    expect(doc.querySelectorAll('break')).toHaveLength(0);
  });

  it.each([
    'hello,\nworld',
    'hello,<emphasis>\nworld</emphasis>',
    'hello,<emphasis>\n</emphasis>world',
  ])('uses one newline pause after adjacent punctuation in %s', (markup) => {
    const doc = speak('<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      markup + '</speak>');
    expect(doc.querySelector('prosody')?.textContent).toBe('hello,\nworld');
    expect(doc.querySelectorAll('break')).toHaveLength(1);
    expect(doc.querySelector('break')?.getAttribute('time')).toBe('360ms');
  });

  it('preserves pronunciation controls, emphasis and text across markup boundaries', () => {
    const doc = speak('<speak xmlns="http://www.w3.org/2001/10/synthesis">' +
      '你好，<emphasis level="moderate">世界</emphasis>。' +
      '<say-as interpret-as="characters">A.B</say-as>' +
      '<phoneme alphabet="ipa" ph="test">a.b</phoneme>' +
      '<sub alias="a dot b">a.b</sub><bookmark mark="spot"/></speak>');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('prosody')?.textContent).toBe('你好，世界。A.Ba.ba.b');
    expect(doc.querySelector('say-as')?.textContent).toBe('A.B');
    expect(doc.querySelector('phoneme')?.getAttribute('ph')).toBe('test');
    expect(doc.querySelector('sub')?.getAttribute('alias')).toBe('a dot b');
    expect(doc.querySelector('bookmark')?.getAttribute('mark')).toBe('spot');
    expect(doc.querySelector('emphasis')?.textContent).toBe('世界');
    expect(doc.querySelector('say-as break, phoneme break, sub break')).toBeNull();
  });
});

describe('spoken duration estimates', () => {
  it('estimates a short token below one second without losing numeric speech', () => {
    expect(estimate).toBeTypeOf('function');
    expect(estimate('你')).toBeGreaterThan(0);
    expect(estimate('你')).toBeLessThan(1);
    expect(estimate('2026')).toBeGreaterThan(0);
    expect(estimate('')).toBe(0);
    expect(estimate('...')).toBe(0);
  });

  it('counts semantic punctuation once and protects decimal and domain tokens', () => {
    expect(estimate('你好，世界。')).toBeGreaterThan(estimate('你好世界'));
    expect(estimate('你好？！世界')).toBeCloseTo(estimate('你好！世界'));
    expect(estimate('你好……世界')).toBeCloseTo(estimate('你好…世界'));
    expect(estimate('3.14')).toBeLessThan(estimate('3。14'));
    expect(estimate('reader.example.com')).toBeLessThan(estimate('reader. example. com'));
  });

  it('scales speech and pauses with the requested percentage rate', () => {
    expect(estimate('你好，world!', 100)).toBeCloseTo(estimate('你好，world!') / 2);
    expect(estimate('你好，world!', -50)).toBeCloseTo(estimate('你好，world!') * 2);
    expect(Number.isFinite(estimate('你好', -100))).toBe(true);
  });

  it('gives longer spoken Latin tokens more time than a short article', () => {
    expect(estimate('extraordinary')).toBeGreaterThan(estimate('a') * 2);
    expect(estimate('strengths')).toBeGreaterThan(estimate('a'));
    expect(estimate('extraordinary', 100)).toBeCloseTo(estimate('extraordinary') / 2);
  });

  it('keeps silent endings short while allowing pronounced syllabic endings', () => {
    expect(estimate('hope')).toBeCloseTo(estimate('hop'));
    expect(estimate('table')).toBeGreaterThan(estimate('tall'));
    expect(estimate('one two three four five')).toBeCloseTo(2);
    expect(estimate('你好世界')).toBe(1);
  });
});
