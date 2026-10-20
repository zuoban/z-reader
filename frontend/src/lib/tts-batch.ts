import { buildAzureSSML, isSkippableTTSText } from '@/lib/tts';
import { estimateSpokenSeconds } from '@/lib/tts-text';
import * as CFI from '../../public/foliate/epubcfi.js';
import type { TTSMark, TTSSettings } from '@/lib/tts';
import type { TTSSentence } from '@/lib/types';

export const TTS_FIRST_CHUNK_SECONDS = 12;
export const TTS_CHUNK_SECONDS = 90;
export const TTS_BUFFER_SECONDS = 180;
const MAX_CHUNK_BYTES = 30 * 1024;
const ENVELOPE_BYTES = 1024;
// Calibration can halve the initial 12-second target without changing retained slice indexes.
const MAX_SLICE_SECONDS = TTS_FIRST_CHUNK_SECONDS / 2;
const SENTENCE_PAUSE_SECONDS = 0.24;
const NS = 'http://www.w3.org/2001/10/synthesis';
const encoder = new TextEncoder();

export interface TTSAudioChunk {
  ssml: string;
  marks: TTSMark[];
  startIndex: number;
  endIndex: number;
  estimatedSeconds: number;
}

export const estimateTTSDuration = estimateSpokenSeconds;

/** Find an offset in sorted source runs without rescanning an entire long sentence per slice. */
function firstEndingAfter<T extends { end: number }>(
  entries: T[], offset: number, inclusive = false,
): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (inclusive ? entries[middle].end >= offset : entries[middle].end > offset) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Exact character offsets are relative to a real source text-node range, not a guessed CFI. */
function rangeCFI(sentence: TTSSentence, start: number, end: number): string {
  const ranges = sentence.textRanges;
  if (!ranges?.length) return sentence.cfi;
  const first = ranges[firstEndingAfter(ranges, start)];
  const last = ranges[firstEndingAfter(ranges, end, true)];
  if (!first || !last) return sentence.cfi;
  const point = (range: typeof first, offset: number): string => {
    const parsed = CFI.collapse(CFI.parse(range.cfi));
    const terminal = parsed.at(-1)!.at(-1)!;
    terminal.offset = (terminal.offset ?? 0) + offset - range.start;
    return CFI.toString(parsed);
  };
  return CFI.buildRange(point(first, start), point(last, end));
}

interface SpeechNode {
  node: Node;
  start: number;
  end: number;
  children: SpeechNode[];
  atomic: boolean;
  pronunciationSeconds: number;
}

interface SpeechTree {
  root: SpeechNode;
  text: string;
  atomics: SpeechNode[];
}

const pronunciationElements = new Set(['phoneme', 'sub', 'say-as']);

/** Index the speech-only XML once; each slice copies only its intersecting nodes. */
function indexSSML(root: Element): SpeechTree {
  let offset = 0;
  const texts: string[] = [];
  const atomics: SpeechNode[] = [];
  const visit = (node: Node, insideAtomic = false): SpeechNode => {
    const entry: SpeechNode = { node, start: offset, end: offset, children: [],
      pronunciationSeconds: 0,
      atomic: node.nodeType === Node.ELEMENT_NODE &&
        pronunciationElements.has((node as Element).localName.toLowerCase()) };
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      const text = node.textContent || '';
      texts.push(text);
      offset += text.length;
    } else {
      for (const child of Array.from(node.childNodes))
        entry.children.push(visit(child, insideAtomic || entry.atomic));
    }
    entry.end = offset;
    if (entry.atomic && !insideAtomic) atomics.push(entry);
    return entry;
  };
  const indexedRoot = visit(root);
  atomics.sort((a, b) => a.start - b.start || b.end - a.end);
  const text = texts.join('');
  for (const atomic of atomics) {
    const element = atomic.node as Element;
    const body = text.slice(atomic.start, atomic.end);
    const override = element.getAttribute('alias') || element.getAttribute('ph') || '';
    const phonemeSeconds = element.localName.toLowerCase() === 'phoneme'
      ? Array.from(override.replace(/\s/g, '')).length / 12 : 0;
    const spellingSeconds = /^(characters|spell-out)$/i.test(element.getAttribute('interpret-as') || '')
      ? Array.from(body).filter(character => /[\p{L}\p{N}]/u.test(character)).length / 2.5 : 0;
    atomic.pronunciationSeconds = Math.max(estimateTTSDuration(body),
      estimateTTSDuration(override), phonemeSeconds, spellingSeconds);
  }
  return { root: indexedRoot, text, atomics };
}

/** A partial pronunciation override has no valid partial ph/alias, so read that text normally. */
function speechSpeed(rate: number): number {
  return Math.max(0.25, 1 + (Number.isFinite(rate) ? rate : 0) / 100);
}

function slicedDuration(
  tree: SpeechTree, start: number, end: number, rate: number, budget: number,
): number {
  let seconds = estimateTTSDuration(tree.text.slice(start, end));
  const speed = speechSpeed(rate);
  for (let index = firstEndingAfter(tree.atomics, start);
    index < tree.atomics.length && tree.atomics[index].start < end; index += 1) {
    const atomic = tree.atomics[index];
    if (atomic.start < start || atomic.end > end || atomic.pronunciationSeconds / speed > budget)
      continue;
    seconds += atomic.pronunciationSeconds -
      estimateTTSDuration(tree.text.slice(atomic.start, atomic.end));
  }
  return seconds / speed;
}

function sliceSSML(
  tree: SpeechTree, start: number, end: number, rate: number, budget: number,
): Element {
  const doc = tree.root.node.ownerDocument!;
  const copy = (entry: SpeechNode): Node | null => {
    const { node } = entry;
    if (entry.end < start || entry.start >= end || entry.end === start && entry.start < start)
      return null;
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE ||
        entry.atomic && (entry.start < start || entry.end > end ||
          entry.pronunciationSeconds / speechSpeed(rate) > budget)) {
      return doc.createTextNode(tree.text.slice(Math.max(start, entry.start),
        Math.min(end, entry.end)));
    }
    const cloned = node.cloneNode(false);
    for (let index = firstEndingAfter(entry.children, start, true);
      index < entry.children.length && entry.children[index].start < end; index += 1) {
      const child = copy(entry.children[index]);
      if (child) cloned.appendChild(child);
    }
    return cloned;
  };
  return copy(tree.root) as Element;
}

function sliceSentence(
  source: TTSSentence, tree: SpeechTree, start: number, end: number,
  rawRoot: Element,
): TTSSentence {
  if (start === 0 && end === source.text.length && !tree.atomics.length) return source;
  const words: TTSSentence['words'] = [];
  for (let index = firstEndingAfter(source.words as Array<{ end: number }>, start);
    index < source.words.length; index += 1) {
    const word = source.words[index];
    const wordStart = word.start!;
    if (wordStart >= end) break;
    const wordEnd = word.end!;
    const from = Math.max(start, wordStart);
    const to = Math.min(end, wordEnd);
    if (wordStart < 0 || to <= from) continue;
    words.push({ text: source.text.slice(from, to),
      cfi: from === wordStart && to === wordEnd ? word.cfi : rangeCFI(source, from, to),
      start: from - start, end: to - start });
  }
  const textRanges = source.textRanges ? [] as NonNullable<TTSSentence['textRanges']> : undefined;
  if (textRanges && source.textRanges) {
    for (let index = firstEndingAfter(source.textRanges, start);
      index < source.textRanges.length && source.textRanges[index].start < end; index += 1) {
      const range = source.textRanges[index];
      const from = Math.max(start, range.start);
      const to = Math.min(end, range.end);
      textRanges.push({ start: from - start, end: to - start, cfi: rangeCFI(source, from, to) });
    }
  }
  return { ...source, text: source.text.slice(start, end), cfi: rangeCFI(source, start, end),
    ssml: new XMLSerializer().serializeToString(rawRoot), words, textRanges };
}

/** Bound raw XML plus every possible added pause/namespace before building the final chunk. */
function conservativeBytes(root: Element, text: string): number {
  const xml = new XMLSerializer().serializeToString(root);
  const punctuation = text.match(/[，,、；;：:。.!！？?…\n]/gu)?.length || 0;
  const marks = root.getElementsByTagNameNS('*', 'mark').length;
  return encoder.encode(xml).length + punctuation * 64 + root.children.length * 80 + marks * 40;
}

function getRawRoot(entry: BufferedSentence): Element {
  if (entry.rawRoot) return entry.rawRoot;
  const parsed = new DOMParser().parseFromString(entry.sentence.ssml, 'application/xml');
  if (parsed.querySelector('parsererror')) {
    const fallback = document.implementation.createDocument(NS, 'speak');
    fallback.documentElement.textContent = entry.sentence.text;
    entry.rawRoot = fallback.documentElement;
  } else entry.rawRoot = parsed.documentElement;
  return entry.rawRoot;
}

interface BufferedSentence {
  sentence: TTSSentence;
  sourceIndex: number;
  sentenceCfi: string;
  sentenceText: string;
  rawRoot: Element | null;
  rawBytes: number | null;
  durationAtBaseRate: number;
}

interface PendingSentence {
  sentence: TTSSentence;
  /** A speech-only XML copy, never the detached EPUB document or a live reader Range. */
  tree: SpeechTree;
  offsets: number[];
  position: number;
  sourceIndex: number;
}

/** A text/CFI queue: playback never has to wait for renderer navigation or layout. */
export class TTSSpeechBuffer {
  private iterator: AsyncIterator<TTSSentence>;
  private sentences: BufferedSentence[] = [];
  private baseIndex = 0;
  private sourceIndex = 0;
  private pending: PendingSentence | null = null;
  private done = false;
  private disposed = false;
  private reading: Promise<unknown> = Promise.resolve();

  constructor(source: AsyncIterable<TTSSentence>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  get firstSentenceIndex(): number { return this.baseIndex; }

  dispose(): void {
    this.disposed = true;
    this.sentences = [];
    this.pending = null;
    void Promise.resolve(this.iterator.return?.()).catch(() => {});
  }

  private beginSentence(
    sentence: TTSSentence, targetSeconds: number, settings: TTSSettings,
  ): void {
    // Small intact sentences need no XML work until they are actually requested for audio.
    // The conservative input cap leaves ample room for added prosody markup and the voice shell.
    if (estimateTTSDuration(sentence.text, settings.rate) <=
        Math.min(MAX_SLICE_SECONDS, targetSeconds) &&
        encoder.encode(sentence.ssml).length <= 512 &&
        !/<(?:[\w.-]+:)?(?:phoneme|sub|say-as)(?:\s|>)/i.test(sentence.ssml)) {
      this.sentences.push({ sentence, sourceIndex: this.sourceIndex++,
        sentenceCfi: sentence.cfi, sentenceText: sentence.text, rawRoot: null, rawBytes: null,
        durationAtBaseRate: estimateTTSDuration(sentence.text) });
      return;
    }
    const parsed = new DOMParser().parseFromString(sentence.ssml, 'application/xml');
    if (parsed.querySelector('parsererror')) parsed.documentElement.textContent = sentence.text;
    const offsets = [0];
    for (const character of sentence.text) offsets.push(offsets.at(-1)! + character.length);
    let searchOffset = 0;
    const words = sentence.words.map(word => {
      const start = word.start ?? sentence.text.indexOf(word.text, searchOffset);
      const end = word.end ?? start + word.text.length;
      searchOffset = end;
      return { ...word, start, end };
    });
    this.pending = { sentence: { ...sentence, words }, tree: indexSSML(parsed.documentElement),
      offsets, position: 0, sourceIndex: this.sourceIndex++ };
  }

  private appendNext(targetSeconds: number, settings: TTSSettings): void {
    const pending = this.pending!;
    const { sentence: source, tree, offsets, position, sourceIndex } = pending;
    const length = offsets.length - 1;
    const budget = Math.min(MAX_SLICE_SECONDS, targetSeconds);
    const duration = (end: number): number => slicedDuration(
      tree, offsets[position], offsets[end], settings.rate, budget);
    let low = position + 1;
    let high = Math.min(length, position + 64);
    while (high < length && duration(high) <= budget)
      high = Math.min(length, position + (high - position) * 2);
    let best = position;
    // The exponential search bounds work for a long sentence to its next small prefix.
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (duration(middle) <= budget) {
        best = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    // A single code point is the smallest safe unit; real targets are at least several seconds.
    if (best === position) best = position + 1;
    for (let index = firstEndingAfter(tree.atomics, offsets[position]);
      index < tree.atomics.length && tree.atomics[index].start < offsets[best]; index += 1) {
      const atomic = tree.atomics[index];
      if (atomic.start > offsets[position] && atomic.end > offsets[best] &&
          atomic.pronunciationSeconds / speechSpeed(settings.rate) <= budget) {
        let from = position + 1;
        let to = best;
        while (from < to) {
          const middle = Math.floor((from + to) / 2);
          if (offsets[middle] >= atomic.start) to = middle;
          else from = middle + 1;
        }
        best = from;
        break;
      }
    }
    let rawRoot = sliceSSML(tree, offsets[position], offsets[best], settings.rate, budget);
    let sentence = sliceSentence(source, tree, offsets[position], offsets[best], rawRoot);
    let rawBytes = conservativeBytes(rawRoot, sentence.text);
    while (rawBytes > MAX_CHUNK_BYTES - ENVELOPE_BYTES && best > position + 1) {
      best = position + Math.max(1, Math.floor((best - position) / 2));
      rawRoot = sliceSSML(tree, offsets[position], offsets[best], settings.rate, budget);
      sentence = sliceSentence(source, tree, offsets[position], offsets[best], rawRoot);
      rawBytes = conservativeBytes(rawRoot, sentence.text);
    }
    if (rawBytes > MAX_CHUNK_BYTES - ENVELOPE_BYTES)
      throw new Error('朗读片段超出语音服务限制');
    this.sentences.push({ sentence, sourceIndex, sentenceCfi: source.cfi,
      sentenceText: source.text, rawRoot, rawBytes,
      durationAtBaseRate: duration(best) * speechSpeed(settings.rate) });
    pending.position = best;
    if (best === length) this.pending = null;
  }

  private async ensure(
    index: number, targetSeconds: number, settings: TTSSettings,
  ): Promise<boolean> {
    while (!this.disposed && !this.done && this.baseIndex + this.sentences.length <= index) {
      if (this.pending) {
        this.appendNext(targetSeconds, settings);
        continue;
      }
      const next = await this.iterator.next();
      if (this.disposed) return false;
      if (next.done) { this.done = true; break; }
      if (isSkippableTTSText(next.value.text)) continue;
      this.beginSentence(next.value, targetSeconds, settings);
    }
    return !this.disposed && index >= this.baseIndex &&
      index < this.baseIndex + this.sentences.length;
  }

  async chunk(
    startIndex: number, targetSeconds: number, settings: TTSSettings,
  ): Promise<TTSAudioChunk | null> {
    const result = this.reading.then(() => this.readChunk(startIndex, targetSeconds, settings));
    this.reading = result.catch(() => {});
    return result;
  }

  /** Navigate semantic sentences even when one sentence occupies several stable queue indexes. */
  async adjacentSentenceIndex(
    index: number, direction: -1 | 1, settings: TTSSettings,
  ): Promise<number | null> {
    const result = this.reading.then(async () => {
      if (!await this.ensure(index, MAX_SLICE_SECONDS, settings)) return null;
      const sourceIndex = this.sentences[index - this.baseIndex].sourceIndex;
      let cursor = index + direction;
      if (direction === 1) {
        if (this.pending?.sourceIndex === sourceIndex) {
          // A jump abandons this source sentence. Expire its retained history rather than
          // manufacturing thousands of indexes/word copies for speech the user has skipped.
          // Absolute indexes already issued stay stable; previous-sentence recovery uses CFI.
          this.baseIndex += this.sentences.length;
          this.sentences = [];
          this.pending = null;
          cursor = this.baseIndex;
        }
        while (await this.ensure(cursor, MAX_SLICE_SECONDS, settings)) {
          if (this.sentences[cursor - this.baseIndex].sourceIndex !== sourceIndex) return cursor;
          cursor += 1;
        }
        return null;
      }
      while (cursor >= this.baseIndex &&
        this.sentences[cursor - this.baseIndex].sourceIndex === sourceIndex) cursor -= 1;
      if (cursor < this.baseIndex) return null;
      const previousSource = this.sentences[cursor - this.baseIndex].sourceIndex;
      while (cursor > this.baseIndex &&
        this.sentences[cursor - this.baseIndex - 1].sourceIndex === previousSource) cursor -= 1;
      return cursor;
    });
    this.reading = result.catch(() => {});
    return result;
  }

  private async readChunk(
    startIndex: number, targetSeconds: number, settings: TTSSettings,
  ): Promise<TTSAudioChunk | null> {
    if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return null;
    if (!await this.ensure(startIndex, targetSeconds, settings)) return null;
    const keepFrom = Math.max(this.baseIndex, startIndex - 256);
    this.sentences.splice(0, keepFrom - this.baseIndex);
    this.baseIndex = keepFrom;
    const doc = document.implementation.createDocument(NS, 'speak');
    const speak = doc.documentElement;
    const serializer = new XMLSerializer();
    const batch: BufferedSentence[] = [];
    let estimatedSeconds = 0;
    let bytes = ENVELOPE_BYTES + encoder.encode(settings.voiceName + (settings.style || '')).length * 6;
    for (let index = startIndex; await this.ensure(index, targetSeconds, settings); index += 1) {
      const entry = this.sentences[index - this.baseIndex];
      const addPause = batch.length > 0 && batch.at(-1)!.sourceIndex !== entry.sourceIndex;
      const seconds = entry.durationAtBaseRate / speechSpeed(settings.rate) +
        (addPause ? SENTENCE_PAUSE_SECONDS : 0);
      if (batch.length && estimatedSeconds + seconds > targetSeconds) break;
      const rawRoot = getRawRoot(entry);
      const nodes = Array.from(rawRoot.childNodes);
      entry.rawBytes ??= conservativeBytes(rawRoot, entry.sentence.text);
      const addedBytes = entry.rawBytes + (addPause ? 21 : 0);
      if (bytes + addedBytes > MAX_CHUNK_BYTES) {
        if (!batch.length) throw new Error('朗读片段超出语音服务限制');
        break;
      }
      if (addPause) {
        const pause = doc.createElementNS(NS, 'break');
        pause.setAttribute('time', '240ms');
        speak.appendChild(pause);
      }
      for (const node of nodes) speak.appendChild(doc.importNode(node, true));
      bytes += addedBytes;
      batch.push(entry);
      estimatedSeconds += seconds;
      if (estimatedSeconds >= targetSeconds) break;
    }
    if (this.disposed || !batch.length) return null;
    const marks: TTSMark[] = [];
    batch.forEach((entry, offset) => {
      const sentence = entry.sentence;
      const words = sentence.words.length ? sentence.words :
        [{ text: sentence.text, cfi: sentence.cfi, start: 0, end: sentence.text.length }];
      let searchOffset = 0;
      words.forEach((word, wordIndex) => {
        const start = word.start ?? sentence.text.indexOf(word.text, searchOffset);
        const next = words[wordIndex + 1];
        const end = next?.start ?? (next ? sentence.text.indexOf(next.text,
          Math.max(0, start) + word.text.length) : sentence.text.length);
        searchOffset = Math.max(0, start) + word.text.length;
        marks.push({ name: String(marks.length), text: word.text, cfi: word.cfi,
          sentenceCfi: entry.sentenceCfi, sentenceText: entry.sentenceText,
          sentenceIndex: startIndex + offset,
          weight: estimateTTSDuration(sentence.text.slice(Math.max(0, start),
            end < 0 ? sentence.text.length : end), settings.rate) });
      });
    });
    const ssml = buildAzureSSML(serializer.serializeToString(doc), settings);
    if (encoder.encode(ssml).length > MAX_CHUNK_BYTES)
      throw new Error('朗读片段超出语音服务限制');
    return { ssml, marks, startIndex, endIndex: startIndex + batch.length - 1, estimatedSeconds };
  }
}
