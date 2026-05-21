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

  return (
    <div className="relative">
      <button
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        onClick={() => onGoTo(item.href)}
        className={cn(
          "group relative flex w-full items-center rounded-[1.1rem] px-4 py-2.5 text-left transition-[background-color,transform] duration-200 active:scale-[0.98]",
          isCurrentChapter
            ? "z-10"
            : "hover:bg-muted/30",
        )}
        style={{
          marginLeft: depth > 0 ? `${depth * 14}px` : "0px",
          marginTop: "1px",
          marginBottom: "1px",
          background: isCurrentChapter
            ? withOpacity(uiScheme.buttonBg, 0.72)
            : "transparent",
        }}
      >
        <span
          className={cn(
            "truncate text-[13px] leading-6 transition-opacity duration-200 sm:text-[14px]",
            isCurrentChapter
              ? "font-semibold tracking-tight"
              : "font-medium opacity-65 group-hover:opacity-100",
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
