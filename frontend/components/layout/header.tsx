"use client"
import { Search, Bell, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function Header({ title }: { title: string }) {
  return (
    <header
      className="h-16 border-b flex items-center justify-between px-6 shrink-0 sticky top-0 z-10"
      style={{
        background: "hsl(222 47% 9% / 0.85)",
        borderColor: "var(--color-border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <h1 className="text-lg font-semibold text-white">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input className="pl-9 w-56 h-8 text-xs" placeholder="搜索商品、店铺..." />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Agent 运行中
        </div>
        <button className="relative p-2 rounded-lg hover:bg-[var(--color-accent)] transition-colors">
          <Bell className="w-4 h-4 text-slate-400" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
        </button>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          新建任务
        </Button>
      </div>
    </header>
  )
}
