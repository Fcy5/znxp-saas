import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  color?: string
}

export function Progress({ value = 0, color = "bg-blue-500", className, ...props }: ProgressProps) {
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-secondary)]", className)} {...props}>
      <div
        className={cn("h-full transition-all duration-500 rounded-full", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
