'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ActionIcon, UnstyledButton } from '@mantine/core';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TTSControlsProps } from '@/components/TTSControls';

const TTSControls = dynamic(() => import('@/components/TTSControls')
  .then((module) => module.TTSControls));

export function DeferredTTSControls({
  onRequest,
  ...props
}: TTSControlsProps & { onRequest: () => void }) {
  const [requested, setRequested] = useState(false);
  if (requested) return <TTSControls {...props} initialExpanded />;

  const label = props.state === 'stopped' ? '朗读控制' : '朗读控制（正在播放）';
  const handleClick = () => {
    onRequest();
    setRequested(true);
  };

  if (props.triggerContent) {
    return (
      <UnstyledButton
        type="button"
        data-reader-interactive="true"
        data-reader-tts-trigger="true"
        title={label}
        aria-label={label}
        aria-expanded={false}
        aria-haspopup="dialog"
        className={props.triggerClassName}
        style={props.triggerStyle}
        onClick={handleClick}
      >
        {props.triggerContent}
      </UnstyledButton>
    );
  }

  return (
    <ActionIcon
      type="button"
      variant="subtle"
      size={36}
      radius="md"
      data-reader-interactive="true"
      data-reader-tts-trigger="true"
      title={label}
      aria-label={label}
      aria-expanded={false}
      aria-haspopup="dialog"
      className={cn('min-h-0 min-w-0', props.triggerClassName)}
      style={props.triggerStyle}
      onClick={handleClick}
    >
      <Volume2 className="relative z-10 h-4 w-4" />
    </ActionIcon>
  );
}
