import { describe, expect, it } from 'vitest';
import { getTTSSentences } from '../../../public/foliate/tts.js';
import { textWalker } from '../../../public/foliate/text-walker.js';

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
});
