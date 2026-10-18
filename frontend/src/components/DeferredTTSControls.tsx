'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  return (
    <Button
      type="button"
      variant="ghost"
      size={props.triggerContent ? 'sm' : 'icon'}
      data-reader-interactive="true"
      data-reader-tts-trigger="true"
      title={label}
      aria-label={label}
      aria-expanded={false}
      aria-haspopup="dialog"
      className={props.triggerClassName}
      style={props.triggerStyle}
      onClick={() => {
        onRequest();
        setRequested(true);
      }}
    >
      {props.triggerContent ?? <Volume2 className="relative z-10 h-4 w-4" />}
    </Button>
  );
}
