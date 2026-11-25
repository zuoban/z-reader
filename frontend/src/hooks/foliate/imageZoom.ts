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

    return {
      src: new URL(src, doc.baseURI).toString(),
      alt,
    };
  };

  const openImage = (event: Event) => {
    const image = getZoomImage(event.target);
    if (!image) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    getOnImageOpen()?.(image);
  };

  let pointerStart: { x: number; y: number } | null = null;

  const handlePointerDown = (event: PointerEvent) => {
    if (!getZoomImage(event.target)) return;
    pointerStart = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!pointerStart) return;
    const moved =
      Math.abs(event.clientX - pointerStart.x) > 8 ||
      Math.abs(event.clientY - pointerStart.y) > 8;
    pointerStart = null;
    if (!moved) {
      openImage(event);
    }
  };

  const handleClick = (event: MouseEvent) => {
    openImage(event);
  };

  const handleTouchStart = (event: TouchEvent) => {
    const target = event.target;
    if (!getZoomImage(target)) return;
    event.stopPropagation();
  };

  doc.addEventListener("pointerdown", handlePointerDown, true);
  doc.addEventListener("pointerup", handlePointerUp, true);
  doc.addEventListener("click", handleClick, true);
  doc.addEventListener("touchstart", handleTouchStart, true);

  return () => {
    doc.removeEventListener("pointerdown", handlePointerDown, true);
    doc.removeEventListener("pointerup", handlePointerUp, true);
    doc.removeEventListener("click", handleClick, true);
    doc.removeEventListener("touchstart", handleTouchStart, true);
  };
}
