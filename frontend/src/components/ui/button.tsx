"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent text-[14px] font-semibold whitespace-nowrap outline-none transition-all duration-200 select-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_10px_24px_-18px_var(--paper-shadow)] hover:opacity-92",
        outline:
          "border-border/65 bg-card/80 hover:bg-secondary hover:border-border shadow-[inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_35%,transparent)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:opacity-85",
        ghost:
          "hover:bg-secondary/80 hover:text-foreground",
        destructive:
          // Explicit CSS var so text stays light even if theme token generation misses a class.
          "bg-destructive text-[color:var(--destructive-foreground)] shadow-[0_10px_24px_-18px_color-mix(in_srgb,var(--destructive)_45%,transparent)] hover:opacity-92",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 px-5 gap-2.5",
        xs: "h-8 px-3 text-xs gap-1.5",
        sm: "h-9 px-4 text-[13px] gap-2",
        lg: "h-13 px-8 text-base gap-3",
        icon: "size-11",
        "icon-xs": "size-8",
        "icon-sm": "size-9",
        "icon-lg": "size-13",
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
