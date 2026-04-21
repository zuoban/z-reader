import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-[linear-gradient(90deg,color-mix(in_srgb,var(--muted)_88%,transparent)_0%,color-mix(in_srgb,white_36%,var(--muted)_64%)_50%,color-mix(in_srgb,var(--muted)_88%,transparent)_100%)] bg-[length:200%_100%] animate-[paperShimmer_2.1s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
