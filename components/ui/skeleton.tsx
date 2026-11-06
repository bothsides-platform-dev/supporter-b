import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("motion-safe:animate-pulse rounded-md bg-[var(--md-sys-color-surface-container-high)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
