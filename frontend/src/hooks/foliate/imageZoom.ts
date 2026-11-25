import type { FoliateZoomImage } from "./types";

export function bindImageZoomDocument(
  doc: Document,
  getOnImageOpen: () => ((image: FoliateZoomImage) => void) | undefined,
): (() => void) | undefined {
  const docWindow = doc.defaultView;
  if (!docWindow) return;

  const images = Array.from(doc.querySelectorAll<Element>("img, image"));

  images.forEach((image) => {
    image.setAttribute("data-reader-interactive", "true");
    const style = image.getAttribute("style") ?? "";
    image.setAttribute("style", `${style}; cursor: zoom-in;`);
  });

  const getZoomImage = (target: EventTarget | null): FoliateZoomImage | null => {
    if (!(target instanceof docWindow.Element)) return null;
    const image = target.closest("img, image");
    if (!image) return null;

    const src =
      image instanceof docWindow.HTMLImageElement
        ? image.currentSrc || image.src
        : image.getAttribute("href") || image.getAttribute("xlink:href") || "";

    if (!src) return null;

    const alt =
      image instanceof docWindow.HTMLImageElement
        ? image.alt
        : image.getAttribute("aria-label") || image.getAttribute("title") || "";

    let resolvedSrc: string;
    try {
      resolvedSrc = new URL(src, doc.baseURI).toString();
    } catch {
      return null;
    }

    return {
      src: resolvedSrc,
      alt,
    };
  };

  const openImage = (event: Event): boolean => {
    const image = getZoomImage(event.target);
    if (!image) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    getOnImageOpen()?.(image);
    return true;
  };

  let pointerStart: { x: number; y: number } | null = null;
  let suppressClickMode: "none" | "handled" | "dragged" = "none";
  let suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSuppressedClick = () => {
    suppressClickMode = "none";
    if (suppressClickTimer !== null) {
      clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
    }
  };

  const suppressNextClick = (mode: "handled" | "dragged") => {
    clearSuppressedClick();
    suppressClickMode = mode;
    suppressClickTimer = setTimeout(() => {
      suppressClickMode = "none";
      suppressClickTimer = null;
    }, 400);
  };

  const handlePointerDown = (event: PointerEvent) => {
    clearSuppressedClick();
    if (!getZoomImage(event.target)) return;
    pointerStart = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!pointerStart) return;
    const moved =
      Math.abs(event.clientX - pointerStart.x) > 8 ||
      Math.abs(event.clientY - pointerStart.y) > 8;
    pointerStart = null;
    if (moved) {
      suppressNextClick("dragged");
      return;
    }
    if (openImage(event)) {
      suppressNextClick("handled");
    }
  };

  const handlePointerCancel = () => {
    pointerStart = null;
  };

  const handleClick = (event: MouseEvent) => {
    // Preserve keyboard-triggered activation (Enter / Space -> detail === 0).
    if (event.detail !== 0 && suppressClickMode !== "none") {
      const mode = suppressClickMode;
      clearSuppressedClick();
      if (mode === "handled") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
      return;
    }
    openImage(event);
  };

  const handleTouchStart = (event: TouchEvent) => {
    const target = event.target;
    if (!getZoomImage(target)) return;
    event.stopPropagation();
  };

  doc.addEventListener("pointerdown", handlePointerDown, true);
  doc.addEventListener("pointerup", handlePointerUp, true);
  doc.addEventListener("pointercancel", handlePointerCancel, true);
  doc.addEventListener("click", handleClick, true);
  doc.addEventListener("touchstart", handleTouchStart, true);

  return () => {
    clearSuppressedClick();
    doc.removeEventListener("pointerdown", handlePointerDown, true);
    doc.removeEventListener("pointerup", handlePointerUp, true);
    doc.removeEventListener("pointercancel", handlePointerCancel, true);
    doc.removeEventListener("click", handleClick, true);
    doc.removeEventListener("touchstart", handleTouchStart, true);
  };
}
