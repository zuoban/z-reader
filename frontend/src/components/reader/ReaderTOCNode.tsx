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
          className="absolute bottom-1 top-1 w-px"
          style={{
            left: `${(depth - 1) * 14 + 19}px`,
            background: `linear-gradient(180deg, transparent 0%, ${withOpacity(uiScheme.cardBorder, 0.16)} 16%, ${withOpacity(uiScheme.cardBorder, 0.16)} 84%, transparent 100%)`,
          }}
        />
      )}

      <button
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        onClick={() => onGoTo(item.href)}
        className={cn(
          "group relative mb-0.5 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-all active:scale-[0.985]",
          isCurrentChapter ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]" : "hover:scale-[1.005]",
        )}
        style={{
          marginLeft: depth > 0 ? `${depth * 14}px` : "0px",
          background: isCurrentChapter
            ? `linear-gradient(135deg, ${withOpacity(uiScheme.accentText, 0.06)} 0%, transparent 60%), ${withOpacity(uiScheme.buttonBg, 0.54)}`
            : withOpacity(uiScheme.buttonBg, 0.06),
          border: `1px solid ${
            isCurrentChapter
              ? withOpacity(uiScheme.cardBorder, 0.3)
              : withOpacity(uiScheme.cardBorder, 0.06)
          }`,
          boxShadow: isCurrentChapter
            ? `0 12px 24px -22px ${withOpacity(uiScheme.fg, 0.28)}`
            : "none",
        }}
      >
        {isCurrentChapter && (
          <div
            className="absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
            style={{
              background: uiScheme.accentText,
              boxShadow: `0 0 12px ${withOpacity(uiScheme.accentText, 0.28)}`,
            }}
          />
        )}

        <span
          className={cn(
            "truncate pr-2 text-[12px] leading-5 transition-colors sm:text-[13px]",
            isCurrentChapter
              ? "font-bold"
              : "font-medium opacity-72 group-hover:opacity-100",
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
