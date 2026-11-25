"use client";

import foliateAssets from "@/lib/foliate-assets.generated.json";

const FOLIATE_VIEW_DEFINE_TIMEOUT_MS = 5000;

async function waitForFoliateView() {
  if (customElements.get("foliate-view")) return;

  let timeoutId: number | undefined;
  try {
    await Promise.race([
      customElements.whenDefined("foliate-view"),
      new Promise<void>((resolve) => {
        timeoutId = window.setTimeout(resolve, FOLIATE_VIEW_DEFINE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }

  if (!customElements.get("foliate-view")) {
    const script = document.querySelector('script[data-foliate-entry]');
    if (!script) {
      throw new Error("阅读器脚本未加载，请检查网络连接");
    }
    throw new Error("阅读器组件注册失败，请尝试使用 Chrome 浏览器");
  }
}

let foliateScriptPromise: Promise<void> | null = null;

/** Load foliate view.js once; safe to call from shelf prefetch and reader init. */
export function ensureFoliateScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("阅读器只能在浏览器中加载"));
  }
  if (customElements.get("foliate-view")) {
    return Promise.resolve();
  }
  if (foliateScriptPromise) return foliateScriptPromise;

  foliateScriptPromise = (async () => {
    for (const href of foliateAssets.preload) {
      if (document.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue;
      const preload = document.createElement("link");
      preload.rel = "modulepreload";
      preload.href = href;
      preload.crossOrigin = "anonymous";
      document.head.appendChild(preload);
    }
    const { injectFoliatePolyfills } = await import("@/lib/foliate-polyfills");
    injectFoliatePolyfills();

    const existing = document.querySelector(
      'script[data-foliate-entry]',
    ) as HTMLScriptElement | null;
    if (existing) {
      await waitForFoliateView();
      return;
    }

    const script = document.createElement("script");
    script.src = foliateAssets.entry;
    script.dataset.foliateEntry = "true";
    script.type = "module";
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer-when-downgrade";

    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          window.clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
          if (error) reject(error);
          else resolve();
        };
        const timeout = window.setTimeout(() => {
          finish(new Error("加载阅读器脚本超时，请检查网络连接"));
        }, 15000);
        script.onload = () => finish();
        script.onerror = () => finish(new Error("加载阅读器脚本失败，请尝试使用 Chrome 浏览器"));
        document.head.appendChild(script);
      });
      await waitForFoliateView();
    } catch (error) {
      script.remove();
      throw error;
    }
  })().catch((err) => {
    foliateScriptPromise = null;
    throw err;
  });

  return foliateScriptPromise;
}

/** Best-effort warmup for the reader module graph from shelf hover/focus. */
export function prefetchFoliateEngine(): void {
  if (typeof window === "undefined") return;
  void ensureFoliateScript().catch(() => {});
}
