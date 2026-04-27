"use client";

import React from "react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";
import { withOpacity } from "@/lib/reader-ui";
import { cn } from "@/lib/utils";

interface ReaderTOCNodeProps {
  item: TOCItem;
  onGoTo: (href: string) => void;
  depth?: number;
  currentChapter: string;
  uiScheme: ThemeColors;
}

function ReaderTOCNode({
  item,
  onGoTo,
  depth = 0,
  currentChapter,
  uiScheme,
}: ReaderTOCNodeProps) {
  const isCurrentChapter = currentChapter === item.label;

  return (
    <div className="relative">
      {depth > 0 && (
        <div
          className="absolute bottom-0 top-0 w-px bg-primary/5"
          style={{ left: `${(depth - 1) * 14 + 20}px` }}
        />
      )}

      <button
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        onClick={() => onGoTo(item.href)}
        className={cn(
          "group relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all active:scale-[0.98] sm:py-2.5",
          isCurrentChapter ? "shadow-sm shadow-primary/5" : "hover:bg-primary/5",
        )}
        style={{
          marginLeft: depth > 0 ? `${depth * 14}px` : "0px",
          background: isCurrentChapter
            ? withOpacity(uiScheme.buttonBg, 0.8)
            : "transparent",
          border: `1px solid ${
            isCurrentChapter ? withOpacity(uiScheme.cardBorder, 0.4) : "transparent"
          }`,
        }}
      >
        {isCurrentChapter && (
          <div className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
        )}

        <span
          className={cn(
            "truncate text-[12px] leading-5 transition-colors sm:text-[13px]",
            isCurrentChapter
              ? "font-bold"
              : "font-medium opacity-70 group-hover:opacity-100",
          )}
          style={{ color: isCurrentChapter ? uiScheme.fg : uiScheme.buttonText }}
        >
          {item.label}
        </span>
      </button>

      {item.subitems && item.subitems.length > 0 && (
        <div className="space-y-0">
          {item.subitems.map((sub, idx) => (
            <MemoizedReaderTOCNode
              key={idx}
              item={sub}
              onGoTo={onGoTo}
              depth={depth + 1}
              currentChapter={currentChapter}
              uiScheme={uiScheme}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const MemoizedReaderTOCNode = React.memo(
  ReaderTOCNode,
  (prevProps, nextProps) => {
    return (
      prevProps.item.href === nextProps.item.href &&
      prevProps.item.label === nextProps.item.label &&
      prevProps.item.subitems?.length === nextProps.item.subitems?.length &&
      prevProps.depth === nextProps.depth &&
      prevProps.currentChapter === nextProps.currentChapter &&
      prevProps.uiScheme.fg === nextProps.uiScheme.fg
    );
  },
);
