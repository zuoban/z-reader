"use client";

import type { CSSProperties, RefObject } from "react";
import { Expand, Library, Shrink } from "lucide-react";

import { ThemeSettings } from "@/components/ThemeSettings";
import { Button } from "@/components/ui/button";
import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import type { ReaderTheme, ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";

interface ReaderToolbarProps {
  visible: boolean;
  bookTitle: string;
  bookAuthor: string;
  toc: TOCItem[];
  tocOpen: boolean;
  onTocOpenChange: (open: boolean) => void;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  onLocateCurrentChapter: () => void;
  onGoTo: (href: string) => void;
  onBack: () => void;
  uiScheme: ThemeColors;
  toolbarButtonClass: string;
  getToolbarButtonStyle: (active?: boolean) => CSSProperties;
  headerSafeAreaPaddingTop: string;
  overlayContainer?: HTMLElement | null;
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  themeSettingsOpen: boolean;
  onThemeSettingsOpenChange: (open: boolean) => void;
  isFullscreenSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void | Promise<void>;
}

export function ReaderToolbar({
  visible,
  bookTitle,
  bookAuthor,
  toc,
  tocOpen,
  onTocOpenChange,
  tocListRef,
  currentChapter,
  onLocateCurrentChapter,
  onGoTo,
  onBack,
  uiScheme,
  toolbarButtonClass,
  getToolbarButtonStyle,
  headerSafeAreaPaddingTop,
  overlayContainer,
  theme,
  setTheme,
  themeSettingsOpen,
  onThemeSettingsOpenChange,
  isFullscreenSupported,
  isFullscreen,
  onToggleFullscreen,
}: ReaderToolbarProps) {
  return (
    <>
      <header
        data-reader-interactive="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-50 sm:px-4 ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-[calc(100%+env(safe-area-inset-top,0px))] opacity-0"
        }`}
        style={{
          background: uiScheme.bg,
          paddingTop: headerSafeAreaPaddingTop,
          transition:
            "transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="flex h-9 items-center justify-between px-3 pointer-events-auto sm:h-9 sm:px-4">
          <div className="flex items-center gap-1 sm:gap-2">
            {isFullscreenSupported ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onToggleFullscreen()}
                title={isFullscreen ? "退出全屏" : "进入全屏"}
                aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${toolbarButtonClass}`}
                style={{
                  color: isFullscreen ? uiScheme.link : uiScheme.buttonText,
                  ...getToolbarButtonStyle(isFullscreen),
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                {isFullscreen ? (
                  <Shrink className="h-4 w-4" />
                ) : (
                  <Expand className="h-4 w-4" />
                )}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="返回书库"
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${toolbarButtonClass}`}
              style={{
                color: uiScheme.buttonText,
                ...getToolbarButtonStyle(false),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            >
              <Library className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <ReaderTOCSheet
              open={tocOpen}
              onOpenChange={onTocOpenChange}
              toc={toc}
              bookTitle={bookTitle}
              bookAuthor={bookAuthor}
              tocListRef={tocListRef}
              currentChapter={currentChapter}
              uiScheme={uiScheme}
              overlayContainer={overlayContainer}
              triggerClassName={toolbarButtonClass}
              triggerStyle={{
                ...getToolbarButtonStyle(tocOpen),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
              onLocateCurrent={onLocateCurrentChapter}
              onGoTo={onGoTo}
            />
            <ThemeSettings
              theme={theme}
              setTheme={setTheme}
              uiScheme={uiScheme}
              open={themeSettingsOpen}
              onOpenChange={onThemeSettingsOpenChange}
              overlayContainer={overlayContainer}
              triggerClassName={toolbarButtonClass}
              triggerStyle={{
                ...getToolbarButtonStyle(themeSettingsOpen),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            />
          </div>
        </div>
      </header>
    </>
  );
}
