"use client"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "destructive" | "outline"
  size?: "sm" | "md" | "lg" | "icon"
}

const variants = {
  default: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20",
  secondary: "bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
  ghost: "hover:bg-[var(--color-accent)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-[var(--color-border)] bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
}
const sizes = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-10 px-6 text-sm rounded-lg",
  icon: "h-9 w-9 rounded-lg",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = "Button"
