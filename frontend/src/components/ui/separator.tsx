"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--border)_88%,transparent),transparent)] data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch data-vertical:bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--border)_88%,transparent),transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
