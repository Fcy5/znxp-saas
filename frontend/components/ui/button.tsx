"use client"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "destructive" | "outline"
  size?: "sm" | "md" | "lg" | "icon"
}

const variants = {
  default: "bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_52%,#1d4ed8_100%)] text-white hover:brightness-110 shadow-[0_14px_36px_rgba(37,99,235,0.28)]",
  secondary: "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
  ghost: "hover:bg-[var(--color-accent)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
  destructive: "bg-[linear-gradient(135deg,#ef4444,#dc2626)] text-white hover:brightness-110",
  outline: "border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
}
const sizes = {
  sm: "h-8 px-3 text-xs rounded-xl",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-11 px-6 text-sm rounded-xl",
  icon: "h-10 w-10 rounded-xl",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = "Button"
