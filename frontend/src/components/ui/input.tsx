import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-xl border border-border/60 bg-card/70 px-4 py-2 text-[14px] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_35%,transparent)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow,background-color] focus-visible:border-primary/50 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/12 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
