"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Bell, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlobalSearch } from "./global-search"

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <header
        className="h-[72px] border-b flex items-center justify-between px-6 shrink-0 sticky top-0 z-10"
        style={{
          background: "linear-gradient(180deg, hsl(222 47% 9% / 0.94), hsl(222 47% 8% / 0.84))",
          borderColor: "var(--color-border)",
          backdropFilter: "blur(18px)",
        }}
        >
        <div className="min-w-0">
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 mt-1 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="relative hidden md:flex items-center gap-2 w-64 h-10 px-4 rounded-xl border border-white/8 bg-white/[0.04] text-xs text-slate-500 hover:border-slate-500 transition-colors"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            搜索商品、店铺...
          </button>
          <button
            onClick={() => router.push("/operations/agent")}
            className="flex items-center gap-2 text-xs text-slate-300 bg-white/[0.04] border border-white/8 px-3.5 py-2 rounded-xl hover:bg-white/[0.08] transition-colors"
          >
            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
            任务中心
          </button>
          <button
            onClick={() => router.push("/operations/agent")}
            className="relative p-2.5 rounded-xl border border-white/6 bg-white/[0.03] hover:bg-[var(--color-accent)] transition-colors"
            title="查看任务通知"
          >
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
          </button>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/operations/agent")}>
            <Plus className="w-3.5 h-3.5" />
            发起任务
          </Button>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
