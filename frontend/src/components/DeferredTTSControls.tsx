'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ActionIcon, UnstyledButton } from '@mantine/core';
import { Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TTSControlsProps } from '@/components/TTSControls';

export function DeferredTTSControls({
  onRequest,
  runtimeReady = true,
  loadingContent,
  ...props
}: TTSControlsProps & {
  onRequest: () => void;
  runtimeReady?: boolean;
  loadingContent?: ReactNode;
}) {
  const [LoadedTTSControls, setLoadedTTSControls] =
    useState<ComponentType<TTSControlsProps> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (LoadedTTSControls && runtimeReady) {
    return <LoadedTTSControls {...props} initialExpanded />;
  }

  const isActive = props.state !== 'stopped';
  const label = isLoading
    ? '正在加载朗读控制'
    : isActive
      ? '朗读控制（正在播放）'
      : '朗读控制';

  const handleClick = () => {
    if (isLoading) return;
    onRequest();
    setIsLoading(true);
    void import('@/components/TTSControls')
      .then((module) => {
        if (!mountedRef.current) return;
        setLoadedTTSControls(() => module.TTSControls);
      })
      .catch(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
  };

  if (props.triggerContent) {
    return (
      <UnstyledButton
        type="button"
        disabled={isLoading}
        data-reader-interactive="true"
        data-reader-tts-trigger="true"
        data-reader-tts-active={isActive ? 'true' : undefined}
        title={isLoading ? '正在加载朗读控制…' : label}
        aria-label={label}
        aria-busy={isLoading || undefined}
        aria-expanded={false}
        aria-haspopup="dialog"
        className={props.triggerClassName}
        style={props.triggerStyle}
        onClick={handleClick}
      >
        {isLoading ? (
          loadingContent ?? (
            <>
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>加载中…</span>
            </>
          )
        ) : (
          props.triggerContent
        )}
      </UnstyledButton>
    );
  }

  return (
    <ActionIcon
      type="button"
      variant="subtle"
      size={44}
      radius="md"
      disabled={isLoading}
      data-reader-interactive="true"
      data-reader-tts-trigger="true"
      data-reader-tts-active={isActive ? 'true' : undefined}
      title={isLoading ? '正在加载朗读控制…' : label}
      aria-label={label}
      aria-busy={isLoading || undefined}
      aria-expanded={false}
      aria-haspopup="dialog"
      className={cn('min-h-0 min-w-0', props.triggerClassName)}
      style={props.triggerStyle}
      onClick={handleClick}
    >
      {isLoading ? (
        <Loader2
          className="relative z-10 h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <Volume2 className="relative z-10 h-4 w-4" aria-hidden="true" />
      )}
    </ActionIcon>
  );
}
