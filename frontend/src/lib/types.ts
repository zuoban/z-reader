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
    getContents?: () => Array<{ doc: Document; index: number }>;
    page?: number;
    pages?: number;
  };
  lastLocation?: LastLocation;
  init?: (options?: { lastLocation?: string | null; showTextStart?: boolean }) => Promise<void>;
  initTTS?: (granularity?: string, highlight?: (range: Range) => void) => Promise<void>;
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
