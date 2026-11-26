'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { ActionIcon, Drawer } from '@mantine/core';
import '@/app/styles/mantine-drawer.css';
import { X } from 'lucide-react';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { useComposingEscapeGuard } from '@/hooks/useComposingEscapeGuard';
import { getModernReaderSurface, getReaderPanelThemeVars } from '@/lib/reader-ui';
import { cn } from '@/lib/utils';

export interface ReaderSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleAddon?: ReactNode;
  subtitle?: ReactNode;
  srDescription?: string;
  headerActions?: ReactNode;
  headerExtra?: ReactNode;
  headerClassName?: string;
  closeLabel: string;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  widthClassName?: string;
  closeOnEscape?: boolean;
  guardComposingEscape?: boolean;
  contentDataAttributes?: Record<string, string | undefined>;
  onContentKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function ReaderSheet({
  open,
  onClose,
  title,
  titleAddon,
  subtitle,
  srDescription,
  headerActions,
  headerExtra,
  headerClassName = 'reader-panel-header',
  closeLabel,
  uiScheme,
  overlayContainer,
  widthClassName = 'sm:w-[480px]',
  closeOnEscape = true,
  guardComposingEscape = false,
  contentDataAttributes,
  onContentKeyDown,
  children,
}: ReaderSheetProps) {
  useComposingEscapeGuard(open && guardComposingEscape);

  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);

  return (
    <Drawer.Root
      opened={open}
      onClose={onClose}
      position="bottom"
      size="auto"
      returnFocus={false}
      closeOnEscape={closeOnEscape}
      portalProps={{ target: overlayContainer ?? undefined }}
      classNames={{
        inner:
          'items-end justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]',
        content: cn(
          'reader-panel flex max-h-[min(42rem,calc(100svh-1.5rem))] w-full flex-col overflow-hidden rounded-[22px] border p-0 sm:max-h-[min(78svh,42rem)] sm:max-w-[calc(100vw-2rem)]',
          widthClassName,
        ),
      }}
      styles={{
        content: {
          ...panelThemeVars,
          flex: '0 1 auto',
          height: 'auto',
          background: uiScheme.cardBg,
          borderColor: surface.border,
          color: surface.fg,
          boxShadow: 'var(--paper-shadow-floating), inset 0 1px 0 var(--paper-highlight-top)',
        },
      }}
    >
      <Drawer.Overlay backgroundOpacity={0.36} blur={3} />
      <Drawer.Content data-reader-interactive="true" {...contentDataAttributes}>
        <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onContentKeyDown}>
          <div aria-hidden="true" className="flex shrink-0 justify-center pt-2.5 pb-0.5">
            <span className="reader-sheet-handle" />
          </div>
          <div className={cn('shrink-0 bg-transparent px-4 pt-2 pb-3.5 sm:px-6', headerClassName)}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Drawer.Title
                    className="font-heading text-lg font-medium leading-tight"
                    style={{ color: surface.fg }}
                  >
                    {title}
                  </Drawer.Title>
                  {titleAddon}
                </div>
                {srDescription ? <p className="sr-only">{srDescription}</p> : null}
                {subtitle}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {headerActions}
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={onClose}
                  className="reader-panel-icon"
                  aria-label={closeLabel}
                  title="关闭"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                </ActionIcon>
              </div>
            </div>
            {headerExtra}
          </div>

          {children}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

export interface ReaderEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  uiScheme: ThemeColors;
  descriptionWidthClassName?: string;
  paddingClassName?: string;
  iconTone?: 'muted' | 'fg';
  action?: ReactNode;
}

export function ReaderEmptyState({
  icon,
  title,
  description,
  uiScheme,
  descriptionWidthClassName = 'max-w-[16rem]',
  paddingClassName = 'py-14',
  iconTone = 'fg',
  action,
}: ReaderEmptyStateProps) {
  const surface = getModernReaderSurface(uiScheme);

  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', paddingClassName)}>
      <div
        className="mb-3 flex size-10 items-center justify-center rounded-xl border"
        style={{
          borderColor: surface.hairline,
          background: 'color-mix(in srgb, var(--reader-panel-hover) 62%, transparent)',
          color: iconTone === 'muted' ? surface.muted : surface.fg,
        }}
      >
        {icon}
      </div>
      <p className="text-sm font-medium tracking-tight" style={{ color: surface.fg }}>
        {title}
      </p>
      <p
        className={cn('mt-1.5 text-xs leading-5', descriptionWidthClassName)}
        style={{ color: surface.muted }}
      >
        {description}
      </p>
      {action}
    </div>
  );
}
