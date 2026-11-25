import { enhanceProsodyBreaks } from '@/lib/tts-text';
import { MAX_BACKEND_SSML_BYTES, type TTSSettings } from './types';

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export function getUTF8ByteLength(value: string): number {
  if (utf8Encoder) {
    return utf8Encoder.encode(value).length;
  }
  return value.length;
}

export function isSSMLTooLarge(ssml: string): boolean {
  return getUTF8ByteLength(ssml) > MAX_BACKEND_SSML_BYTES;
}

export function stripSSML(ssml: string): string {
  return ssml
    .replace(/<\/?speak[^>]*>/gi, '')
    .replace(/<\/?mark[^>]*>/gi, '')
    .replace(/<\/?emphasis[^>]*>/gi, '')
    .replace(/<\/?break[^>]*>/gi, ' ')
    .replace(/<\/?phoneme[^>]*>/gi, '')
    .replace(/<\/?lang[^>]*>/gi, '')
    .replace(/<\/?voice[^>]*>/gi, '')
    .replace(/<\/?prosody[^>]*>/gi, '')
    .replace(/<\/?mstts:[^>]*>/gi, '')
    .replace(/<\/?bookmark[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function inferLocaleFromVoice(voiceName: string): string {
  const match = voiceName.match(/^([a-z]{2,3}-[A-Z]{2})-/);
  return match?.[1] ?? 'zh-CN';
}

function createParserErrorFreeDocument(source: string): XMLDocument | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return null;
  }

  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return null;
  }

  return doc;
}

export function getTextFromSSML(ssml: string): string {
  const doc = createParserErrorFreeDocument(ssml);
  const text = doc?.documentElement?.textContent?.trim();
  return text || stripSSML(ssml);
}

function getSignificantLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isTableLikeTTSText(text: string): boolean {
  const lines = getSignificantLines(text);
  if (lines.length < 2) return false;

  const tableLines = lines.filter((line) => {
    const pipeCount = (line.match(/\|/g) ?? []).length;
    const tabCount = (line.match(/\t/g) ?? []).length;
    const multiSpaceColumns = (line.match(/\S\s{2,}\S/g) ?? []).length;
    return pipeCount >= 2 || tabCount >= 2 || multiSpaceColumns >= 2;
  });

  return tableLines.length >= 2 && tableLines.length / lines.length >= 0.5;
}

function isCodeLikeTTSText(text: string): boolean {
  const lines = getSignificantLines(text);
  if (lines.length < 2) return false;

  const codeLinePatterns = [
    /^\s*(import|export|const|let|var|function|class|interface|type|return)\b/,
    /^\s*(if|else|for|while|switch|case|try|catch|finally)\b/,
    /^\s*(public|private|protected|static|async|await)\b/,
    /^\s*[{}[\]();,]+$/,
    /=>|===|!==|&&|\|\||<\/?[a-z][\w:-]*[^>]*>/i,
    /^\s*["']?[\w-]+["']?\s*:\s*["'{[\d]/,
  ];

  const codeLines = lines.filter((line) => {
    const symbolCount = (line.match(/[{}[\]();=<>/&|:]/g) ?? []).length;
    const symbolRatio = symbolCount / Math.max(line.length, 1);
    return codeLinePatterns.some((pattern) => pattern.test(line)) || symbolRatio > 0.24;
  });

  return codeLines.length >= 2 && codeLines.length / lines.length >= 0.5;
}

export function isSkippableTTSText(text: string): boolean {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, '')
    .trim();

  if (!normalized) return true;

  const compact = normalized.replace(/\s+/g, '');
  if (/^[·•*_\-.。．…]+$/.test(compact)) return true;
  if (/^[\p{P}\p{S}]+$/u.test(compact) && compact.length <= 8) return true;
  if (/^\.{3,}$/.test(compact) || /^…+$/.test(compact)) return true;
  if (isTableLikeTTSText(text)) return true;
  if (isCodeLikeTTSText(text)) return true;

  return false;
}

export function buildAzureSSML(content: string, settings: TTSSettings): string {
  const rateStr = settings.rate >= 0 ? `+${settings.rate}%` : `${settings.rate}%`;
  const originalDoc = createParserErrorFreeDocument(content);
  const originalRoot = originalDoc?.documentElement;
  const originalIsSpeak = originalRoot?.localName.toLowerCase() === 'speak';
  const lang =
    originalRoot?.getAttribute('xml:lang') ||
    originalRoot?.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ||
    originalRoot?.getAttribute('lang') ||
    inferLocaleFromVoice(settings.voiceName);

  const doc = document.implementation.createDocument(
    'http://www.w3.org/2001/10/synthesis',
    'speak',
  );
  const speak = doc.documentElement;
  speak.setAttribute('version', '1.0');
  speak.setAttributeNS(
    'http://www.w3.org/2000/xmlns/',
    'xmlns',
    'http://www.w3.org/2001/10/synthesis',
  );
  speak.setAttributeNS(
    'http://www.w3.org/2000/xmlns/',
    'xmlns:mstts',
    'http://www.w3.org/2001/mstts',
  );
  speak.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', lang);

  const voice = doc.createElementNS('http://www.w3.org/2001/10/synthesis', 'voice');
  voice.setAttribute('name', settings.voiceName);
  speak.appendChild(voice);

  const speechContainer = settings.style
    ? doc.createElementNS('http://www.w3.org/2001/mstts', 'mstts:express-as')
    : voice;

  if (settings.style && speechContainer instanceof Element) {
    speechContainer.setAttribute('style', settings.style);
    speechContainer.setAttribute('styledegree', '1.0');
    voice.appendChild(speechContainer);
  }

  const prosody = doc.createElementNS('http://www.w3.org/2001/10/synthesis', 'prosody');
  prosody.setAttribute('rate', rateStr);
  speechContainer.appendChild(prosody);

  if (originalDoc && originalRoot) {
    const sourceNodes = originalIsSpeak ? originalRoot.childNodes : originalDoc.childNodes;
    Array.from(sourceNodes).forEach((node) => {
      prosody.appendChild(doc.importNode(node, true));
    });
    Array.from(prosody.getElementsByTagName('mark')).forEach((mark) => {
      const name = mark.getAttribute('name');
      if (!name) return;

      const bookmark = doc.createElementNS(
        'http://www.w3.org/2001/10/synthesis',
        'bookmark',
      );
      bookmark.setAttribute('mark', name);
      mark.replaceWith(bookmark);
    });
  } else {
    prosody.appendChild(doc.createTextNode(content));
  }

  // Monolingual voices reject lang elements. Multilingual voices can detect
  // language from the text, so keep the contents without a language override.
  Array.from(prosody.getElementsByTagNameNS('*', 'lang')).forEach((language) => {
    language.replaceWith(...Array.from(language.childNodes));
  });

  enhanceProsodyBreaks(doc, prosody);

  return new XMLSerializer().serializeToString(doc);
}
