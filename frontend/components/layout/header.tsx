"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Bell, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlobalSearch } from "./global-search"

export function Header({ title }: { title: string }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const router = useRouter()

  return (
    <>
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
          <button
            onClick={() => setSearchOpen(true)}
            className="relative hidden md:flex items-center gap-2 w-56 h-8 px-3 rounded-lg border border-border bg-transparent text-xs text-slate-500 hover:border-slate-500 transition-colors"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            搜索商品、店铺...
          </button>
          <button
            onClick={() => router.push("/agent")}
            className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors"
          >
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            Agent 运行中
          </button>
          <button
            onClick={() => router.push("/agent")}
            className="relative p-2 rounded-lg hover:bg-[var(--color-accent)] transition-colors"
            title="查看任务通知"
          >
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
          </button>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/agent")}>
            <Plus className="w-3.5 h-3.5" />
            新建任务
          </Button>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
