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
      {depth > 0 && (
        <div
          className="absolute bottom-1 top-1 w-[1.2px] opacity-30"
          style={{
            left: `${(depth - 1) * 16 + 21}px`,
            background: `linear-gradient(180deg, transparent 0%, ${uiScheme.cardBorder} 10%, ${uiScheme.cardBorder} 90%, transparent 100%)`,
          }}
        />
      )}

      <button
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        onClick={() => onGoTo(item.href)}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-4 py-2 text-left transition-all duration-200 active:scale-[0.98]",
          isCurrentChapter
            ? "z-10 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.12)]"
            : "hover:bg-opacity-100",
        )}
        style={{
          marginLeft: depth > 0 ? `${depth * 16}px` : "0px",
          marginTop: "1px",
          marginBottom: "1px",
          background: isCurrentChapter
            ? `linear-gradient(135deg, ${withOpacity(uiScheme.accentText, 0.08)} 0%, ${withOpacity(uiScheme.accentText, 0.02)} 100%), ${withOpacity(uiScheme.buttonBg, 0.85)}`
            : "transparent",
          border: `1px solid ${
            isCurrentChapter
              ? withOpacity(uiScheme.accentText, 0.25)
              : "transparent"
          }`,
        }}
      >
        {isCurrentChapter && (
          <div
            className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full"
            style={{
              background: uiScheme.accentText,
              boxShadow: `2px 0 8px ${withOpacity(uiScheme.accentText, 0.4)}`,
            }}
          />
        )}

        <span
          className={cn(
            "truncate text-[13px] leading-6 transition-all duration-200 sm:text-[14px]",
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
        
        {!isCurrentChapter && (
           <div 
             className="ml-auto h-1.5 w-1.5 rounded-full opacity-0 transition-opacity group-hover:opacity-20"
             style={{ background: uiScheme.fg }}
           />
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
