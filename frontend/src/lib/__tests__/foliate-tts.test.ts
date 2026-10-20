import { describe, expect, it } from 'vitest';
import { getTTSSentences } from '../../../public/foliate/tts.js';
import { textWalker } from '../../../public/foliate/text-walker.js';
import * as CFI from '../../../public/foliate/epubcfi.js';

describe('detached Foliate speech text', () => {
  it('extracts text and word locations from an unrendered XHTML chapter', () => {
    const doc = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head/>' +
      '<body><h1>Chapter One</h1><p>Hello world. Another sentence.</p></body></html>',
      'application/xhtml+xml',
    );
    const sentences = [...getTTSSentences(doc, textWalker, (range: Range) => range.toString(), null)];
    expect(sentences.map(item => item.text).join(' ').replace(/\s+/g, ' '))
      .toContain('Hello world. Another sentence.');
    expect(sentences.flatMap(item => item.words).map(word => word.text)).toContain('world');
    for (const sentence of sentences) {
      expect(sentence.ssml).not.toMatch(/<mark[\s>]/);
      expect(new DOMParser().parseFromString(sentence.ssml, 'application/xml')
        .querySelector('parsererror')).toBeNull();
    }
  });

  it('resumes at a saved word without repeating earlier words or the prior sentence', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p>First sentence. Second sentence.</p>';
    const text = doc.querySelector('p')!.firstChild!;
    const start = doc.createRange();
    start.setStart(text, 'First sentence. Second '.length);
    start.setEnd(text, text.textContent!.length);
    const sentences = [...getTTSSentences(doc, textWalker, () => 'cfi', start)];
    expect(sentences[0].text).toBe('sentence.');
    expect(sentences).toHaveLength(1);
  });
  it('keeps numeric body content and excludes structural or hidden text', () => {
    const doc = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml" ' +
      'xmlns:epub="http://www.idpf.org/2007/ops"><head/><body>' +
      '<p>2026</p><p>100</p><p>Read <span epub:type="pagebreak">12</span>' +
      '<span role="doc-pagebreak">13</span><span hidden="hidden">hidden</span>' +
      '<span aria-hidden="true">secret</span><span style="display: none">invisible</span>' +
      '<script>script</script><style>style</style>this.</p>' +
      '<aside epub:type="footnote"><p>Footnote.</p></aside>' +
      '<aside role="doc-endnote">Endnote.</aside></body></html>',
      'application/xhtml+xml',
    );
    const sentences = [...getTTSSentences(doc, textWalker, CFI.fromRange, null)];
    expect(sentences.map(item => item.text).join('')).toBe('2026100Read this.');
    expect(sentences.map(item => new DOMParser().parseFromString(item.ssml, 'application/xml')
      .documentElement.textContent).join('')).toBe('2026100Read this.');
  });

  it('uses spoken offsets for words that cross excluded inline markers', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p>com<span role="doc-pagebreak">12</span>bine.</p>';
    const [sentence] = [...getTTSSentences(doc, textWalker, CFI.fromRange, null)];
    expect(sentence.text).toBe('combine.');
    expect(sentence.words.map(word => word.text)).toEqual(['combine']);
    expect(sentence.words[0]).toMatchObject({ start: 0, end: 7 });
  });

  it('materializes exact source text ranges and word offsets across inline elements', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p>Hello <em>world</em>. Again.</p>';
    const sentences = [...getTTSSentences(doc, textWalker, CFI.fromRange, null)];
    const first = sentences[0];
    expect(first.textRanges).toEqual([
      { start: 0, end: 6, cfi: expect.any(String) },
      { start: 6, end: 11, cfi: expect.any(String) },
      { start: 11, end: 13, cfi: expect.any(String) },
    ]);
    for (const entry of first.textRanges) {
      expect(CFI.toRange(doc, CFI.parse(entry.cfi)).toString())
        .toBe(first.text.slice(entry.start, entry.end));
    }
    expect(first.words.map(word => ({ text: word.text, start: word.start, end: word.end })))
      .toEqual([{ text: 'Hello', start: 0, end: 5 }, { text: 'world', start: 6, end: 11 }]);
  });
});
