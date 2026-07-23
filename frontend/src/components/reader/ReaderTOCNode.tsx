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
          "touch-control group relative flex min-h-11 w-full items-center overflow-hidden rounded-[0.95rem] px-3.5 py-2 text-left transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 active:scale-[0.985]",
          isCurrentChapter
            ? "z-10"
            : "hover:bg-muted/30",
        )}
        style={{
          marginLeft: indent,
          width: depth > 0 ? `calc(100% - ${indent})` : "100%",
          background: isCurrentChapter
            ? withOpacity(uiScheme.buttonBg, 0.68)
            : "transparent",
          color: isCurrentChapter ? uiScheme.fg : uiScheme.buttonText,
          boxShadow: isCurrentChapter
            ? `inset 0 0 0 1px ${withOpacity(uiScheme.cardBorder, 0.08)}`
            : "none",
        }}
      >
        <span
          className={cn(
            "mr-2 h-1.5 w-1.5 shrink-0 rounded-full transition-opacity duration-200",
            isCurrentChapter ? "opacity-100" : "opacity-0 group-hover:opacity-35 group-focus-visible:opacity-75",
          )}
          style={{
            background: isCurrentChapter
              ? withOpacity(uiScheme.link, 0.88)
              : withOpacity(uiScheme.mutedText, 0.72),
          }}
        />
        <span
          className={cn(
            "truncate text-[13px] leading-6 transition-opacity duration-200 sm:text-[13.5px]",
            isCurrentChapter
              ? "font-semibold tracking-tight"
              : "font-medium opacity-80 group-hover:opacity-100",
          )}
          style={{
            color: isCurrentChapter ? uiScheme.fg : uiScheme.buttonText,
            textShadow: isCurrentChapter 
              ? `0 0 1px ${withOpacity(uiScheme.fg, 0.1)}`
              : "none"
          }}
        >
          {item.label}
        </span>
      </button>

      {item.subitems && item.subitems.length > 0 && (
        <div className="mt-1 space-y-1">
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
