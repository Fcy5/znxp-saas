"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

interface SystemNavItem {
  href: string
  label: string
}

interface SystemNavProps {
  backHref?: string
  backLabel?: string
  items: SystemNavItem[]
}

export function SystemNav({ backHref = "/control-center", backLabel = "中控台", items }: SystemNavProps) {
  const pathname = usePathname()

  return (
    <div className="border-b border-border/80 bg-background/70 px-6 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-4 overflow-x-auto">
        <Link href={backHref} className="shrink-0 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          {backLabel}
        </Link>
        <div className="h-4 w-px bg-border shrink-0" />
        <div className="flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(37,99,235,0.22)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
