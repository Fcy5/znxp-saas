import { cn } from "@/lib/utils"
import { forwardRef } from "react"

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg px-3 py-1 text-sm transition-colors duration-150",
        "bg-[var(--color-secondary)] border border-[var(--color-border)]",
        "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
        "focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"
