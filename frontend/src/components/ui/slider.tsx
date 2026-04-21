'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'paper-motion-surface relative flex w-full touch-none select-none items-center',
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="paper-field relative h-2 w-full grow overflow-hidden rounded-full border border-border/60 bg-muted/50 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_70%,transparent)]">
      <SliderPrimitive.Range className="paper-motion-progress absolute h-full rounded-full bg-[linear-gradient(90deg,var(--primary),color-mix(in_srgb,var(--primary)_72%,white_28%))]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="paper-motion-interactive paper-control block h-[18px] w-[18px] rounded-full border border-primary/45 bg-background shadow-[0_10px_18px_-14px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_78%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:scale-105 disabled:pointer-events-none disabled:opacity-50 hover:scale-110 active:scale-105" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
