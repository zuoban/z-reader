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
          "touch-control group relative flex min-h-11 w-full items-center overflow-hidden rounded-xl px-3.5 py-2.5 text-left transition-[background-color,box-shadow,transform,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 active:scale-[0.985]",
          isCurrentChapter ? "z-10" : "hover:bg-black/[0.035] dark:hover:bg-white/[0.04]",
        )}
        style={{
          marginLeft: indent,
          width: depth > 0 ? `calc(100% - ${indent})` : "100%",
          background: isCurrentChapter
            ? withOpacity(uiScheme.buttonBg, 0.72)
            : "transparent",
          color: isCurrentChapter ? uiScheme.fg : uiScheme.buttonText,
          boxShadow: isCurrentChapter
            ? `inset 0 0 0 1px ${withOpacity(uiScheme.cardBorder, 0.12)}, inset 0 1px 0 ${withOpacity("#ffffff", 0.08)}`
            : "none",
        }}
      >
        {isCurrentChapter && (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-[3px] rounded-full"
            style={{ background: withOpacity(uiScheme.link, 0.88) }}
          />
        )}
        <span
          className={cn(
            "mr-2.5 h-1.5 w-1.5 shrink-0 rounded-full transition-opacity duration-200",
            isCurrentChapter
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-40 group-focus-visible:opacity-70",
          )}
          style={{
            background: isCurrentChapter
              ? withOpacity(uiScheme.link, 0.9)
              : withOpacity(uiScheme.mutedText, 0.7),
          }}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] leading-6 transition-opacity duration-200 sm:text-[13.5px]",
            isCurrentChapter
              ? "font-semibold tracking-[-0.01em]"
              : "font-medium opacity-80 group-hover:opacity-100",
          )}
          style={{
            color: isCurrentChapter
              ? uiScheme.fg
              : withOpacity(uiScheme.buttonText, 0.88),
          }}
        >
          {item.label}
        </span>
        {isCurrentChapter && (
          <span
            className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{
              background: withOpacity(uiScheme.link, 0.12),
              color: withOpacity(uiScheme.link, 0.95),
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
