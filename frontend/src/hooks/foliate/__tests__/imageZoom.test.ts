import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindImageZoomDocument } from "../imageZoom";

type FrameWindow = Window & typeof globalThis;

function createIframeDocument(html: string, baseHref = "https://reader.local/chapters/ch1.xhtml") {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><base href="${baseHref}"></head><body>${html}</body></html>`);
  doc.close();
  return { iframe, doc, win: doc.defaultView! as FrameWindow };
}

function createPointerEvent(
  win: FrameWindow,
  type: "pointerdown" | "pointerup" | "pointercancel",
  coords: { clientX: number; clientY: number },
) {
  const EventCtor = win.PointerEvent ?? win.MouseEvent;
  return new EventCtor(type, {
    bubbles: true,
    cancelable: true,
    clientX: coords.clientX,
    clientY: coords.clientY,
  });
}

describe("bindImageZoomDocument", () => {
  const iframes: HTMLIFrameElement[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    iframes.splice(0).forEach((frame) => frame.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deduplicates pointerup and follow-up click on an image tap", () => {
    const { iframe, doc, win } = createIframeDocument(
      '<img src="../images/cover.png" alt="Cover" />',
    );
    iframes.push(iframe);

    const onImageOpen = vi.fn();
    const cleanup = bindImageZoomDocument(doc, () => onImageOpen);
    const img = doc.querySelector("img")!;

    img.dispatchEvent(createPointerEvent(win, "pointerdown", { clientX: 100, clientY: 120 }));
    img.dispatchEvent(createPointerEvent(win, "pointerup", { clientX: 102, clientY: 121 }));

    const followUpClick = new win.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    const bubbleClickSpy = vi.fn();
    doc.body.addEventListener("click", bubbleClickSpy);
    img.dispatchEvent(followUpClick);

    expect(onImageOpen).toHaveBeenCalledTimes(1);
    expect(onImageOpen).toHaveBeenCalledWith({
      src: "https://reader.local/images/cover.png",
      alt: "Cover",
    });
    expect(followUpClick.defaultPrevented).toBe(true);
    expect(bubbleClickSpy).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("suppresses follow-up click after a dragged pointer sequence (>8px)", () => {
    const { iframe, doc, win } = createIframeDocument(
      '<img src="../images/diagram.png" alt="Diagram" />',
    );
    iframes.push(iframe);

    const onImageOpen = vi.fn();
    const cleanup = bindImageZoomDocument(doc, () => onImageOpen);
    const img = doc.querySelector("img")!;

    img.dispatchEvent(createPointerEvent(win, "pointerdown", { clientX: 100, clientY: 100 }));
    img.dispatchEvent(createPointerEvent(win, "pointerup", { clientX: 130, clientY: 100 }));
    img.dispatchEvent(
      new win.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
      }),
    );

    expect(onImageOpen).not.toHaveBeenCalled();
    cleanup?.();
  });

  it("preserves keyboard-triggered click (detail === 0) even after a pointer sequence", () => {
    const { iframe, doc, win } = createIframeDocument(
      '<img src="../images/chart.png" alt="Chart" />',
    );
    iframes.push(iframe);

    const onImageOpen = vi.fn();
    const cleanup = bindImageZoomDocument(doc, () => onImageOpen);
    const img = doc.querySelector("img")!;

    // Drag sequence arms click suppression for pointer-generated clicks.
    img.dispatchEvent(createPointerEvent(win, "pointerdown", { clientX: 10, clientY: 10 }));
    img.dispatchEvent(createPointerEvent(win, "pointerup", { clientX: 50, clientY: 10 }));

    // Keyboard activation emits click with detail === 0 and must still open zoom.
    img.dispatchEvent(
      new win.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 0,
      }),
    );

    expect(onImageOpen).toHaveBeenCalledTimes(1);
    expect(onImageOpen).toHaveBeenCalledWith({
      src: "https://reader.local/images/chart.png",
      alt: "Chart",
    });

    cleanup?.();
  });

  it("handles valid SVG <image> href/xlink:href and safely ignores malformed URLs", () => {
    const { iframe, doc, win } = createIframeDocument(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <image id="good-href" href="../images/svg-a.png" aria-label="SVG A" />
        <image id="good-xlink" xlink:href="../images/svg-b.png" title="SVG B" />
        <image id="bad-href" href="http://[invalid" />
        <image id="bad-xlink" xlink:href="http://[invalid-xlink" />
      </svg>
    `);
    iframes.push(iframe);

    const onImageOpen = vi.fn();
    const cleanup = bindImageZoomDocument(doc, () => onImageOpen);

    const badHref = doc.getElementById("bad-href")!;
    const badXlink = doc.getElementById("bad-xlink")!;
    const goodHref = doc.getElementById("good-href")!;
    const goodXlink = doc.getElementById("good-xlink")!;

    expect(() => {
      badHref.dispatchEvent(createPointerEvent(win, "pointerdown", { clientX: 5, clientY: 5 }));
      badHref.dispatchEvent(createPointerEvent(win, "pointerup", { clientX: 5, clientY: 5 }));
      badHref.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
      badXlink.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    }).not.toThrow();
    expect(onImageOpen).not.toHaveBeenCalled();

    goodHref.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    goodXlink.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));

    expect(onImageOpen).toHaveBeenNthCalledWith(1, {
      src: "https://reader.local/images/svg-a.png",
      alt: "SVG A",
    });
    expect(onImageOpen).toHaveBeenNthCalledWith(2, {
      src: "https://reader.local/images/svg-b.png",
      alt: "SVG B",
    });

    cleanup?.();
  });
});
