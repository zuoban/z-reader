"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ children, render, ...props }: SheetPrimitive.Trigger.Props) {
  return (
    <SheetPrimitive.Trigger 
      data-slot="sheet-trigger"
      render={render}
      {...props}
    >
      {children}
    </SheetPrimitive.Trigger>
  )
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "paper-motion-veil fixed inset-0 z-50 bg-black/50 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:duration-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  finalFocus = false,
  container,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  finalFocus?: boolean
  container?: SheetPrimitive.Portal.Props["container"]
}) {
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        finalFocus={finalFocus}
        className={cn(
          "paper-motion-sheet paper-panel paper-stack fixed z-50 flex max-h-[100svh] flex-col gap-0 overflow-hidden bg-clip-padding text-sm text-popover-foreground outline-none ring-1 ring-black/5 motion-reduce:duration-0 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:max-h-[min(92svh,48rem)] data-[side=bottom]:rounded-t-[1.75rem] data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-10 data-[side=bottom]:data-starting-style:translate-y-10 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-[100svh] data-[side=left]:w-full data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2rem] data-[side=left]:data-starting-style:translate-x-[-2rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-[100svh] data-[side=right]:w-full data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2rem] data-[side=right]:data-starting-style:translate-x-[2rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:max-h-[min(92svh,48rem)] data-[side=top]:rounded-b-[1.75rem] data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2rem] data-[side=top]:data-starting-style:translate-y-[-2rem] data-[side=left]:sm:bottom-3 data-[side=left]:sm:top-3 data-[side=left]:sm:h-auto data-[side=left]:sm:max-w-md data-[side=left]:sm:rounded-r-[1.75rem] data-[side=left]:sm:border data-[side=right]:sm:bottom-3 data-[side=right]:sm:right-3 data-[side=right]:sm:top-3 data-[side=right]:sm:h-auto data-[side=right]:sm:max-w-md data-[side=right]:sm:rounded-[1.75rem] data-[side=right]:sm:border data-[side=top]:sm:left-1/2 data-[side=top]:sm:max-w-2xl data-[side=top]:sm:-translate-x-1/2 data-[side=bottom]:sm:left-1/2 data-[side=bottom]:sm:max-w-2xl data-[side=bottom]:sm:-translate-x-1/2 data-[side=bottom]:sm:rounded-[1.75rem]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="paper-motion-interactive paper-control absolute right-[max(0.75rem,env(safe-area-inset-right,0px))] top-[max(0.75rem,env(safe-area-inset-top,0px))] h-9 w-9 rounded-full text-muted-foreground hover:scale-[1.03] hover:text-foreground hover:shadow-md"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-col gap-1.5 border-b border-border/60 bg-card px-5 py-4 pr-14",
        className
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2 border-t border-border/60 bg-muted p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-semibold leading-tight tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
