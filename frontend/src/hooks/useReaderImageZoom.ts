'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  getZoomedState,
  type ReaderImageZoomState,
} from '@/lib/reader-page';

export function useReaderImageZoom(pageRef: RefObject<HTMLDivElement | null>) {
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [imageZoom, setImageZoom] = useState<ReaderImageZoomState>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const [imageInteracting, setImageInteracting] = useState(false);

  const imageZoomSurfaceRef = useRef<HTMLDivElement>(null);
  const imagePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const imageDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const imageGestureRef = useRef<{
    distance: number;
    scale: number;
    centerX: number;
    centerY: number;
    x: number;
    y: number;
  } | null>(null);
  const imageLastTapRef = useRef<{
    time: number;
    x: number;
    y: number;
  } | null>(null);

  const handleImageOpen = useCallback((image: { src: string; alt: string }) => {
    setImageZoom({ scale: 1, x: 0, y: 0 });
    setImageInteracting(false);
    setZoomedImage(image);
  }, []);

  const handleImageClose = useCallback(() => {
    setZoomedImage(null);
    setImageZoom({ scale: 1, x: 0, y: 0 });
    setImageInteracting(false);
    imagePointersRef.current.clear();
    imageDragRef.current = null;
    imageGestureRef.current = null;
    imageLastTapRef.current = null;
  }, []);

  const toggleImageZoom = useCallback((clientX: number, clientY: number) => {
    setImageZoom((state) => {
      if (state.scale > 1.05) {
        return { scale: 1, x: 0, y: 0 };
      }
      return getZoomedState(state, 2.5, clientX, clientY);
    });
  }, []);

  const handleImageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      toggleImageZoom(event.clientX, event.clientY);
    },
    [toggleImageZoom]
  );

  const handleImagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setImageInteracting(true);
      imagePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const pointers = Array.from(imagePointersRef.current.values());
      if (pointers.length === 2) {
        const [first, second] = pointers;
        imageGestureRef.current = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          scale: imageZoom.scale,
          centerX: (first.x + second.x) / 2,
          centerY: (first.y + second.y) / 2,
          x: imageZoom.x,
          y: imageZoom.y,
        };
        imageDragRef.current = null;
        return;
      }

      if (imageZoom.scale > 1) {
        imageDragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: imageZoom.x,
          originY: imageZoom.y,
        };
      }
    },
    [imageZoom]
  );

  const handleImagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!imagePointersRef.current.has(event.pointerId)) return;

      event.preventDefault();
      event.stopPropagation();
      imagePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const pointers = Array.from(imagePointersRef.current.values());
      const gesture = imageGestureRef.current;
      if (pointers.length >= 2 && gesture) {
        const [first, second] = pointers;
        const centerX = (first.x + second.x) / 2;
        const centerY = (first.y + second.y) / 2;
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const baseState = {
          scale: gesture.scale,
          x: gesture.x,
          y: gesture.y,
        };
        const nextState = getZoomedState(
          baseState,
          gesture.scale * (distance / Math.max(gesture.distance, 1)),
          gesture.centerX,
          gesture.centerY
        );

        setImageZoom({
          ...nextState,
          x: nextState.x + centerX - gesture.centerX,
          y: nextState.y + centerY - gesture.centerY,
        });
        return;
      }

      const drag = imageDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      setImageZoom((state) => ({
        ...state,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }));
    },
    []
  );

  const handleImagePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const drag = imageDragRef.current;
      const moved = drag
        ? Math.abs(event.clientX - drag.startX) > 8 ||
          Math.abs(event.clientY - drag.startY) > 8
        : false;
      const wasGesture = Boolean(imageGestureRef.current);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      imagePointersRef.current.delete(event.pointerId);
      setImageInteracting(imagePointersRef.current.size > 0);
      imageGestureRef.current = null;
      imageDragRef.current = null;

      const remaining = Array.from(imagePointersRef.current.entries());
      if (remaining.length === 1 && imageZoom.scale > 1) {
        const [pointerId, pointer] = remaining[0];
        imageDragRef.current = {
          pointerId,
          startX: pointer.x,
          startY: pointer.y,
          originX: imageZoom.x,
          originY: imageZoom.y,
        };
      }

      if (moved || wasGesture || imagePointersRef.current.size > 0) return;

      const now = window.performance.now();
      const lastTap = imageLastTapRef.current;
      const isDoubleTap =
        lastTap &&
        now - lastTap.time < 320 &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32;

      if (isDoubleTap) {
        imageLastTapRef.current = null;
        toggleImageZoom(event.clientX, event.clientY);
        return;
      }

      imageLastTapRef.current = {
        time: now,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [imageZoom, toggleImageZoom]
  );

  useEffect(() => {
    if (!pageRef.current) return;
    if (zoomedImage) {
      pageRef.current.dataset.readerImageZoomOpen = 'true';
    } else {
      delete pageRef.current.dataset.readerImageZoomOpen;
    }
  }, [pageRef, zoomedImage]);

  useEffect(() => {
    if (!zoomedImage) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      handleImageClose();
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handleImageClose, zoomedImage]);

  useEffect(() => {
    const surface = imageZoomSurfaceRef.current;
    if (!zoomedImage || !surface) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      setImageZoom((state) => {
        const nextScale = state.scale * Math.exp(-event.deltaY * 0.0015);
        return getZoomedState(state, nextScale, event.clientX, event.clientY);
      });
    }

    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      surface.removeEventListener('wheel', handleWheel);
    };
  }, [zoomedImage]);

  return {
    zoomedImage,
    imageZoom,
    imageInteracting,
    imageZoomSurfaceRef,
    handleImageOpen,
    handleImageClose,
    toggleImageZoom,
    handleImageDoubleClick,
    handleImagePointerDown,
    handleImagePointerMove,
    handleImagePointerEnd,
  };
}
