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
  const indent = depth > 0 ? `${Math.min(depth, 4) * 16}px` : "0px";

  return (
    <div className="relative">
      <button
        type="button"
        aria-current={isCurrentChapter ? "page" : undefined}
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        onClick={() => onGoTo(item.href)}
        className={cn(
          "touch-control group relative flex min-h-10 w-full items-center overflow-hidden rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 active:scale-[0.99]",
          isCurrentChapter ? "z-10" : "hover:bg-black/[0.035] dark:hover:bg-white/[0.04]",
        )}
        style={{
          marginLeft: indent,
          width: depth > 0 ? `calc(100% - ${indent})` : "100%",
          background: isCurrentChapter
            ? withOpacity(uiScheme.buttonBg, 0.78)
            : "transparent",
          color: isCurrentChapter ? uiScheme.fg : uiScheme.buttonText,
        }}
      >
        {isCurrentChapter && (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-[3px] rounded-full"
            style={{ background: uiScheme.link }}
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px] leading-6 transition-opacity duration-150",
            isCurrentChapter
              ? "font-medium"
              : "opacity-80 group-hover:opacity-100",
          )}
          style={{
            color: isCurrentChapter
              ? uiScheme.fg
              : withOpacity(uiScheme.buttonText, 0.9),
          }}
        >
          {item.label}
        </span>
        {isCurrentChapter && (
          <span
            className="ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              background: withOpacity(uiScheme.link, 0.12),
              color: uiScheme.link,
            }}
          >
            当前
          </span>
        )}
      </button>

      {item.subitems && item.subitems.length > 0 && (
        <div className="mt-0.5 space-y-0.5 border-l border-transparent pl-0">
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
