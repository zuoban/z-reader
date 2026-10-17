import { buildAzureSSML, isSkippableTTSText } from '@/lib/tts';
import type { TTSMark, TTSSettings } from '@/lib/tts';
import type { TTSSentence } from '@/lib/types';

export const TTS_FIRST_CHUNK_SECONDS = 12;
export const TTS_CHUNK_SECONDS = 90;
export const TTS_BUFFER_SECONDS = 180;
const MAX_CHUNK_BYTES = 30 * 1024;

export interface TTSAudioChunk {
  ssml: string;
  marks: TTSMark[];
  startIndex: number;
  endIndex: number;
  estimatedSeconds: number;
}

export function estimateTTSDuration(text: string, rate = 0): number {
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const words = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ')
    .trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, (cjk / 4 + words / 2.5) / Math.max(0.25, 1 + rate / 100));
}

function mergeSSML(sentences: TTSSentence[], settings: TTSSettings): string {
  const doc = document.implementation.createDocument(
    'http://www.w3.org/2001/10/synthesis', 'speak',
  );
  for (const sentence of sentences) {
    if (doc.documentElement.hasChildNodes()) {
      const pause = doc.createElementNS(doc.documentElement.namespaceURI, 'break');
      pause.setAttribute('time', '240ms');
      doc.documentElement.appendChild(pause);
    }
    const parsed = new DOMParser().parseFromString(sentence.ssml, 'application/xml');
    if (parsed.querySelector('parsererror')) {
      doc.documentElement.appendChild(doc.createTextNode(sentence.text));
      continue;
    }
    const root = parsed.documentElement;
    const lang = doc.createElementNS(doc.documentElement.namespaceURI, 'lang');
    lang.setAttributeNS('http://www.w3.org/XML/1998/namespace',
      'xml:lang', root.getAttribute('xml:lang') ||
        settings.voiceName.match(/^([a-z]{2,3}-[A-Z]{2})-/)?.[1] || 'zh-CN');
    for (const node of Array.from(root.childNodes)) lang.appendChild(doc.importNode(node, true));
    doc.documentElement.appendChild(lang);
  }
  return buildAzureSSML(new XMLSerializer().serializeToString(doc), settings);
}

/** A text/CFI queue: playback never has to wait for renderer navigation or layout. */
export class TTSSpeechBuffer {
  private iterator: AsyncIterator<TTSSentence>;
  private sentences: TTSSentence[] = [];
  private baseIndex = 0;
  private done = false;
  private disposed = false;
  private reading: Promise<unknown> = Promise.resolve();

  constructor(source: AsyncIterable<TTSSentence>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  get firstSentenceIndex(): number { return this.baseIndex; }

  dispose(): void {
    this.disposed = true;
    void Promise.resolve(this.iterator.return?.()).catch(() => {});
  }

  private async ensure(index: number): Promise<boolean> {
    while (!this.disposed && !this.done && this.baseIndex + this.sentences.length <= index) {
      const next = await this.iterator.next();
      if (this.disposed) return false;
      if (next.done) { this.done = true; break; }
      if (isSkippableTTSText(next.value.text)) continue;
      // Bound both synthesis input and the duration of unpunctuated passages.
      if (estimateTTSDuration(next.value.text) > TTS_CHUNK_SECONDS ||
          new TextEncoder().encode(next.value.ssml).length > 16 * 1024) {
        const characters = Array.from(next.value.text);
        for (let offset = 0; offset < characters.length; offset += 250) {
          const text = characters.slice(offset, offset + 250).join('');
          const doc = document.implementation.createDocument(null, 'speak');
          doc.documentElement.textContent = text;
          this.sentences.push({
            ...next.value, text, words: [], ssml: new XMLSerializer().serializeToString(doc),
          });
        }
      } else {
        this.sentences.push(next.value);
      }
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

  private async readChunk(
    startIndex: number, targetSeconds: number, settings: TTSSettings,
  ): Promise<TTSAudioChunk | null> {
    if (!await this.ensure(startIndex)) return null;
    // Keep enough history for ordinary sentence navigation without retaining
    // the text/word CFIs of an entire book during hours of background playback.
    const keepFrom = Math.max(this.baseIndex, startIndex - 256);
    this.sentences.splice(0, keepFrom - this.baseIndex);
    this.baseIndex = keepFrom;
    const batch: TTSSentence[] = [];
    let estimatedSeconds = 0;
    let ssml = '';
    for (let index = startIndex; await this.ensure(index); index += 1) {
      const sentence = this.sentences[index - this.baseIndex];
      const candidate = mergeSSML([...batch, sentence], settings);
      if (new TextEncoder().encode(candidate).length > MAX_CHUNK_BYTES) {
        if (!batch.length) throw new Error('朗读片段超出语音服务限制');
        break;
      }
      batch.push(sentence);
      ssml = candidate;
      estimatedSeconds += estimateTTSDuration(sentence.text, settings.rate);
      if (estimatedSeconds >= targetSeconds) break;
    }
    if (this.disposed || !batch.length) return null;
    const marks: TTSMark[] = [];
    batch.forEach((sentence, offset) => {
      const words = settings.highlightMode === 'word' && sentence.words.length
        ? sentence.words : [{ text: sentence.text, cfi: sentence.cfi }];
      for (const word of words) {
        marks.push({
          name: String(marks.length), text: word.text, cfi: word.cfi,
          sentenceIndex: startIndex + offset,
          weight: estimateTTSDuration(word.text, settings.rate),
        });
      }
    });
    return { ssml, marks, startIndex, endIndex: startIndex + batch.length - 1, estimatedSeconds };
  }
}
