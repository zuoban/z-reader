const SSML_NAMESPACE = 'http://www.w3.org/2001/10/synthesis';
const PRONUNCIATION_ELEMENTS = new Set(['break', 'bookmark', 'mark', 'phoneme', 'say-as', 'sub']);
const SENTENCE_ELEMENTS = new Set(['s', 'p']);

interface Pause {
  end: number;
  seconds: number;
}

function normalizeText(text: string): string {
  return text
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\r?\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** Periods and separators inside these tokens carry meaning rather than a pause. */
function protectedPunctuation(text: string): Set<number> {
  const protectedIndices = new Set<number>();
  const patterns = [
    /(?:https?:\/\/|www\.)[^\s<>]+/giu,
    /\b[\p{L}\d_-]+(?:\.[\p{L}\d_-]+)*\.[\p{L}]{2,}(?:\/[^\s<>]*)?/giu,
    /\b(?:v?\d+)(?:[.,:]\d+)+\b/giu,
    /(?<![\p{L}\p{N}])\.\d+(?:[.,:]\d+)*\b/giu,
    /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|no|fig|inc|ltd)\./giu,
    /\b(?:[a-z]\.){2,}/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      // A URL's trailing punctuation still belongs to the surrounding sentence.
      const token = match[0].replace(/[，。；：！？,;!?]+$|(?<!\.)\.$/gu, '');
      const length = pattern === patterns[0] || pattern === patterns[1]
        ? token.length : match[0].length;
      for (let index = match.index; index < match.index + length; index += 1) {
        protectedIndices.add(index);
      }
    }
  }
  return protectedIndices;
}

function pausesInText(text: string): Pause[] {
  const protectedIndices = protectedPunctuation(text);
  const pauses: Pause[] = [];
  const punctuation = /[，,、；;：:]|[。.!！？?…]+|\n+/gu;
  for (const match of text.matchAll(punctuation)) {
    if (protectedIndices.has(match.index)) continue;
    const token = match[0];
    const seconds = /^[，,、]$/u.test(token) ? 0.12
      : /^[；;]$/u.test(token) ? 0.22
        : /^[：:]$/u.test(token) ? 0.18
          : token.includes('\n') ? 0.36
            : /^[.…]{2,}$/u.test(token) || token.includes('…') ? 0.26 : 0.32;
    pauses.push({ end: match.index + token.length, seconds });
  }
  return pauses;
}

function followingSignal(node: Node): 'speech' | 'pause' | null {
  if (node.nodeType === 3) {
    const text = node.textContent || '';
    if (/^[\s”’"'）)\]}»]*[，,、；;：:。.!！？?…\n]/u.test(text)) return 'pause';
    return /[\p{L}\p{N}]/u.test(text) ? 'speech' : null;
  }
  if (node.nodeType !== 1) return null;
  const name = (node as Element).localName.toLowerCase();
  if (name === 'break' || SENTENCE_ELEMENTS.has(name)) return 'pause';
  for (const child of node.childNodes) {
    const signal = followingSignal(child);
    if (signal) return signal;
  }
  return null;
}

/** Find following speech without crossing an explicit SSML sentence or pause boundary. */
function hasFollowingSpeech(node: Node, root: Element): boolean {
  let current: Node | null = node;
  while (current && current !== root) {
    for (let next = current.nextSibling; next; next = next.nextSibling) {
      const signal = followingSignal(next);
      if (signal) return signal === 'speech';
    }
    current = current.parentNode;
    if (current?.nodeType === 1 && SENTENCE_ELEMENTS.has((current as Element).localName)) {
      return false;
    }
  }
  return false;
}

interface SpeechText {
  node: Text;
  text: string;
  start: number;
  pauses: Pause[];
}

interface SpeechContext {
  text: string;
  entries: SpeechText[];
}

/** Inline formatting and bookmarks may divide one lexical token into several nodes. */
function collectSpeechContexts(root: Element): SpeechContext[] {
  const contexts: SpeechContext[] = [];
  let current: SpeechContext = { text: '', entries: [] };
  const flush = () => {
    if (current.entries.length) contexts.push(current);
    current = { text: '', entries: [] };
  };
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const text = normalizeText((node as Text).data);
      if (!text) return;
      current.entries.push({ node: node as Text, text, start: current.text.length, pauses: [] });
      current.text += text;
      return;
    }
    if (node.nodeType !== 1) return;
    const name = (node as Element).localName.toLowerCase();
    if (PRONUNCIATION_ELEMENTS.has(name)) {
      if (!['bookmark', 'mark'].includes(name)) flush();
      return;
    }
    const boundary = SENTENCE_ELEMENTS.has(name);
    if (boundary) flush();
    for (const child of node.childNodes) visit(child);
    if (boundary) flush();
  };
  visit(root);
  flush();
  return contexts;
}

/** Add contextual pauses while retaining pronunciation controls and all readable text. */
export function enhanceProsodyBreaks(doc: XMLDocument, root: Element): void {
  for (const context of collectSpeechContexts(root)) {
    let entryIndex = 0;
    for (const pause of pausesInText(context.text)) {
      while (entryIndex < context.entries.length - 1 &&
          pause.end > context.entries[entryIndex].start + context.entries[entryIndex].text.length) {
        entryIndex += 1;
      }
      const entry = context.entries[entryIndex];
      const following = context.text.slice(pause.end);
      // A nearby pause or the end of a sentence already provides this boundary.
      const speechAfter = /[\p{L}\p{N}]/u.test(following);
      const startsWithPause = /^[\s”’"'）)\]}»]*[，,、；;：:。.!！？?…\n]/u.test(following);
      if (startsWithPause || (!speechAfter && !hasFollowingSpeech(entry.node, root))) continue;
      if (!entry.text.trim() && !/[\p{L}\p{N}]/u.test(context.text.slice(0, pause.end))) continue;
      entry.pauses.push({ ...pause, end: pause.end - entry.start });
    }
    for (const entry of context.entries) {
      if (!entry.node.data.trim() && !entry.pauses.length) continue;
      const fragment = doc.createDocumentFragment();
      let start = 0;
      for (const pause of entry.pauses) {
        fragment.appendChild(doc.createTextNode(entry.text.slice(start, pause.end)));
        const element = doc.createElementNS(SSML_NAMESPACE, 'break');
        element.setAttribute('time', `${Math.round(pause.seconds * 1000)}ms`);
        fragment.appendChild(element);
        start = pause.end;
      }
      fragment.appendChild(doc.createTextNode(entry.text.slice(start)));
      entry.node.replaceWith(fragment);
    }
  }
}

/**
 * Vowel groups approximate Latin syllables; a final silent e contributes no group,
 * except in consonant + le endings. A length floor also accounts for dense consonant
 * clusters. The 240ms word onset plus 160ms per unit keeps short words near 2.5/s.
 * This is a timing heuristic, not a pronunciation dictionary or alignment model.
 */
function estimateWordSeconds(word: string): number {
  const letters = word.normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}]/gu, '');
  let syllables = letters.match(/[aeiouy]+/g)?.length || 1;
  if (syllables > 1 && letters.endsWith('e') && !/[bcdfghjklmnpqrstvwxz]le$/.test(letters)) {
    syllables -= 1;
  }
  return 0.24 + 0.16 * Math.max(1, syllables, letters.length / 6);
}

/** Approximate speech time for either a whole sentence or a single highlight token. */
export function estimateSpokenSeconds(text: string, rate = 0): number {
  const normalized = normalizeText(text);
  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const cjk = normalized.match(cjkPattern)?.length || 0;
  const remaining = normalized.replace(cjkPattern, ' ');
  const words = remaining.match(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu) || [];
  const digits = remaining.match(/\p{N}/gu)?.length || 0;
  if (cjk + words.length + digits === 0) return 0;

  const wordSeconds = words.reduce((seconds, word) => seconds + estimateWordSeconds(word), 0);
  const pauses = pausesInText(normalized).reduce((seconds, pause) => seconds + pause.seconds, 0);
  const speed = Math.max(0.25, 1 + (Number.isFinite(rate) ? rate : 0) / 100);
  return (cjk / 4 + wordSeconds + digits / 5 + pauses) / speed;
}
