"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap outline-none transition-[background-color,border-color,color,opacity,transform] duration-150 select-none cursor-pointer active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--paper-shadow-control)] hover:bg-[var(--primary-hover)]",
        outline:
          "border-border bg-card shadow-[var(--paper-shadow-control)] hover:border-input hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-secondary/80 hover:text-foreground",
        destructive:
          // Explicit CSS var so text stays light even if theme token generation misses a class.
          "bg-destructive text-[color:var(--destructive-foreground)] hover:opacity-92",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default:
          "h-11 px-4 gap-2 sm:h-9 sm:px-3.5",
        xs: "h-8 px-2.5 text-xs gap-1.5",
        sm: "h-9 px-3 text-[13px] gap-1.5 sm:h-8",
        lg: "h-11 px-5 text-sm gap-2 sm:h-10",
        icon: "size-11 sm:size-9",
        "icon-xs": "size-8",
        "icon-sm": "size-9 sm:size-8",
        "icon-lg": "size-11 sm:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
