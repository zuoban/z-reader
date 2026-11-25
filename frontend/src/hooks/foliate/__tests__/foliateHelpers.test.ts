import { describe, expect, it, vi } from "vitest";
import { DEFAULT_READER_THEME } from "@/hooks/useReaderTheme";
import type { FoliateView } from "@/lib/types";
import {
  formatBookDownloadMessage,
  formatOpenBookError,
  pruneDisconnectedChapterCleanups,
} from "../bookLoader";
import {
  applyDarkInlineOverrides,
  createAppliedStyleCache,
  formatPageLabel,
  getRendererPreferencesKey,
  syncRendererPreferences,
  syncRendererStylesheet,
} from "../rendererStyles";
import {
  normalizeMetadataText,
  shouldUseReaderCompatibilityMode,
  withTimeout,
} from "../runtime";

describe("foliate runtime helpers", () => {
  it("normalizes string, array, object, and empty metadata values", () => {
    expect(normalizeMetadataText("  三体  ")).toBe("三体");
    expect(normalizeMetadataText(["  刘慈欣 ", { name: "译者" }, "", null])).toBe(
      "刘慈欣、译者",
    );
    expect(normalizeMetadataText({ label: "副标题" })).toBe("副标题");
    expect(normalizeMetadataText({ text: "纯文本" })).toBe("纯文本");
    expect(normalizeMetadataText(undefined)).toBe("");
    expect(normalizeMetadataText(42)).toBe("");
  });

  it("detects Android compatibility mode for WebView and unknown Android browsers only", () => {
    expect(
      shouldUseReaderCompatibilityMode(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
    ).toBe(false);
    expect(
      shouldUseReaderCompatibilityMode(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(
      shouldUseReaderCompatibilityMode(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(
      shouldUseReaderCompatibilityMode(
        "Mozilla/5.0 (Linux; Android 13; CustomDevice) AppleWebKit/537.36 Mobile Safari/537.36",
      ),
    ).toBe(true);
  });

  it("rejects with timeout or abort signal in withTimeout", async () => {
    const controller = new AbortController();
    await expect(
      withTimeout(Promise.resolve("ok"), 100, "timed out", controller.signal),
    ).resolves.toBe("ok");

    const never = new Promise<string>(() => {});
    const abortController = new AbortController();
    const pending = withTimeout(never, 5000, "timed out", abortController.signal);
    const reason = new Error("aborted");
    abortController.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
});

describe("foliate rendererStyles helpers", () => {
  it("formats page labels from renderer pages, pageItem label, or location current", () => {
    expect(formatPageLabel({ page: 3, pages: 12 })).toBe("3 / 10");
    expect(formatPageLabel({ page: 0, pages: 12 })).toBe("1 / 10");
    expect(formatPageLabel({ page: 20, pages: 12 })).toBe("10 / 10");
    expect(formatPageLabel({ page: 1, pages: 2 }, { label: "iv" })).toBe("iv");
    expect(formatPageLabel(null, undefined, { current: 42 })).toBe("位置 42");
    expect(formatPageLabel(null)).toBe("");
  });

  it("syncs stylesheet and renderer preferences with cache deduplication", () => {
    const setStyles = vi.fn();
    const setAttribute = vi.fn();
    const removeAttribute = vi.fn();
    const view = {
      renderer: {
        setStyles,
        setAttribute,
        removeAttribute,
      },
    } as unknown as FoliateView;
    const cache = createAppliedStyleCache();

    syncRendererStylesheet(view, "body { color: #000; }", cache);
    syncRendererStylesheet(view, "body { color: #000; }", cache);
    expect(setStyles).toHaveBeenCalledTimes(1);

    syncRendererPreferences(view, DEFAULT_READER_THEME, false, cache);
    const attrCallsAfterFirst = setAttribute.mock.calls.length;
    syncRendererPreferences(view, DEFAULT_READER_THEME, false, cache);
    expect(setAttribute).toHaveBeenCalledTimes(attrCallsAfterFirst);

    expect(getRendererPreferencesKey(DEFAULT_READER_THEME, false)).not.toBe(
      getRendererPreferencesKey(DEFAULT_READER_THEME, true),
    );
    syncRendererPreferences(view, DEFAULT_READER_THEME, true, cache);
    expect(setAttribute).toHaveBeenCalledWith("flow", "scrolled");
    expect(setAttribute).toHaveBeenCalledWith("gap", "0%");
    expect(setAttribute).toHaveBeenCalledWith("max-inline-size", "720px");
    expect(removeAttribute).toHaveBeenCalledWith("animated");
  });

  it("injects and removes dark inline override style tag", () => {
    const doc = document.implementation.createHTMLDocument();
    applyDarkInlineOverrides(doc, "dark");
    const injected = doc.getElementById("z-reader-dark-overrides");
    expect(injected).not.toBeNull();
    expect(injected?.textContent).toContain("!important");

    applyDarkInlineOverrides(doc, "light");
    expect(doc.getElementById("z-reader-dark-overrides")).toBeNull();
  });
});

describe("foliate bookLoader helpers", () => {
  it("formats download progress messages for initial, resumed, known, and unknown totals", () => {
    expect(
      formatBookDownloadMessage({
        downloadedBytes: 512 * 1024,
        totalBytes: 1024 * 1024,
        percentage: 50.9,
        bytesPerSecond: 256 * 1024,
        resumed: false,
      }),
    ).toContain("下载书籍 50%");

    const resumed = formatBookDownloadMessage({
      downloadedBytes: 1024 * 1024,
      totalBytes: null,
      percentage: null,
      bytesPerSecond: 512,
      resumed: true,
    });
    expect(resumed).toMatch(/^继续下载 · /);
    expect(resumed).not.toContain("/s");
  });

  it("maps permission errors to user-friendly guidance", () => {
    expect(formatOpenBookError(new Error("permission denied")).message).toContain(
      "请允许访问文件",
    );
    expect(formatOpenBookError(new Error("corrupt zip")).message).toBe(
      "打开书籍失败：corrupt zip",
    );
    expect(formatOpenBookError("boom").message).toBe("打开书籍失败：未知错误");
  });

  it("prunes only disconnected chapter cleanups", () => {
    const connectedFrame = document.createElement("iframe");
    const disconnectedFrame = document.createElement("iframe");
    document.body.append(connectedFrame, disconnectedFrame);
    try {
      const connectedDoc = connectedFrame.contentDocument!;
      const disconnectedDoc = disconnectedFrame.contentDocument!;
      disconnectedFrame.remove();

      const connectedCleanup = vi.fn();
      const disconnectedCleanup = vi.fn();
      const map = new Map<Document, () => void>([
        [connectedDoc, connectedCleanup],
        [disconnectedDoc, disconnectedCleanup],
      ]);

      pruneDisconnectedChapterCleanups(map);
      expect(disconnectedCleanup).toHaveBeenCalledTimes(1);
      expect(connectedCleanup).not.toHaveBeenCalled();
      expect(map.has(connectedDoc)).toBe(true);
      expect(map.has(disconnectedDoc)).toBe(false);
    } finally {
      connectedFrame.remove();
      disconnectedFrame.remove();
    }
  });
});
