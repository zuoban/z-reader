"use client";

import { useCallback } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { DeferredTTSControls } from "@/components/DeferredTTSControls";
import type {
  ReaderTTSSlot,
  SharedTTSControlsProps,
} from "@/hooks/useReaderTTSBridge";

interface ReaderTTSControlTriggerProps {
  slot: ReaderTTSSlot;
  sharedProps: SharedTTSControlsProps;
}

export function ReaderTTSControlTrigger({
  slot,
  sharedProps,
}: ReaderTTSControlTriggerProps) {
  const { activeSlot, onRequestSlot, onSlotExpandedChange, ...ttsProps } =
    sharedProps;

  const handleRequest = useCallback(() => {
    onRequestSlot(slot);
  }, [onRequestSlot, slot]);

  const handleExpandedChange = useCallback(
    (expanded: boolean) => {
      onSlotExpandedChange(slot, expanded);
    },
    [onSlotExpandedChange, slot],
  );

  const slotProps = {
    ...ttsProps,
    expanded: activeSlot === slot,
    onRequest: handleRequest,
    onExpandedChange: handleExpandedChange,
  };

  if (slot === "desktop-toolbar") {
    return (
      <DeferredTTSControls
        {...slotProps}
        variant="toolbar"
        triggerClassName="reader-chrome-btn"
        triggerStyle={{}}
        loadingContent={
          <>
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <span className="sr-only">正在加载朗读控制</span>
          </>
        }
        triggerContent={
          <>
            <Volume2 className="size-4" strokeWidth={1.6} aria-hidden="true" />
            <span className="sr-only">朗读</span>
          </>
        }
      />
    );
  }

  if (slot === "mobile-menu") {
    return (
      <DeferredTTSControls
        {...slotProps}
        variant="toolbar"
        triggerClassName="reader-mobile-menu-item h-auto justify-start gap-3 border-0 px-3 py-2.5 text-sm font-medium"
        triggerStyle={{}}
        triggerContent={
          <>
            <Volume2 className="size-4 opacity-80" aria-hidden="true" />
            <span>朗读</span>
          </>
        }
      />
    );
  }

  return (
    <DeferredTTSControls
      {...slotProps}
      variant="toolbar"
      triggerClassName="reader-status-action [&_svg]:size-3.5"
      triggerStyle={
        slotProps.state !== "stopped"
          ? { color: slotProps.uiScheme.link }
          : {}
      }
    />
  );
}
