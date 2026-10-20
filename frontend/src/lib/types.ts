export interface TOCItem {
  label: string;
  href: string;
  subitems?: TOCItem[];
}

export interface LastLocation {
  cfi: string;
  range: Range;
  tocItem?: TOCItem;
  pageItem?: { label: string };
  location?: { current?: number };
}

export interface TTSSentence {
  ssml: string;
  text: string;
  cfi: string;
  sectionIndex: number;
  /** UTF-16 offsets into text, materialized while the source document is available. */
  textRanges?: Array<{ start: number; end: number; cfi: string }>;
  words: Array<{ text: string; cfi: string; start?: number; end?: number }>;
}

export interface FoliateView {
  book?: {
    metadata?: {
      title?: string;
      author?: string | string[];
    };
    toc?: TOCItem[];
  };
  tts?: {
    start?: () => string | null | undefined;
    from?: (range: Range) => string | null | undefined;
    resume?: () => string | null | undefined;
    next?: (paused?: boolean) => string | null | undefined;
    prev?: (paused?: boolean) => string | null | undefined;
    peekNextMultiple?: (count: number) => string[];
    clearHighlight?: () => void;
    setMark?: (name: string) => void;
    highlightCurrent?: () => void;
    getWordCount?: () => number;
    doc?: Document;
  };
  renderer?: HTMLElement & {
    scrollToAnchor?: (range: Range, highlight?: boolean) => void;
    setStyles?: (css: string) => void;
    next?: () => Promise<void>;
    prev?: () => Promise<void>;
    nextSection?: () => Promise<void>;
    prevSection?: () => Promise<void>;
    getContents?: () => Array<{ doc: Document; index: number }>;
    page?: number;
    pages?: number;
  };
  lastLocation?: LastLocation;
  init?: (options?: { lastLocation?: string | null; showTextStart?: boolean }) => Promise<void>;
  initTTS?: (granularity?: string, highlight?: (range: Range) => void) => Promise<void>;
  getTTSSentences?: (cfi?: string) => AsyncIterable<TTSSentence>;
  getTTSPreviousCFI?: (cfi: string) => Promise<string | null>;
  resolveCFI?: (cfi: string) => { index: number; anchor: (doc: Document) => Range };
  goTo?: (target: string | number) => Promise<void>;
  prev?: () => Promise<void>;
  next?: () => Promise<void>;
  open?: (file: string | File | Blob) => Promise<void>;
  close?: () => void;
  addEventListener?: (type: string, listener: (e: CustomEvent) => void) => void;
  removeEventListener?: (type: string, listener: (e: CustomEvent) => void) => void;
  parentNode: Node | null;
  style: CSSStyleDeclaration;
}
