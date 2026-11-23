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
  currentChapterHref: string;
  uiScheme: ThemeColors;
}

function ReaderTOCNode({
  item,
  onGoTo,
  depth = 0,
  currentChapter,
  currentChapterHref,
  uiScheme,
}: ReaderTOCNodeProps) {
  const isCurrentChapter = currentChapterHref
    ? currentChapterHref === item.href
    : currentChapter === item.label;
  const indent = Math.min(depth, 4) * 12;

  return (
    <div className="relative">
      <button
        type="button"
        aria-current={isCurrentChapter ? "page" : undefined}
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        onClick={() => onGoTo(item.href)}
        className={cn(
          "touch-control relative flex min-h-11 w-full items-center overflow-hidden rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 active:scale-[0.99]",
          isCurrentChapter ? "z-10" : "hover:bg-black/[0.035] dark:hover:bg-white/[0.04]",
        )}
        style={{
          paddingInlineStart: `${12 + indent}px`,
          background: isCurrentChapter
            ? withOpacity(uiScheme.link, 0.09)
            : undefined,
          color: isCurrentChapter ? uiScheme.fg : uiScheme.buttonText,
        }}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm leading-6",
            isCurrentChapter && "font-semibold",
          )}
        >
          {item.label}
        </span>
        {isCurrentChapter && (
          <span
            className="ml-2 shrink-0 text-xs font-medium"
            style={{
              color: uiScheme.link,
            }}
          >
            当前
          </span>
        )}
      </button>

      {item.subitems && item.subitems.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {item.subitems.map((sub, idx) => (
            <MemoizedReaderTOCNode
              key={idx}
              item={sub}
              onGoTo={onGoTo}
              depth={depth + 1}
              currentChapter={currentChapter}
              currentChapterHref={currentChapterHref}
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
      prevProps.currentChapterHref === nextProps.currentChapterHref &&
      prevProps.uiScheme.fg === nextProps.uiScheme.fg
    );
  },
);
