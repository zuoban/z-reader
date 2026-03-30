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
    first?: () => string | null | undefined;
    resume?: () => string | null | undefined;
    next?: (paused?: boolean) => string | null | undefined;
    prev?: (paused?: boolean) => string | null | undefined;
    doc?: Document;
  };
  renderer?: {
    scrollToAnchor?: (range: Range, highlight?: boolean) => void;
    setStyles?: (css: string) => void;
    next?: () => Promise<void>;
    prev?: () => Promise<void>;
    getContents?: () => Array<{ doc: Document; index: number }>;
  };
  initTTS?: (granularity?: string, highlight?: (range: Range) => void) => Promise<void>;
  goTo?: (target: string | number) => Promise<void>;
  prev?: () => Promise<void>;
  next?: () => Promise<void>;
  open?: (file: File | Blob) => Promise<void>;
  close?: () => void;
  addEventListener?: (type: string, listener: (e: CustomEvent) => void) => void;
  removeEventListener?: (type: string, listener: (e: CustomEvent) => void) => void;
  parentNode: Node | null;
  style: CSSStyleDeclaration;
}

export interface TOCItem {
  label: string;
  href: string;
  subitems?: TOCItem[];
}