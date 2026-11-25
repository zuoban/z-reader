'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FAB_SIZE,
  FLOATING_DOCK_RIGHT,
  FLOATING_IDLE_DOCK_DELAY_MS,
  FLOATING_PANEL_FOOTER_PADDING,
  FLOATING_VIEWPORT_MARGIN,
  type TTSPosition,
} from './types';

interface UseFloatingPositionOptions {
  expanded: boolean;
  isToolbar: boolean;
}

export function useFloatingPosition({ expanded, isToolbar }: UseFloatingPositionOptions) {
  const [position, setPosition] = useState<TTSPosition>({ x: 22, y: 12 });
  const [isDragging, setIsDragging] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });
  const positionRef = useRef(position);
  const isDraggingRef = useRef(false);
  const draggingPointerIdRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const autoDockTimerRef = useRef<number | null>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  const commitPosition = useCallback((nextPosition: TTSPosition) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  const clearAutoDockTimer = useCallback(() => {
    if (autoDockTimerRef.current) {
      window.clearTimeout(autoDockTimerRef.current);
      autoDockTimerRef.current = null;
    }
  }, []);

  const dockFloatingButton = useCallback(() => {
    const nextPosition = {
      x: FLOATING_DOCK_RIGHT,
      y: Math.min(
        Math.max(positionRef.current.y, 0),
        Math.max(window.innerHeight - FAB_SIZE, 0)
      ),
    };
    commitPosition(nextPosition);
  }, [commitPosition]);

  const getDragSurfaceSize = useCallback(() => {
    if (!expanded) {
      return { width: FAB_SIZE, height: FAB_SIZE };
    }

    return {
      width: Math.min(364, Math.max(window.innerWidth - 28, 280)),
      height: Math.min(window.innerHeight * 0.72, 720),
    };
  }, [expanded]);

  const scheduleAutoDock = useCallback(() => {
    clearAutoDockTimer();
    if (isToolbar || expanded || isDraggingRef.current) return;

    autoDockTimerRef.current = window.setTimeout(() => {
      if (expanded || isDraggingRef.current) return;
      dockFloatingButton();
    }, FLOATING_IDLE_DOCK_DELAY_MS);
  }, [clearAutoDockTimer, dockFloatingButton, expanded, isToolbar]);

  const clampPosition = useCallback(
    (clientX: number, clientY: number) => {
      const deltaX = clientX - dragRef.current.startX;
      const deltaY = clientY - dragRef.current.startY;
      const threshold = prefersReducedMotion.current ? 1 : 2;
      const dragSurfaceSize = getDragSurfaceSize();

      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        hasDraggedRef.current = true;
        suppressClickRef.current = true;
      }

      return {
        x: Math.max(
          0,
          Math.min(
            Math.max(window.innerWidth - dragSurfaceSize.width - FLOATING_VIEWPORT_MARGIN, 0),
            dragRef.current.startPosX - deltaX
          )
        ),
        y: Math.max(
          0,
          Math.min(
            Math.max(window.innerHeight - dragSurfaceSize.height - FLOATING_VIEWPORT_MARGIN, 0),
            dragRef.current.startPosY - deltaY
          )
        ),
      };
    },
    [getDragSurfaceSize]
  );

  const stopDragging = useCallback(() => {
    if (!isDraggingRef.current) return;
    draggingPointerIdRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
    scheduleAutoDock();
  }, [scheduleAutoDock]);

  const startDragging = useCallback(
    (clientX: number, clientY: number, pointerId?: number) => {
      clearAutoDockTimer();
      draggingPointerIdRef.current = pointerId ?? null;
      hasDraggedRef.current = false;
      suppressClickRef.current = false;
      isDraggingRef.current = true;
      setIsDragging(true);
      dragRef.current = {
        startX: clientX,
        startY: clientY,
        startPosX: positionRef.current.x,
        startPosY: positionRef.current.y,
      };
    },
    [clearAutoDockTimer]
  );

  const handleDragHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startDragging(e.clientX, e.clientY, e.pointerId);
    },
    [startDragging]
  );

  const handleDragHandlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      stopDragging();
    },
    [stopDragging]
  );

  const handleDragHandlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      stopDragging();
      hasDraggedRef.current = false;
      suppressClickRef.current = false;
    },
    [stopDragging]
  );

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    hasDraggedRef.current = false;
    scheduleAutoDock();
    return true;
  }, [scheduleAutoDock]);

  useEffect(() => {
    scheduleAutoDock();
    return clearAutoDockTimer;
  }, [clearAutoDockTimer, scheduleAutoDock]);

  useEffect(() => {
    if (!isDragging) return;

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (
        draggingPointerIdRef.current !== null &&
        event.pointerId !== draggingPointerIdRef.current
      ) {
        return;
      }

      event.preventDefault();
      commitPosition(clampPosition(event.clientX, event.clientY));
    };

    const handleWindowPointerEnd = (event: PointerEvent) => {
      if (
        draggingPointerIdRef.current !== null &&
        event.pointerId !== draggingPointerIdRef.current
      ) {
        return;
      }

      stopDragging();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [clampPosition, commitPosition, isDragging, stopDragging]);

  const floatingPopupWidth = Math.min(364, Math.max(viewport.width - 28, 280));
  const floatingPopupMaxHeight = Math.min(viewport.height * 0.72, 720);
  const maxPopupRight = Math.max(
    0,
    viewport.width - floatingPopupWidth - FLOATING_VIEWPORT_MARGIN
  );
  const maxPopupBottom = Math.max(
    0,
    viewport.height - floatingPopupMaxHeight - FLOATING_VIEWPORT_MARGIN
  );

  const floatingPopupStyle = {
    right: `calc(env(safe-area-inset-right, 0px) + ${Math.min(
      maxPopupRight,
      Math.max(position.x - FLOATING_PANEL_FOOTER_PADDING, 0)
    )}px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.min(
      maxPopupBottom,
      Math.max(position.y - FLOATING_PANEL_FOOTER_PADDING, 0)
    )}px)`,
    width: `${floatingPopupWidth}px`,
    maxHeight: `${floatingPopupMaxHeight}px`,
  } as const;

  const floatingPanelBodyMaxHeight = `${floatingPopupMaxHeight - 120}px`;

  return {
    position,
    isDragging,
    floatingPopupStyle,
    floatingPanelBodyMaxHeight,
    clearAutoDockTimer,
    scheduleAutoDock,
    consumeSuppressedClick,
    handleDragHandlePointerDown,
    handleDragHandlePointerUp,
    handleDragHandlePointerCancel,
  };
}
