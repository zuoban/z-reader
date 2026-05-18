/**
 * Polyfills for foliate-js compatibility on older mobile browsers
 * Must be executed before loading foliate/view.js
 */

export function injectFoliatePolyfills(): void {
  if (typeof window === 'undefined') return;

  // Polyfill ResizeObserver for older browsers
  if (typeof window.ResizeObserver === 'undefined') {
    console.warn('[Polyfill] Adding ResizeObserver polyfill');
    window.ResizeObserver = class ResizeObserver {
      private callback: ResizeObserverCallback;
      private elements: WeakMap<Element, object>;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        this.elements = new WeakMap();
      }

      observe(element: Element): void {
        this.elements.set(element, {});
        // Trigger callback once with dummy data
        window.setTimeout(() => {
          const entry = {
            target: element,
            contentRect: element.getBoundingClientRect(),
          } as ResizeObserverEntry;
          this.callback([entry], this);
        }, 0);
      }

      unobserve(element: Element): void {
        this.elements.delete(element);
      }

      disconnect(): void {
        this.elements = new WeakMap();
      }
    };
  }

  // Polyfill Blob.prototype.arrayBuffer for older browsers
  if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
    console.warn('[Polyfill] Adding Blob.arrayBuffer polyfill');
    Blob.prototype.arrayBuffer = function(this: Blob): Promise<ArrayBuffer> {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }

  // Polyfill Blob.prototype.slice for older browsers (some use webkitSlice/mozSlice)
  if (typeof Blob !== 'undefined' && !Blob.prototype.slice) {
    console.warn('[Polyfill] Adding Blob.slice polyfill');
    Blob.prototype.slice = function(this: Blob, start?: number, end?: number): Blob {
      const legacyBlob = this as Blob & {
        webkitSlice?: Blob['slice'];
        mozSlice?: Blob['slice'];
      };
      if (legacyBlob.webkitSlice) return legacyBlob.webkitSlice(start, end);
      if (legacyBlob.mozSlice) return legacyBlob.mozSlice(start, end);
      return this;
    };
  }

  // Ensure document.fonts.ready exists
  if (typeof document !== 'undefined' && document.fonts && !document.fonts.ready) {
    console.warn('[Polyfill] Adding document.fonts.ready polyfill');
    Object.defineProperty(document.fonts, 'ready', {
      configurable: true,
      value: Promise.resolve(document.fonts),
    });
  }
}
