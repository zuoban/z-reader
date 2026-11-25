export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function withTimeout<T>(
  promise: Promise<T> | T,
  ms: number,
  message: string,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(signal.reason);
    };
    const timeoutId = window.setTimeout(() => {
      finish();
      reject(new Error(message));
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    void Promise.resolve(promise).then(resolve, reject).finally(finish);
  });
}

export function waitForNonZeroRect(
  element: HTMLElement,
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<void> {
  const startedAt = window.performance.now();

  return new Promise((resolve) => {
    const check = () => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        resolve();
        return;
      }
      if (window.performance.now() - startedAt >= timeoutMs) {
        resolve();
        return;
      }
      window.requestAnimationFrame(check);
    };

    check();
  });
}

/** Soft-wait until condition is true or timeout (ms). */
export async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  if (predicate()) return;
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    await sleep(32);
    if (predicate()) return;
  }
}

export function normalizeMetadataText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeMetadataText(item))
      .filter(Boolean)
      .join("、");
  }
  if (value && typeof value === "object") {
    const record = value as { name?: unknown; label?: unknown; text?: unknown };
    return (
      normalizeMetadataText(record.name) ||
      normalizeMetadataText(record.label) ||
      normalizeMetadataText(record.text)
    );
  }
  return "";
}

export function getReaderCompatibilityError(): string | null {
  if (typeof window === "undefined") return null;

  const missingFeatures = [
    ["自定义组件", "customElements" in window],
    ["iframe 渲染", typeof HTMLIFrameElement !== "undefined"],
    ["Range 定位", typeof Range !== "undefined"],
  ]
    .filter(([, supported]) => !supported)
    .map(([name]) => name);

  if (missingFeatures.length > 0) {
    return `当前浏览器缺少阅读器能力：${missingFeatures.join("、")}。请用 Chrome 浏览器打开。`;
  }

  return null;
}

export function shouldUseReaderCompatibilityMode(userAgent?: string): boolean {
  if (userAgent === undefined && typeof window === "undefined") return false;

  const ua = userAgent ?? window.navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  if (!isAndroid) return false;

  const isChrome = /Chrome\/|CriOS\//i.test(ua);
  const isEdge = /EdgA?\/|EdgiOS\//i.test(ua);
  const isFirefox = /Firefox\/|FxiOS\//i.test(ua);
  const isSamsungBrowser = /SamsungBrowser\//i.test(ua);
  const isAndroidWebView = /; wv\)|Version\/4\.0/i.test(ua);

  return isAndroidWebView || !(isChrome || isEdge || isFirefox || isSamsungBrowser);
}
